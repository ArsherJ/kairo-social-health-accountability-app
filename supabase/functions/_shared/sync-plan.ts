/**
 * The decision-making half of `sync-health`, kept free of I/O so it can be
 * tested in plain Node with no Deno, no Docker and no database.
 *
 * The handler does the reads and writes; everything that decides *what* to
 * write lives here.
 */

import {
  computeDay,
  evaluateStepBurst,
  type CoreStat,
  type DayStatus,
  type HourBucket,
  type SabotageEvent,
} from './core.ts';

/** One hour of health data as the client reports it. */
export interface IncomingBucket {
  localDate: string;
  hour: number;
  steps: number;
  distanceM: number;
  activeKcal: number;
  activeMinutes: number;
  /** HealthKit logged a workout overlapping this hour. */
  hadWorkout?: boolean;
  /** A wearable reported elevated heart rate during this hour. */
  elevatedHeartRate?: boolean;
}

export interface IncomingSleep {
  localDate: string;
  minutes: number;
}

export interface SyncRequest {
  timezone: string;
  buckets: IncomingBucket[];
  sleep?: IncomingSleep[];
}

export type ValidationResult =
  | { ok: true; value: SyncRequest }
  | { ok: false; error: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hard ceiling on payload size. Background delivery fires at most hourly, and
 * a full backfill of a fortnight is 336 buckets, so this is generous while
 * still bounding what one request can cost.
 */
export const MAX_BUCKETS_PER_SYNC = 750;

/** Rejects anything a legitimate client would never send. */
export function validateSyncRequest(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'body must be an object' };
  }
  const raw = body as Record<string, unknown>;

  if (typeof raw['timezone'] !== 'string' || raw['timezone'].length === 0) {
    return { ok: false, error: 'timezone is required' };
  }
  // A bogus zone would silently shift every day boundary for this user, so the
  // day math has to reject it rather than fall back to UTC.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw['timezone'] });
  } catch {
    return { ok: false, error: `unknown timezone: ${raw['timezone']}` };
  }

  if (!Array.isArray(raw['buckets'])) {
    return { ok: false, error: 'buckets must be an array' };
  }
  if (raw['buckets'].length > MAX_BUCKETS_PER_SYNC) {
    return {
      ok: false,
      error: `too many buckets (max ${MAX_BUCKETS_PER_SYNC})`,
    };
  }

  const buckets: IncomingBucket[] = [];
  for (const entry of raw['buckets']) {
    const parsed = parseBucket(entry);
    if (!parsed.ok) return parsed;
    buckets.push(parsed.value);
  }

  const sleep: IncomingSleep[] = [];
  if (raw['sleep'] !== undefined) {
    if (!Array.isArray(raw['sleep'])) {
      return { ok: false, error: 'sleep must be an array' };
    }
    for (const entry of raw['sleep']) {
      const parsed = parseSleep(entry);
      if (!parsed.ok) return parsed;
      sleep.push(parsed.value);
    }
  }

  return { ok: true, value: { timezone: raw['timezone'], buckets, sleep } };
}

function nonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseBucket(
  entry: unknown,
): { ok: true; value: IncomingBucket } | { ok: false; error: string } {
  if (typeof entry !== 'object' || entry === null) {
    return { ok: false, error: 'each bucket must be an object' };
  }
  const b = entry as Record<string, unknown>;

  if (typeof b['localDate'] !== 'string' || !DATE_PATTERN.test(b['localDate'])) {
    return { ok: false, error: 'bucket.localDate must be YYYY-MM-DD' };
  }
  if (
    typeof b['hour'] !== 'number' ||
    !Number.isInteger(b['hour']) ||
    b['hour'] < 0 ||
    b['hour'] > 23
  ) {
    return { ok: false, error: 'bucket.hour must be an integer 0-23' };
  }
  for (const field of ['steps', 'distanceM', 'activeKcal', 'activeMinutes']) {
    if (!nonNegative(b[field])) {
      return { ok: false, error: `bucket.${field} must be a non-negative number` };
    }
  }
  // The column is constrained to 60; clamping here turns a rounding artefact
  // in HealthKit's aggregation into a no-op instead of a failed sync.
  const activeMinutes = Math.min(b['activeMinutes'] as number, 60);

  return {
    ok: true,
    value: {
      localDate: b['localDate'],
      hour: b['hour'],
      steps: Math.round(b['steps'] as number),
      distanceM: b['distanceM'] as number,
      activeKcal: b['activeKcal'] as number,
      activeMinutes,
      hadWorkout: b['hadWorkout'] === true,
      elevatedHeartRate: b['elevatedHeartRate'] === true,
    },
  };
}

function parseSleep(
  entry: unknown,
): { ok: true; value: IncomingSleep } | { ok: false; error: string } {
  if (typeof entry !== 'object' || entry === null) {
    return { ok: false, error: 'each sleep entry must be an object' };
  }
  const s = entry as Record<string, unknown>;
  if (typeof s['localDate'] !== 'string' || !DATE_PATTERN.test(s['localDate'])) {
    return { ok: false, error: 'sleep.localDate must be YYYY-MM-DD' };
  }
  if (
    !nonNegative(s['minutes']) ||
    !Number.isInteger(s['minutes']) ||
    (s['minutes'] as number) > 1440
  ) {
    return { ok: false, error: 'sleep.minutes must be an integer 0-1440' };
  }
  return { ok: true, value: { localDate: s['localDate'], minutes: s['minutes'] } };
}

/** Distinct local dates touched by a payload, sorted for stable processing. */
export function affectedDates(request: SyncRequest): string[] {
  const dates = new Set<string>();
  for (const b of request.buckets) dates.add(b.localDate);
  for (const s of request.sleep ?? []) dates.add(s.localDate);
  return [...dates].sort();
}

/**
 * Anti-cheat over the canonical hourly data rather than a client-reported
 * burst — a lying client cannot simply omit the evidence.
 *
 * One hour is six ten-minute windows, so the 1,500-steps-per-10-minutes
 * threshold becomes roughly 9,000 steps in an hour before anything is even
 * considered suspicious.
 */
export function isDayFlagged(buckets: readonly HourBucket[], extras: {
  hadWorkout: ReadonlySet<number>;
  elevatedHeartRate: ReadonlySet<number>;
}): boolean {
  const HOUR_MS = 60 * 60 * 1000;
  return buckets.some((bucket) =>
    evaluateStepBurst({
      steps: bucket.steps,
      windowMs: HOUR_MS,
      distanceM: bucket.distanceM,
      hadWorkout: extras.hadWorkout.has(bucket.hour),
      elevatedHeartRate: extras.elevatedHeartRate.has(bucket.hour),
    }).flagged,
  );
}

export interface DayPlanInput {
  userId: string;
  localDate: string;
  timeZone: string;
  now: Date;
  /** Every bucket for this date after merging the incoming payload. */
  buckets: HourBucket[];
  hadWorkoutHours: ReadonlySet<number>;
  elevatedHeartRateHours: ReadonlySet<number>;
  sleepMinutes: number | null;
  sabotageEvents: readonly SabotageEvent[];
  /** Status already stored for this date, if any. */
  existingStatus: DayStatus | null;
}

/** The row `sync-health` will upsert into daily_scores. */
export interface DayScoreRow {
  user_id: string;
  local_date: string;
  agi_points: number;
  str_points: number;
  end_points: number;
  vit_points: number;
  rec_points: number;
  consistency_points: number;
  sabotage_delta: number;
  total: number;
  tiers: Record<CoreStat, string>;
  contributing_stats: number;
  has_rec: boolean;
  featured_stat: CoreStat | null;
  xp_awarded: number;
  flagged: boolean;
  status: DayStatus;
  finalized_at: string | null;
}

export interface DayPlan {
  row: DayScoreRow;
  /**
   * True when the day was already finalized. The competition is over, so
   * ranking columns are preserved and only XP moves (§19). The handler uses
   * this to pick which columns to write.
   */
  frozen: boolean;
}

/**
 * Score one day.
 *
 * The §19 backfill rule lives here: a user whose phone died for three days
 * still earns XP and keeps their streak when the data finally arrives, but
 * cannot retroactively change a leaderboard that already settled. Sync luck
 * must never punish real activity, and it must never rewrite a finished
 * competition either.
 */
export function planDay(input: DayPlanInput): DayPlan {
  const result = computeDay({
    userId: input.userId,
    localDate: input.localDate,
    timeZone: input.timeZone,
    now: input.now,
    buckets: input.buckets,
    sabotageEvents: input.sabotageEvents,
    sleepMinutes: input.sleepMinutes,
  });

  const frozen = input.existingStatus === 'final';
  const flagged = isDayFlagged(input.buckets, {
    hadWorkout: input.hadWorkoutHours,
    elevatedHeartRate: input.elevatedHeartRateHours,
  });

  const { score } = result;

  return {
    frozen,
    row: {
      user_id: input.userId,
      local_date: input.localDate,
      agi_points: score.stats.AGI.points,
      str_points: score.stats.STR.points,
      end_points: score.stats.END.points,
      vit_points: score.stats.VIT.points,
      rec_points: score.recBonus,
      consistency_points: score.consistencyBonus,
      sabotage_delta: result.sabotageDelta,
      total: result.total,
      tiers: {
        AGI: score.stats.AGI.tier,
        STR: score.stats.STR.tier,
        END: score.stats.END.tier,
        VIT: score.stats.VIT.tier,
      },
      contributing_stats: score.contributingStats,
      has_rec: score.hasRec,
      featured_stat: score.featuredStat,
      xp_awarded: score.xp,
      flagged,
      // Syncing never finalizes a day, even when the grace window has passed.
      // Only the finalize-days cron may do that, so exactly one place decides
      // a competition is over and awards coins for it.
      status: frozen ? 'final' : 'provisional',
      finalized_at: null,
    },
  };
}

/** Columns written for a day whose competition has already settled. */
export function frozenUpdateColumns(row: DayScoreRow): Pick<
  DayScoreRow,
  'xp_awarded' | 'flagged'
> {
  return { xp_awarded: row.xp_awarded, flagged: row.flagged };
}

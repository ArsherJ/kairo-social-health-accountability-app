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
  /**
   * Hourly average bpm. **Null or absent means not measured, never resting** —
   * `computeStrain()` skips a null hour rather than crediting it as rest, so a
   * watch left on the charger does not read as an afternoon of recovery.
   * Display only: nothing here reaches `daily_scores`.
   */
  avgHeartRate?: number | null;
}

export interface IncomingSleep {
  localDate: string;
  minutes: number;
}

/** Apple's own per-day resting rate. Wearable users only; absent is normal. */
export interface IncomingRestingHeartRate {
  localDate: string;
  bpm: number;
}

/**
 * One logged workout, as the client reports it.
 *
 * `activityType` is Apple's HKWorkoutActivityType **raw value**, stored
 * untranslated — which numbers mean something is decided in
 * `challenge.ts`, not here and not in the client's `read.ts`.
 */
export interface IncomingWorkoutSession {
  hkUuid: string;
  localDate: string;
  startedAt: string;
  endedAt: string;
  activityType: number;
  durationS: number;
  distanceM: number;
  activeKcal: number;
}

export interface SyncRequest {
  timezone: string;
  buckets: IncomingBucket[];
  sleep?: IncomingSleep[];
  restingHeartRate?: IncomingRestingHeartRate[];
  sessions?: IncomingWorkoutSession[];
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

/**
 * The same idea for workout sessions, sized to the same window.
 *
 * A fortnight of buckets is 336; a fortnight of *workouts* is a handful for
 * anyone real. 200 is generous enough that a heavy backfill still lands while
 * still bounding what one request can cost.
 */
export const MAX_SESSIONS_PER_SYNC = 200;

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

  const restingHeartRate: IncomingRestingHeartRate[] = [];
  if (raw['restingHeartRate'] !== undefined) {
    if (!Array.isArray(raw['restingHeartRate'])) {
      return { ok: false, error: 'restingHeartRate must be an array' };
    }
    for (const entry of raw['restingHeartRate']) {
      const parsed = parseRestingHeartRate(entry);
      if (!parsed.ok) return parsed;
      restingHeartRate.push(parsed.value);
    }
  }

  const sessions: IncomingWorkoutSession[] = [];
  if (raw['sessions'] !== undefined) {
    if (!Array.isArray(raw['sessions'])) {
      return { ok: false, error: 'sessions must be an array' };
    }
    if (raw['sessions'].length > MAX_SESSIONS_PER_SYNC) {
      return {
        ok: false,
        error: `too many sessions (max ${MAX_SESSIONS_PER_SYNC})`,
      };
    }
    for (const entry of raw['sessions']) {
      const parsed = parseSession(entry);
      if (!parsed.ok) return parsed;
      sessions.push(parsed.value);
    }
  }

  return {
    ok: true,
    value: { timezone: raw['timezone'], buckets, sleep, restingHeartRate, sessions },
  };
}

function parseSession(
  entry: unknown,
): { ok: true; value: IncomingWorkoutSession } | { ok: false; error: string } {
  if (typeof entry !== 'object' || entry === null) {
    return { ok: false, error: 'each session must be an object' };
  }
  const s = entry as Record<string, unknown>;

  // The primary key, so it is the one field with no salvageable failure mode.
  if (typeof s['hkUuid'] !== 'string' || s['hkUuid'].length === 0) {
    return { ok: false, error: 'session.hkUuid is required' };
  }
  if (typeof s['localDate'] !== 'string' || !DATE_PATTERN.test(s['localDate'])) {
    return { ok: false, error: 'session.localDate must be YYYY-MM-DD' };
  }

  for (const field of ['startedAt', 'endedAt']) {
    const value = s[field];
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
      return { ok: false, error: `session.${field} must be an ISO timestamp` };
    }
  }

  // A smallint column. Apple's raw values are small positive integers, and a
  // value outside the column's range would fail the insert rather than this
  // check — which would take the whole sync down, steps included.
  if (
    typeof s['activityType'] !== 'number' ||
    !Number.isInteger(s['activityType']) ||
    s['activityType'] < 0 ||
    s['activityType'] > 32_767
  ) {
    return { ok: false, error: 'session.activityType must be a small non-negative integer' };
  }

  for (const field of ['durationS', 'distanceM', 'activeKcal']) {
    if (!nonNegative(s[field])) {
      return { ok: false, error: `session.${field} must be a non-negative number` };
    }
  }

  return {
    ok: true,
    value: {
      hkUuid: s['hkUuid'],
      localDate: s['localDate'],
      startedAt: s['startedAt'] as string,
      endedAt: s['endedAt'] as string,
      activityType: s['activityType'],
      // `duration_s` is an integer column; the other two are numeric(10,2).
      durationS: Math.round(s['durationS'] as number),
      distanceM: round2(s['distanceM'] as number),
      activeKcal: round2(s['activeKcal'] as number),
    },
  };
}

/** Matches `numeric(10, 2)`, so the stored value is the value that was sent. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
      avgHeartRate: parseAvgHeartRate(b['avgHeartRate']),
    },
  };
}

/**
 * Anything that is not a plausible bpm becomes null.
 *
 * Rejecting the whole payload would be the wrong trade: heart rate is a display
 * extra, and failing a sync — which also carries the steps that decide the
 * user's standing — over an implausible bpm would let a cosmetic field break
 * scoring. The column's own CHECK is 20-250; matching it here means a bad value
 * is dropped rather than becoming a 500.
 */
function parseAvgHeartRate(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 20 || value > 250) return null;
  return Math.round(value * 10) / 10;
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

function parseRestingHeartRate(
  entry: unknown,
): { ok: true; value: IncomingRestingHeartRate } | { ok: false; error: string } {
  if (typeof entry !== 'object' || entry === null) {
    return { ok: false, error: 'each restingHeartRate entry must be an object' };
  }
  const r = entry as Record<string, unknown>;
  if (typeof r['localDate'] !== 'string' || !DATE_PATTERN.test(r['localDate'])) {
    return { ok: false, error: 'restingHeartRate.localDate must be YYYY-MM-DD' };
  }
  // Rejected rather than nulled, unlike the hourly average: a whole entry with
  // a nonsense bpm is a malformed entry, and there is no other field on it to
  // salvage.
  if (
    typeof r['bpm'] !== 'number' ||
    !Number.isFinite(r['bpm']) ||
    r['bpm'] < 20 ||
    r['bpm'] > 150
  ) {
    return { ok: false, error: 'restingHeartRate.bpm must be a number 20-150' };
  }
  return {
    ok: true,
    value: { localDate: r['localDate'], bpm: Math.round(r['bpm'] as number) },
  };
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
  /** Status already stored for this date, if any. */
  existingStatus: DayStatus | null;
}

/**
 * Whether this payload proves the user has a wearable.
 *
 * Capability is **observed from synced data, never asked** — an onboarding
 * question about hardware is a question people answer aspirationally, and it
 * would gate nothing useful. Sleep is the honest signal: an iPhone on its own
 * does not record it.
 *
 * Zero minutes does not count. It is indistinguishable from no data, and the
 * flag is sticky — a false positive is permanent, and it would light the 🔗
 * icon on the leaderboard for someone who has no wearable at all.
 */
export function observesWearable(request: SyncRequest): boolean {
  return (request.sleep ?? []).some((s) => s.minutes > 0);
}

/**
 * The row `sync-health` will upsert into daily_scores.
 *
 * `end_points`, `vit_points` and `rec_points` are gone from this shape as of
 * deviation #41's contract phase, while the columns themselves survive until
 * Phase 3 drops them. **That gap has a consequence worth stating**: an upsert
 * names only the columns it carries, so a rescored day keeps whatever those
 * three columns already held, and `squad_leaderboard()` still sums them. The
 * §4 deploy ordering is what closes it — the replay and the column drop land
 * together, before any board is read against a half-migrated row. Do not
 * deploy this shape ahead of that migration.
 */
export interface DayScoreRow {
  user_id: string;
  local_date: string;
  agi_points: number;
  str_points: number;
  mind_points: number;
  consistency_points: number;
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
    localDate: input.localDate,
    timeZone: input.timeZone,
    now: input.now,
    buckets: input.buckets,
    sleepMinutes: input.sleepMinutes,
    // Deviation #11: stored per-stat points are **base** — pre-multiplier and
    // program-independent. All weighting happens at read time in
    // squad_leaderboard(). Never pass a featuredStat from a write path.
    featuredStat: null,
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
      mind_points: score.stats.MND.points,
      consistency_points: score.consistencyBonus,
      total: result.total,
      tiers: {
        AGI: score.stats.AGI.tier,
        STR: score.stats.STR.tier,
        MND: score.stats.MND.tier,
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

/**
 * The decision-making half of `replay-scores`, kept free of I/O so it can be
 * tested in plain Node with no Deno, no Docker and no database.
 *
 * `replay-scores` is a one-off: it exists to rewrite every stored day into the
 * three-stat model (deviation #41) during the Phase 3 deploy window. The
 * handler does the reads and writes; everything that decides *what* a replay
 * touches, and what it leaves alone, lives here.
 *
 * **DORMANT since 2026-08-21.** The Phase 3 window ran and closed: the
 * function is deleted from the project and `REPLAY_SECRET` is unset, so an
 * invocation returns `404`. This file and its siblings were kept on purpose
 * rather than deleted with the deployment, because the next model migration
 * needs exactly this and rebuilding it under deploy pressure is how its two
 * hardest bugs come back — a lifecycle test that could not fail, and a fake
 * client that was blind to ordering.
 *
 * Nothing here is reachable without deploying the function *and* minting a
 * secret, both deliberate acts. Re-arming is steps 6a-6b of the Task 7
 * runbook. Do not delete these files on the strength of that runbook's
 * original step 11; it was superseded and says so.
 *
 * The thing this module exists to get right is the distinction between
 * *scoring* and *lifecycle*. A replay recomputes the first and must not move
 * the second: a day that finalized on 2026-08-14 is still a day that finalized
 * on 2026-08-14, whatever the engine now says it scored.
 */

import type { DayStatus } from './core.ts';
import type { DayScoreRow } from './sync-plan.ts';

/**
 * Every column the enumeration reads, as one constant.
 *
 * Deliberately a single string shared by the handler's PostgREST `.select()`
 * and the schema suite's SQL, the same arrangement `DAILY_SLEEP_SELECT` uses:
 * a column renamed on one side and not the other fails in PGlite rather than
 * halfway through a one-way deploy window.
 *
 * The `before` half of a dry run is read from here too, which is why the
 * scoring columns are present at all — the operator has to be able to see what
 * a day scored before agreeing to replace it.
 */
export const REPLAY_SCORE_COLUMNS = [
  'user_id',
  'local_date',
  'status',
  'finalized_at',
  'agi_points',
  'str_points',
  'mind_points',
  'consistency_points',
  'total',
  'normalization_factor',
  'contributing_stats',
  'xp_awarded',
] as const;

export const REPLAY_SCORE_SELECT = REPLAY_SCORE_COLUMNS.join(', ');

/** The timezone lookup. Every player's day is theirs, midnight to midnight (§2). */
export const REPLAY_PROFILE_COLUMNS = ['id', 'timezone'] as const;

export const REPLAY_PROFILE_SELECT = REPLAY_PROFILE_COLUMNS.join(', ');

/** One stored day as the enumeration sees it, before anything is recomputed. */
export interface ReplayScoreRow {
  user_id: string;
  local_date: string;
  status: DayStatus;
  finalized_at: string | null;
  agi_points: number | string;
  str_points: number | string;
  mind_points: number | string;
  consistency_points: number | string;
  total: number | string;
  normalization_factor: number | string;
  contributing_stats: number | string;
  xp_awarded: number | string;
}

export interface ReplayProfileRow {
  id: string;
  timezone: string;
}

/** A day the replay will recompute, with the zone its boundaries are in. */
export interface ReplayCandidate {
  userId: string;
  localDate: string;
  status: DayStatus;
  finalizedAt: string | null;
  timeZone: string;
  before: ReplayScoreRow;
}

/** The scoring figures a dry run prints, on both sides of the arrow. */
export interface ReplayFigures {
  agiPoints: number;
  strPoints: number;
  mindPoints: number;
  consistencyPoints: number;
  total: number;
  normalizationFactor: number;
  contributingStats: number;
  xpAwarded: number;
}

/** numeric columns arrive as strings over PostgREST; smallints as numbers. */
function num(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

export function figuresFromStored(row: ReplayScoreRow): ReplayFigures {
  return {
    agiPoints: num(row.agi_points),
    strPoints: num(row.str_points),
    mindPoints: num(row.mind_points),
    consistencyPoints: num(row.consistency_points),
    total: num(row.total),
    normalizationFactor: num(row.normalization_factor),
    contributingStats: num(row.contributing_stats),
    xpAwarded: num(row.xp_awarded),
  };
}

export function figuresFromPlanned(row: DayScoreRow): ReplayFigures {
  return {
    agiPoints: row.agi_points,
    strPoints: row.str_points,
    mindPoints: row.mind_points,
    consistencyPoints: row.consistency_points,
    total: row.total,
    normalizationFactor: row.normalization_factor,
    contributingStats: row.contributing_stats,
    xpAwarded: row.xp_awarded,
  };
}

export function figuresDiffer(a: ReplayFigures, b: ReplayFigures): boolean {
  return (
    a.agiPoints !== b.agiPoints ||
    a.strPoints !== b.strPoints ||
    a.mindPoints !== b.mindPoints ||
    a.consistencyPoints !== b.consistencyPoints ||
    a.total !== b.total ||
    a.normalizationFactor !== b.normalizationFactor ||
    a.contributingStats !== b.contributingStats ||
    a.xpAwarded !== b.xpAwarded
  );
}

/**
 * Carry a stored day's lifecycle across a replay untouched.
 *
 * `planDay` always returns `finalized_at: null`, because on the two live write
 * paths only `finalize-days` may stamp it — so its raw row is *invalid* for a
 * final day: `daily_scores_finalized_at_present` checks
 * `(status = 'final') = (finalized_at is not null)` and a `final`/null pair
 * fails it. Upserting `plan.row` straight back is therefore the obvious
 * execution of "replay all history" and the one that aborts mid-window.
 *
 * The alternative an operator reaches for next — `rescoreDay(…, { finalize:
 * true })` — computes the right numbers and re-stamps `finalized_at` with the
 * replay's own clock, moving eight days' finalization to the afternoon of the
 * deploy. That is not a rescore, it is a rewrite of when the competition ended.
 *
 * So: the engine decides the scoring columns, the stored row keeps the
 * lifecycle. A row with no stored predecessor cannot occur here (the
 * enumeration reads `daily_scores` itself) but is handled rather than assumed —
 * it takes the plan's own status and no timestamp.
 */
export function replayLifecycle(
  planned: DayScoreRow,
  existing: { status: DayStatus | null; finalizedAt: string | null },
): DayScoreRow {
  return {
    ...planned,
    status: existing.status ?? planned.status,
    finalized_at: existing.finalizedAt,
  };
}

/**
 * The secret guard.
 *
 * `finalize-days` skips its check when `CRON_SECRET` is unset, which is the
 * right default for a job whose worst case is a day closing early. It is the
 * wrong default here: this function rewrites every score row in the project,
 * so an unset secret means *refuse*, never *allow*. And the secret is its own
 * — a leaked `CRON_SECRET` must not reach a replay.
 */
export function authorizeReplay(
  configured: string | undefined | null,
  provided: string | null,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!configured) {
    return {
      ok: false,
      status: 503,
      error: 'REPLAY_SECRET is not set; refusing to replay',
    };
  }
  if (provided !== configured) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  return { ok: true };
}

export interface ReplayRequest {
  /** Report what would be written and write nothing. Defaults to **true**. */
  dryRun: boolean;
  /** Replay one user only. Absent means every user. */
  userId: string | null;
  limit: number;
}

/**
 * Cap per invocation, so one run cannot exceed the function time limit.
 *
 * 500, matching `finalize-days`, and deliberately well under PostgREST's
 * `db-max-rows`: the enumeration asks for `limit + 1` to detect truncation, so
 * a cap at the server's own ceiling would swallow the probe and report a
 * truncated run as a complete one.
 */
export const MAX_DAYS_PER_REPLAY = 500;

/**
 * Read the request.
 *
 * `dryRun` defaults to **true** and has to be turned off explicitly. An empty
 * body is the shape a mis-typed curl produces, and the harmless reading of a
 * mis-typed curl is the one that reports rather than writes.
 */
export function parseReplayRequest(
  body: unknown,
): { ok: true; value: ReplayRequest } | { ok: false; error: string } {
  if (body === null || body === undefined) {
    return { ok: true, value: { dryRun: true, userId: null, limit: MAX_DAYS_PER_REPLAY } };
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be a JSON object' };
  }

  const raw = body as Record<string, unknown>;

  if (raw.dryRun !== undefined && typeof raw.dryRun !== 'boolean') {
    return { ok: false, error: 'dryRun must be a boolean' };
  }
  if (raw.userId !== undefined && raw.userId !== null && typeof raw.userId !== 'string') {
    return { ok: false, error: 'userId must be a string' };
  }
  if (raw.limit !== undefined) {
    if (typeof raw.limit !== 'number' || !Number.isInteger(raw.limit) || raw.limit < 1) {
      return { ok: false, error: 'limit must be a positive integer' };
    }
    if (raw.limit > MAX_DAYS_PER_REPLAY) {
      return { ok: false, error: `limit must be at most ${MAX_DAYS_PER_REPLAY}` };
    }
  }

  return {
    ok: true,
    value: {
      dryRun: raw.dryRun === undefined ? true : raw.dryRun,
      userId: typeof raw.userId === 'string' ? raw.userId : null,
      limit: typeof raw.limit === 'number' ? raw.limit : MAX_DAYS_PER_REPLAY,
    },
  };
}

/**
 * Pair each stored day with its owner's timezone.
 *
 * A day whose owner has no profile row cannot happen — `daily_scores.user_id`
 * references `profiles(id)` — and is still reported rather than defaulted. A
 * default zone would move the day's boundaries, which is the one thing a
 * replay must not do; being loudly unable to replay a row beats quietly
 * replaying it against the wrong midnight.
 */
export function pairCandidates(
  scoreRows: ReplayScoreRow[],
  profileRows: ReplayProfileRow[],
): {
  candidates: ReplayCandidate[];
  unresolved: Array<{ userId: string; localDate: string; error: string }>;
} {
  const zones = new Map(profileRows.map((p) => [p.id, p.timezone]));
  const candidates: ReplayCandidate[] = [];
  const unresolved: Array<{ userId: string; localDate: string; error: string }> = [];

  for (const row of scoreRows) {
    const timeZone = zones.get(row.user_id);
    if (timeZone === undefined) {
      unresolved.push({
        userId: row.user_id,
        localDate: row.local_date,
        error: 'no profile timezone',
      });
      continue;
    }
    candidates.push({
      userId: row.user_id,
      localDate: row.local_date,
      status: row.status,
      finalizedAt: row.finalized_at,
      timeZone,
      before: row,
    });
  }

  return { candidates, unresolved };
}

/** Distinct owners of the enumerated days, for the timezone lookup. */
export function ownersOf(scoreRows: ReplayScoreRow[]): string[] {
  return [...new Set(scoreRows.map((r) => r.user_id))];
}

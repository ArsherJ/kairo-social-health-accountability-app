import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import {
  figuresDiffer,
  figuresFromPlanned,
  figuresFromStored,
  ownersOf,
  pairCandidates,
  REPLAY_PROFILE_SELECT,
  REPLAY_SCORE_SELECT,
  type ReplayCandidate,
  type ReplayFigures,
  type ReplayProfileRow,
  type ReplayScoreRow,
} from './replay-plan.ts';
import { rescoreDay } from './rescore.deno.ts';

/**
 * The database half of `replay-scores`.
 *
 * Split from `replay-plan.ts` because it touches a Deno-only specifier, the
 * same seam `scoring-inputs.deno.ts` sits on. What is unusual here — and
 * deliberate — is that this file **is** exercised in Node, by
 * `replay.deno.test.ts` driving a fake PostgREST client. It can be, because
 * every `npm:` import in this file and in `rescore.deno.ts` is `import type`
 * and disappears at transform time; add a value import from `npm:` and that
 * test stops loading, loudly. That is the right tripwire to have, because the
 * two properties this module exists to guarantee — that the enumeration sees
 * **final** days, and that a replay does not re-stamp `finalized_at` — are
 * both properties of the query and the call, not of any pure function, and a
 * test that could not reach them would be testing something else.
 */
export interface ReplayDayReport {
  userId: string;
  localDate: string;
  /** Unchanged by the replay, by construction. Printed so that is visible. */
  status: string;
  finalizedAt: string | null;
  before: ReplayFigures;
  after: ReplayFigures;
  changed: boolean;
}

export interface ReplayReport {
  ranAt: string;
  dryRun: boolean;
  scanned: number;
  replayed: number;
  changed: number;
  days: ReplayDayReport[];
  failures: Array<{ userId: string; localDate: string; error: string }>;
  truncated: boolean;
}

/**
 * Recompute every stored day through `rescoreDay`.
 *
 * Enumeration is **unfiltered on status**, which is the whole reason this
 * function exists. `finalize-days` reaches days through `finalizable_days()`,
 * which filters `status = 'provisional'`; running a replay through that path
 * rewrites the provisional day and leaves every historical one describing the
 * retired model — including, on 2026-08-20, both rows carrying
 * `contributing_stats = 4`, which is exactly what the contract migration's
 * `validate constraint` aborts on.
 *
 * Idempotent, like every other write path here: scores are replayed from
 * stored `health_buckets`, never adjusted in place, so a second run converges
 * on the same rows. Nothing about that changes when the day is final — the
 * lifecycle columns are carried across rather than recomputed.
 *
 * One bad row must not abort the run: failures are collected per day and
 * reported, following `finalize-days`.
 */
export async function replayScores(
  admin: SupabaseClient,
  args: { now: Date; dryRun: boolean; userId: string | null; limit: number },
): Promise<ReplayReport | { error: string }> {
  const { now, dryRun, limit } = args;

  // One past the limit, so a truncated run says so rather than looking
  // complete. The order makes the truncation point deterministic.
  let query = admin.from('daily_scores').select(REPLAY_SCORE_SELECT);
  // The only filter this query may ever carry. **Not** on `status`: see above.
  if (args.userId) query = query.eq('user_id', args.userId);

  const { data: scoreData, error: scoreError } = await query
    .order('user_id', { ascending: true })
    .order('local_date', { ascending: true })
    .limit(limit + 1);
  if (scoreError) return { error: `score enumeration failed: ${scoreError.message}` };

  const all = (scoreData ?? []) as unknown as ReplayScoreRow[];
  const truncated = all.length > limit;
  const scoreRows = truncated ? all.slice(0, limit) : all;

  // Returning early rather than passing an empty array to `.in()`, which
  // PostgREST renders as `id=in.()` — a syntax error, not an empty result.
  if (scoreRows.length === 0) {
    return {
      ranAt: now.toISOString(),
      dryRun,
      scanned: 0,
      replayed: 0,
      changed: 0,
      days: [],
      failures: [],
      truncated: false,
    };
  }

  const { data: profileData, error: profileError } = await admin
    .from('profiles')
    .select(REPLAY_PROFILE_SELECT)
    .in('id', ownersOf(scoreRows));
  if (profileError) return { error: `timezone lookup failed: ${profileError.message}` };

  const { candidates, unresolved } = pairCandidates(
    scoreRows,
    (profileData ?? []) as unknown as ReplayProfileRow[],
  );

  const days: ReplayDayReport[] = [];
  const failures = [...unresolved];

  for (const candidate of candidates) {
    const report = await replayOne(admin, candidate, now, dryRun);
    if ('error' in report) {
      failures.push({
        userId: candidate.userId,
        localDate: candidate.localDate,
        error: report.error,
      });
      continue;
    }
    days.push(report);
  }

  return {
    ranAt: now.toISOString(),
    dryRun,
    scanned: scoreRows.length,
    replayed: days.length,
    changed: days.filter((d) => d.changed).length,
    days,
    failures,
    truncated,
  };
}

async function replayOne(
  admin: SupabaseClient,
  candidate: ReplayCandidate,
  now: Date,
  dryRun: boolean,
): Promise<ReplayDayReport | { error: string }> {
  // The same `rescoreDay` every other write path uses. A dry run differs from
  // a live one by one flag inside it, so what the operator reads is what the
  // commit writes rather than a second model of it.
  const result = await rescoreDay(admin, {
    userId: candidate.userId,
    localDate: candidate.localDate,
    timeZone: candidate.timeZone,
    now,
    replayFrozen: true,
    dryRun,
  });
  if ('error' in result) return { error: result.error };

  const before = figuresFromStored(candidate.before);
  const after = figuresFromPlanned(result.row);

  return {
    userId: candidate.userId,
    localDate: candidate.localDate,
    status: result.row.status,
    finalizedAt: result.row.finalized_at,
    before,
    after,
    changed: figuresDiffer(before, after),
  };
}

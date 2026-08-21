import { describe, expect, it } from 'vitest';
import {
  authorizeReplay,
  figuresDiffer,
  figuresFromPlanned,
  figuresFromStored,
  MAX_DAYS_PER_REPLAY,
  ownersOf,
  pairCandidates,
  parseReplayRequest,
  replayLifecycle,
  REPLAY_PROFILE_SELECT,
  REPLAY_SCORE_SELECT,
  type ReplayScoreRow,
} from './replay-plan.ts';
import { planDay, type DayScoreRow } from './sync-plan.ts';

const USER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

const BUCKETS = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  steps: hour >= 8 && hour < 18 ? 1_100 : 0,
  distanceM: hour >= 8 && hour < 18 ? 825 : 0,
  activeKcal: hour >= 8 && hour < 18 ? 26 : 0,
  activeMinutes: hour >= 8 && hour < 18 ? 6 : 0,
}));

function plannedRow(existingStatus: 'provisional' | 'final' | null): DayScoreRow {
  return planDay({
    userId: USER,
    localDate: '2026-08-14',
    timeZone: 'Asia/Manila',
    now: new Date('2026-08-20T04:00:00Z'),
    buckets: BUCKETS,
    hadWorkoutHours: new Set(),
    elevatedHeartRateHours: new Set(),
    sleepMinutes: 420,
    earnableStats: 3,
    verifiedWorkoutMinutes: 0,
    existingStatus,
  }).row;
}

function storedRow(over: Partial<ReplayScoreRow> = {}): ReplayScoreRow {
  return {
    user_id: USER,
    local_date: '2026-08-14',
    status: 'final',
    finalized_at: '2026-08-15T16:05:12.443Z',
    agi_points: 900,
    str_points: 600,
    mind_points: 0,
    consistency_points: 200,
    total: 2_400,
    normalization_factor: '1.000',
    contributing_stats: 4,
    xp_awarded: 240,
    ...over,
  };
}

describe('replayLifecycle', () => {
  it('keeps a final day final, with the timestamp it already had', () => {
    // The defect this whole function exists for. `rescoreDay(…, { finalize:
    // true })` computes exactly the same scoring columns and stamps
    // `finalized_at` with the replay's own clock — moving every historical
    // day's finalization to the afternoon of the deploy.
    const row = replayLifecycle(plannedRow('final'), {
      status: 'final',
      finalizedAt: '2026-08-15T16:05:12.443Z',
    });

    expect(row.status).toBe('final');
    expect(row.finalized_at).toBe('2026-08-15T16:05:12.443Z');
  });

  it('keeps a provisional day provisional, with no timestamp', () => {
    // The other direction, and not a restatement of the first: a replay that
    // wrote `status: 'final'` unconditionally — which is what `finalize: true`
    // does — would satisfy the assertion above and close today's live
    // competition three hours early.
    const row = replayLifecycle(plannedRow('provisional'), {
      status: 'provisional',
      finalizedAt: null,
    });

    expect(row.status).toBe('provisional');
    expect(row.finalized_at).toBeNull();
  });

  it('recomputes the scoring columns it is there to change', () => {
    // Preservation must not have been bought by preserving everything. The
    // stored row is a four-stat one; the replayed row is not.
    const planned = plannedRow('final');
    const row = replayLifecycle(planned, {
      status: 'final',
      finalizedAt: '2026-08-15T16:05:12.443Z',
    });

    expect(row.total).toBe(planned.total);
    expect(row.contributing_stats).toBe(planned.contributing_stats);
    expect(row.normalization_factor).toBe(planned.normalization_factor);
    expect(row.total).toBeGreaterThan(0);
  });

  it('takes the plan status when no row was stored', () => {
    const row = replayLifecycle(plannedRow(null), { status: null, finalizedAt: null });
    expect(row.status).toBe('provisional');
    expect(row.finalized_at).toBeNull();
  });

  it('takes the STORED status when the planner disagrees, in both directions', () => {
    // The discriminating case, and it was missing. Every other fixture in this
    // block pairs a planned status with an identical stored one — because
    // `planDay` derives its status from whether the day is frozen, and that is
    // itself read from the stored row, so the two agree by construction. With
    // them equal, `existing.status ?? planned.status` and a bare
    // `planned.status` return the same value and nothing here can tell the two
    // apart: replacing the expression with the planner's own status passed all
    // eighteen tests in this file.
    //
    // What this pins is WHICH SIDE IS AUTHORITATIVE. The stored row is, always
    // — a replay changes what a day scored and never when its competition
    // ended. Forcing the pair apart is the only way to say so.
    const plannedFinal = plannedRow('final');
    expect(plannedFinal.status).toBe('final');
    const demoted = replayLifecycle(plannedFinal, { status: 'provisional', finalizedAt: null });
    expect(demoted.status).toBe('provisional');
    expect(demoted.finalized_at).toBeNull();

    const plannedProvisional = plannedRow('provisional');
    expect(plannedProvisional.status).toBe('provisional');
    const promoted = replayLifecycle(plannedProvisional, {
      status: 'final',
      finalizedAt: '2026-08-15T16:05:12.443Z',
    });
    expect(promoted.status).toBe('final');
    expect(promoted.finalized_at).toBe('2026-08-15T16:05:12.443Z');
  });
});

describe('authorizeReplay', () => {
  it('refuses when the secret is unset, rather than defaulting open', () => {
    // finalize-days skips its check when CRON_SECRET is falsy. That default is
    // right for a job whose worst case is a day closing early; here the worst
    // case is every score row in the project rewritten by a stranger.
    for (const configured of [undefined, null, '']) {
      const result = authorizeReplay(configured, 'anything');
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ status: 503 });
    }
  });

  it('refuses a missing or wrong secret when one is configured', () => {
    expect(authorizeReplay('s3cret', null)).toMatchObject({ ok: false, status: 403 });
    expect(authorizeReplay('s3cret', 'S3CRET')).toMatchObject({ ok: false, status: 403 });
    expect(authorizeReplay('s3cret', '')).toMatchObject({ ok: false, status: 403 });
  });

  it('admits the matching secret', () => {
    expect(authorizeReplay('s3cret', 's3cret')).toEqual({ ok: true });
  });
});

describe('parseReplayRequest', () => {
  it('defaults to a dry run, including on an absent body', () => {
    // A mis-typed curl posts nothing. The harmless reading of nothing is the
    // one that reports.
    expect(parseReplayRequest(null)).toEqual({
      ok: true,
      value: { dryRun: true, userId: null, limit: MAX_DAYS_PER_REPLAY },
    });
    expect(parseReplayRequest({})).toMatchObject({ ok: true, value: { dryRun: true } });
  });

  it('writes only when dryRun is explicitly false', () => {
    expect(parseReplayRequest({ dryRun: false })).toMatchObject({
      ok: true,
      value: { dryRun: false },
    });
  });

  it('rejects a body it cannot read rather than guessing', () => {
    expect(parseReplayRequest([])).toMatchObject({ ok: false });
    expect(parseReplayRequest('{}')).toMatchObject({ ok: false });
    expect(parseReplayRequest({ dryRun: 'false' })).toMatchObject({ ok: false });
    expect(parseReplayRequest({ userId: 7 })).toMatchObject({ ok: false });
    expect(parseReplayRequest({ limit: 0 })).toMatchObject({ ok: false });
    expect(parseReplayRequest({ limit: 2.5 })).toMatchObject({ ok: false });
    expect(parseReplayRequest({ limit: MAX_DAYS_PER_REPLAY + 1 })).toMatchObject({
      ok: false,
    });
  });

  it('carries a user filter and a limit through', () => {
    expect(parseReplayRequest({ dryRun: false, userId: USER, limit: 5 })).toEqual({
      ok: true,
      value: { dryRun: false, userId: USER, limit: 5 },
    });
  });
});

describe('pairCandidates', () => {
  it('pairs every day with its own owner timezone', () => {
    // Two users in different zones is the case that matters: a squad spans
    // several calendar dates at any instant (§2), so one zone for the batch
    // would move somebody's midnight.
    const { candidates, unresolved } = pairCandidates(
      [
        storedRow(),
        storedRow({ user_id: OTHER, local_date: '2026-08-20', status: 'provisional', finalized_at: null }),
      ],
      [
        { id: USER, timezone: 'Asia/Manila' },
        { id: OTHER, timezone: 'America/New_York' },
      ],
    );

    expect(unresolved).toEqual([]);
    expect(
      candidates.map((c) => [c.userId, c.localDate, c.status, c.timeZone]),
    ).toEqual([
      [USER, '2026-08-14', 'final', 'Asia/Manila'],
      [OTHER, '2026-08-20', 'provisional', 'America/New_York'],
    ]);
    expect(candidates[0]!.finalizedAt).toBe('2026-08-15T16:05:12.443Z');
    expect(candidates[1]!.finalizedAt).toBeNull();
  });

  it('reports a day it cannot place rather than defaulting the zone', () => {
    // Defensive: daily_scores.user_id references profiles(id), so this cannot
    // occur today. It is here because the alternative to reporting is
    // *guessing* a timezone, and a guessed zone silently replays the day
    // against a different midnight.
    const { candidates, unresolved } = pairCandidates([storedRow()], []);
    expect(candidates).toEqual([]);
    expect(unresolved).toEqual([
      { userId: USER, localDate: '2026-08-14', error: 'no profile timezone' },
    ]);
  });
});

describe('ownersOf', () => {
  it('deduplicates, because one user owns many days', () => {
    expect(
      ownersOf([
        storedRow(),
        storedRow({ local_date: '2026-08-15' }),
        storedRow({ user_id: OTHER }),
      ]),
    ).toEqual([USER, OTHER]);
  });
});

describe('the enumeration select', () => {
  it('names status and finalized_at, the two columns the replay must not change', () => {
    // Read back from `daily_scores` because there is nowhere else to get them:
    // planDay always returns `finalized_at: null`.
    expect(REPLAY_SCORE_SELECT).toContain('status');
    expect(REPLAY_SCORE_SELECT).toContain('finalized_at');
    expect(REPLAY_PROFILE_SELECT).toBe('id, timezone');
  });
});

describe('figures', () => {
  it('reads numerics that arrive as strings over PostgREST', () => {
    // normalization_factor is numeric(4,3) and comes back as '1.500'. Left as
    // a string it would compare unequal to 1.5 forever and every day would
    // read as changed.
    const figures = figuresFromStored(storedRow({ normalization_factor: '1.500' }));
    expect(figures.normalizationFactor).toBe(1.5);
    expect(figures.total).toBe(2_400);
  });

  it('sees a four-stat row and its three-stat replacement as different', () => {
    const before = figuresFromStored(storedRow());
    const after = figuresFromPlanned(plannedRow('final'));
    expect(figuresDiffer(before, after)).toBe(true);
  });

  it('sees an already-replayed row as unchanged, so a second run says so', () => {
    const planned = plannedRow('final');
    const before = figuresFromStored(
      storedRow({
        agi_points: planned.agi_points,
        str_points: planned.str_points,
        mind_points: planned.mind_points,
        consistency_points: planned.consistency_points,
        total: planned.total,
        normalization_factor: planned.normalization_factor.toFixed(3),
        contributing_stats: planned.contributing_stats,
        xp_awarded: planned.xp_awarded,
      }),
    );
    expect(figuresDiffer(before, figuresFromPlanned(planned))).toBe(false);
  });
});

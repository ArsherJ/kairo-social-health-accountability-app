import { describe, expect, it } from 'vitest';
import {
  CORE_STATS,
  nextTierFor,
  normalizationFactor,
  weightedBoardTotal,
  type CoreStat,
  type Tier,
} from '@kairo/core';
import {
  DEMO_LEADERBOARD,
  DEMO_LEADERBOARD_COMPLETED,
  DEMO_SCORE,
  DEMO_SQUAD,
} from './fixtures.ts';

/**
 * What each tier is worth, derived from `@kairo/core` rather than restated.
 *
 * `TIER_POINTS` is private to `scoring.ts` on purpose — Bronze/Silver/Gold are
 * internal to scoring (deviation #23) and a second table would be a second
 * place for the board's arithmetic to live. `nextTierFor`'s `pointsGain` is
 * the difference between two adjacent bands, so the ladder accumulates out of
 * the public API and this file pins nothing of its own.
 */
const bandValues = (): Record<Tier, number> => {
  const bronze = nextTierFor('AGI', 0)!.pointsGain;
  const silver = bronze + nextTierFor('AGI', 1_000)!.pointsGain;
  const gold = silver + nextTierFor('AGI', 5_000)!.pointsGain;
  return { none: 0, bronze, silver, gold };
};

/**
 * How many stats each fixture member could earn that day — the input to §2's
 * normalization, and the one thing a `LeaderboardRow` does not carry.
 *
 * It cannot: `squad_leaderboard()` reads `daily_scores.normalization_factor`,
 * which is stored per day precisely because capability is a property of the
 * day that was scored and not of the row being rendered. Trina is the
 * phone-only member, so two.
 */
const EARNABLE: Record<string, number> = { Ramon: 3, You: 3, Trina: 2 };

/** Every fixture member covers all the breadth available to them. */
const CONSISTENCY = 800;

function boardTotalFor(row: {
  character_name: string;
  tiers: Record<string, string>;
  program: string;
}): number {
  const values = bandValues();
  const statPoints = {} as Record<CoreStat, number>;
  for (const stat of CORE_STATS) {
    statPoints[stat] = values[(row.tiers[stat] ?? 'none') as Tier];
  }
  return weightedBoardTotal({
    program: row.program as 'running',
    statPoints,
    consistencyBonus: CONSISTENCY,
    // Deviation #41 retired `rec_points`; `squad_leaderboard()` passes a
    // literal 0 and so does this.
    recBonus: 0,
    normalizationFactor: normalizationFactor(
      EARNABLE[row.character_name] ?? CORE_STATS.length,
      CORE_STATS.length,
    ),
  });
}

/**
 * The demo board must be a board the app can actually receive.
 *
 * This test exists because it already went stale in silence: Task 4 taught
 * `squad_leaderboard()` to count MND and apply normalization, and these
 * fixtures went on carrying unweighted four-stat sums that no
 * `computeDailyScore` could produce. Nothing failed — demo fixtures are read
 * by eye, on a screen, in exactly the review where a wrong number is taken as
 * ground truth.
 */
describe('the demo leaderboard is the real board arithmetic', () => {
  for (const row of DEMO_LEADERBOARD) {
    it(`${row.character_name}'s total is what squad_leaderboard() would return`, () => {
      expect(row.total).toBe(boardTotalFor(row));
    });
  }

  for (const row of DEMO_LEADERBOARD_COMPLETED) {
    it(`${row.character_name}'s completed-day total is reachable too`, () => {
      expect(row.total).toBe(boardTotalFor(row));
    });
  }

  // The board is weighted at read time (deviation #11) and the stored row is
  // not, so these two numbers describing the same day are *supposed* to
  // differ. They were identical while the fixture board was unweighted, which
  // is what made the staleness invisible.
  it("the stored score row is the demo user's day before the program weights it", () => {
    const self = DEMO_LEADERBOARD.find((r) => r.is_self)!;
    expect(DEMO_SCORE.total).toBe(
      DEMO_SCORE.agi_points +
        DEMO_SCORE.str_points +
        DEMO_SCORE.mind_points +
        DEMO_SCORE.consistency_points,
    );
    expect(self.total).toBeGreaterThan(DEMO_SCORE.total);
    expect(DEMO_SQUAD.program).toBe('running');
  });

  // Ranks are a claim the fixture makes in prose ("Ramon is 950 ahead"), so
  // they have to fall out of the totals rather than be typed beside them.
  it('is ranked by its own totals', () => {
    for (const board of [DEMO_LEADERBOARD, DEMO_LEADERBOARD_COMPLETED]) {
      const sorted = [...board].sort((a, b) => b.total - a.total);
      expect(sorted.map((r) => r.rank)).toEqual([1, 2, 3]);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { earnableStats, hasSleepCapability } from './capability.ts';
import {
  DAILY_STEP_BASELINE,
  FEATURED_STAT_MULTIPLIER,
  MAX_DAILY_SCORE_PHONE_ONLY,
  MAX_DAILY_SCORE_WITH_WEARABLE,
  STAT_POINTS_MAX,
  VIT_ACTIVE_HOUR_STEPS,
  aggregateBuckets,
  computeDailyScore,
  nextTierFor,
  shiftedTierFor,
  tierFor,
} from './scoring.ts';
import { spreadShift, workoutShift } from './shifts.ts';
import { CORE_STATS, type CoreStat, type HourBucket } from './types.ts';

/** Build a day of buckets. `perHour` is applied to each hour listed. */
function hours(
  count: number,
  perHour: Partial<Omit<HourBucket, 'hour'>> = {},
): HourBucket[] {
  return Array.from({ length: count }, (_, hour) => ({
    hour,
    steps: 0,
    distanceM: 0,
    activeKcal: 0,
    activeMinutes: 0,
    ...perHour,
  }));
}

/**
 * A day with exact totals, spread so that `activeHours` is controllable
 * independently of the step total.
 */
function dayWith(opts: {
  steps?: number;
  activeKcal?: number;
  activeMinutes?: number;
  activeHours?: number;
}): HourBucket[] {
  const { steps = 0, activeKcal = 0, activeMinutes = 0, activeHours = 0 } = opts;

  // Put enough steps in `activeHours` hours to clear the VIT threshold,
  // then dump the remainder into a single hour that is already active
  // (or hour 23 if we need no active hours at all).
  const buckets = hours(24);
  let placed = 0;
  for (let h = 0; h < activeHours; h++) {
    buckets[h]!.steps = VIT_ACTIVE_HOUR_STEPS;
    placed += VIT_ACTIVE_HOUR_STEPS;
  }
  const remainder = steps - placed;
  if (remainder > 0) {
    const sink = activeHours > 0 ? activeHours - 1 : 23;
    buckets[sink]!.steps += remainder;
  } else if (remainder < 0) {
    throw new Error(
      `steps (${steps}) too low to produce ${activeHours} active hours`,
    );
  }

  buckets[0]!.activeKcal = activeKcal;
  buckets[0]!.activeMinutes = activeMinutes;
  return buckets;
}

describe('aggregateBuckets', () => {
  it('sums each metric across the day', () => {
    const totals = aggregateBuckets([
      { hour: 8, steps: 1000, distanceM: 700, activeKcal: 40, activeMinutes: 10 },
      { hour: 9, steps: 500, distanceM: 350, activeKcal: 20, activeMinutes: 5 },
    ]);
    expect(totals.steps).toBe(1500);
    expect(totals.distanceM).toBe(1050);
    expect(totals.activeKcal).toBe(60);
    expect(totals.activeMinutes).toBe(15);
  });

  it('counts an active hour only at 250+ steps', () => {
    const totals = aggregateBuckets([
      { hour: 1, steps: 249, distanceM: 0, activeKcal: 0, activeMinutes: 0 },
      { hour: 2, steps: 250, distanceM: 0, activeKcal: 0, activeMinutes: 0 },
      { hour: 3, steps: 9000, distanceM: 0, activeKcal: 0, activeMinutes: 0 },
    ]);
    expect(totals.activeHours).toBe(2);
  });

  it('is empty-safe', () => {
    const totals = aggregateBuckets([]);
    expect(totals).toEqual({
      steps: 0,
      distanceM: 0,
      activeKcal: 0,
      activeMinutes: 0,
      activeHours: 0,
    });
  });
});

describe('tier boundaries', () => {
  // Each case: [raw value, expected tier, expected points]
  const cases: Record<CoreStat, ReadonlyArray<readonly [number, string, number]>> = {
    AGI: [
      [0, 'none', 0],
      [999, 'none', 0],
      [1_000, 'bronze', 250],
      [4_999, 'bronze', 250],
      [5_000, 'silver', 650],
      [9_999, 'silver', 650],
      [10_000, 'gold', 1_200],
      [40_000, 'gold', 1_200],
    ],
    STR: [
      [0, 'none', 0],
      [49, 'none', 0],
      [50, 'bronze', 250],
      [199, 'bronze', 250],
      [200, 'silver', 650],
      [399, 'silver', 650],
      [400, 'gold', 1_200],
      [5_000, 'gold', 1_200],
    ],
    // Empty on purpose: this table drives buckets through `dayWith`, and MND
    // reads `sleepMinutes` instead of a bucket total — there is nothing here
    // for it to construct. Its bands (including the oversleep flattening
    // `tierFor` cannot express) are covered in "MND as a core stat" below.
    MND: [],
  };

  for (const [stat, rows] of Object.entries(cases) as [
    CoreStat,
    ReadonlyArray<readonly [number, string, number]>,
  ][]) {
    for (const [raw, tier, points] of rows) {
      it(`${stat} at ${raw} is ${tier} (${points} pts)`, () => {
        // AGI's bands are only unshifted while the day is not spread, so the
        // step cases go into a single hour rather than through `dayWith`'s
        // `activeHours`. That is the whole point of the shift and it would
        // silently make every AGI boundary here wrong by up to 25%.
        const buckets =
          stat === 'AGI' ? dayWith({ steps: raw }) : dayWith({ activeKcal: raw });

        const result = computeDailyScore({ buckets });
        expect(result.stats[stat].tier).toBe(tier);
        expect(result.stats[stat].points).toBe(points);
      });
    }
  }
});
describe('consistency bonus', () => {
  it('awards nothing for zero contributing stats', () => {
    const result = computeDailyScore({ buckets: hours(24) });
    expect(result.contributingStats).toBe(0);
    expect(result.consistencyBonus).toBe(0);
  });

  it('awards nothing for a single contributing stat', () => {
    const result = computeDailyScore({ buckets: dayWith({ steps: 1_000 }) });
    expect(result.contributingStats).toBe(1);
    expect(result.consistencyBonus).toBe(0);
  });

  it('awards 400 for two of three', () => {
    const result = computeDailyScore({
      buckets: dayWith({ steps: 1_000, activeKcal: 50 }),
    });
    expect(result.contributingStats).toBe(2);
    expect(result.consistencyBonus).toBe(400);
  });

  it('awards 800 for all three', () => {
    const result = computeDailyScore({
      buckets: dayWith({ steps: 1_000, activeKcal: 50 }),
      sleepMinutes: 5 * 60,
    });
    expect(result.contributingStats).toBe(3);
    expect(result.consistencyBonus).toBe(800);
  });

  // The failure this guards is silent and inverts the rule: an array shorter
  // than CORE_STATS.length + 1 returns undefined for a full day, `?? 0` turns
  // that into zero, and a perfect day pays less than a partial one. Exactly
  // what a five-stat transitional model did to a four-entry table.
  it('has a bonus defined for every possible breadth, up to and including all of them', () => {
    for (let contributing = 0; contributing <= CORE_STATS.length; contributing += 1) {
      const result = computeDailyScore({
        buckets: dayWith({
          steps: contributing >= 1 ? 1_000 : 0,
          activeKcal: contributing >= 2 ? 50 : 0,
        }),
        sleepMinutes: contributing >= 3 ? 5 * 60 : null,
      });
      expect(result.contributingStats).toBe(contributing);
      // Strictly positive from two stats up, because that is what a missing
      // array entry looks like: `undefined ?? 0` is a perfectly ordinary zero,
      // so `>= 0` would pass on exactly the failure this exists to catch.
      if (contributing >= 2) expect(result.consistencyBonus).toBeGreaterThan(0);
    }
  });

  // Full breadth means "all the stats available to you" (spec §2), so a
  // phone-only user's two is a full day. Without this, normalization would fix
  // the stat points and leave the same gradient on the bonus.
  it('pays full breadth to a two-stat user who covered both', () => {
    const result = computeDailyScore({
      buckets: dayWith({ steps: 1_000, activeKcal: 50 }),
      sleepMinutes: null,
      earnableStats: 2,
    });
    expect(result.contributingStats).toBe(2);
    expect(result.consistencyBonus).toBe(800);
  });

  it('still pays nothing to a two-stat user who did nothing', () => {
    const result = computeDailyScore({
      buckets: hours(24),
      sleepMinutes: null,
      earnableStats: 2,
    });
    expect(result.consistencyBonus).toBe(0);
  });
});

describe('threshold shifts', () => {
  // END and VIT survive here: as generosity, never as points. A stored
  // multiplier would stack with a squad program's read-time weight, which is
  // the trap deviation #10 already sprang once.

  it('lowers AGI gold to 7,500 steps on a fully spread day', () => {
    const spread = computeDailyScore({
      buckets: dayWith({ steps: 7_500, activeHours: 8 }),
      sleepMinutes: null,
      earnableStats: 2,
    });
    expect(spread.stats.AGI.tier).toBe('gold');
  });

  it('leaves AGI gold at 10,000 for the same steps taken in one burst', () => {
    const burst = computeDailyScore({ buckets: dayWith({ steps: 7_500 }) });
    expect(burst.stats.AGI.tier).toBe('silver');
  });

  it('lowers STR bands with sixty verified workout minutes', () => {
    const shifted = computeDailyScore({
      buckets: dayWith({ activeKcal: 300 }),
      verifiedWorkoutMinutes: 60,
    });
    expect(shifted.stats.STR.tier).toBe('gold');
  });

  it('shifts nothing when the session did not verify', () => {
    // The caller passes 0 minutes for an unverified session, so this is what
    // a hand-typed workout looks like from in here.
    const unverified = computeDailyScore({
      buckets: dayWith({ activeKcal: 300 }),
      verifiedWorkoutMinutes: 0,
    });
    expect(unverified.stats.STR.tier).toBe('silver');
  });

  it('never shifts MND — the trust gate decides whether sleep scores, not how easily', () => {
    const both = computeDailyScore({
      buckets: dayWith({ steps: 20_000, activeHours: 12 }),
      sleepMinutes: 6 * 60 + 59,
      verifiedWorkoutMinutes: 300,
    });
    expect(both.stats.MND.tier).toBe('silver');
  });

  it('caps the shift at 25% however extreme the day', () => {
    // 24 active hours would be a 105% shift uncapped, which would make Gold
    // arrive at a negative step count.
    const extreme = computeDailyScore({
      buckets: dayWith({ steps: 7_499, activeHours: 24 }),
    });
    expect(extreme.stats.AGI.tier).toBe('silver');
    expect(shiftedTierFor('AGI', 7_500, 1)).toBe('gold');
  });
});

describe('normalization', () => {
  // Spec §2. Sleep-as-a-stat would otherwise make a wearable worth 27% of the
  // daily ceiling and a permanent leaderboard gradient — on a Philippines-market
  // app, landing hardest on the users least likely to own one.

  it('scales a two-stat user’s points by 1.5', () => {
    const result = computeDailyScore({
      buckets: dayWith({ steps: 10_000, activeKcal: 400 }),
      sleepMinutes: null,
      earnableStats: 2,
    });
    expect(result.normalizationFactor).toBe(1.5);
    // 2,400 base, reported per stat before normalization.
    expect(result.stats.AGI.points).toBe(1_200);
    expect(result.healthTotal).toBe(Math.round(2_400 * 1.5) + 800);
  });

  it('leaves a three-stat user unscaled', () => {
    const result = computeDailyScore({
      buckets: dayWith({ steps: 10_000, activeKcal: 400 }),
      sleepMinutes: 7 * 60,
      earnableStats: 3,
    });
    expect(result.normalizationFactor).toBe(1);
  });

  it('defaults to everyone-can-earn-everything when the caller says nothing', () => {
    const result = computeDailyScore({ buckets: dayWith({ steps: 10_000 }) });
    expect(result.normalizationFactor).toBe(1);
  });

  it('does not normalize the consistency bonus', () => {
    // Scaling the bonus as well would apply the same correction twice —
    // `breadthBonus` already accounts for earnable stats.
    const result = computeDailyScore({
      buckets: dayWith({ steps: 10_000, activeKcal: 400 }),
      sleepMinutes: null,
      earnableStats: 2,
    });
    expect(result.healthTotal - Math.round(2_400 * 1.5)).toBe(800);
  });
});

// Spec §3's resolved decision, as arithmetic. This is the one place the two
// halves of the rule are asserted against each other, so it lives here rather
// than in capability.test.ts, which cannot see a score.
describe('the 6,200 breach', () => {
  const goldTwoStatDay = () => dayWith({ steps: 10_000, activeKcal: 400 });

  // The hole spec §3 names by figure: score MND *and* be normalized as a
  // two-stat user and the day pays (1,200 x 3) x 1.5 + 800 = 6,200, against a
  // stated ceiling of 4,400 — a 41% breach.
  //
  // `computeDailyScore` neither prevents this nor could: `earnableStats` is an
  // input, because deriving it needs a clock and a query. The guarantee lives
  // entirely in the coupling between "this night scores" and "this night
  // counts toward capability", and this pins that the engine is where the
  // breach is *expressible* rather than where it is stopped.
  it('is what scoring MND as a two-stat user would pay', () => {
    const breach = computeDailyScore({
      buckets: goldTwoStatDay(),
      sleepMinutes: 7 * 60,
      earnableStats: 2,
    });
    expect(breach.healthTotal).toBe(6_200);
    expect(breach.healthTotal).toBeGreaterThan(MAX_DAILY_SCORE_WITH_WEARABLE);
  });

  // And the coupling that makes the supported call shape unable to produce it:
  // a night that scores is a night inside the capability window, because
  // `hasSleepCapability` compares inclusively against `today`. Narrow that to
  // strictly-before — an easy "off-by-one fix" — and 6,200 comes back with no
  // other test moving.
  it('cannot be reached through earnableStats(hasSleepCapability(...))', () => {
    const today = '2026-08-19';
    const scoringSleepDates = [today];
    expect(hasSleepCapability(scoringSleepDates, today)).toBe(true);

    const supported = computeDailyScore({
      buckets: goldTwoStatDay(),
      sleepMinutes: 7 * 60,
      earnableStats: earnableStats(hasSleepCapability(scoringSleepDates, today)),
    });
    expect(supported.healthTotal).toBe(MAX_DAILY_SCORE_WITH_WEARABLE);
    expect(supported.healthTotal).toBe(4_400);
  });

  // This pair only proves the contract together. On its own, a call with the
  // scored date on both sides of `hasSleepCapability` never diverges from the
  // coincident case above — and coincident dates were never the risk. The
  // second test is the discriminator: it passes a *different* date as
  // `today` (wall-clock, as a caller narrowing "today" to `new Date()` would)
  // while the sleep that scored stays on the original date, and the ceiling
  // breaks exactly as the docstring says it does.
  it('holds when the scored date is not today — the backfill case', () => {
    // The breach that hides here: score 2026-08-01, where sleep exists ON that
    // date (so MND scores) but no scoring sleep falls in the 14 days ending at
    // wall-clock today. earnableStats reads 2, MND still scores, and the day
    // pays 6,200 — with contributing_stats at 3, so the check constraint waves
    // it through. The fix is contractual, not arithmetic: `today` must be the
    // date being scored.
    const scored = '2026-08-01';
    const scoringSleepDates = [scored];

    const day = computeDailyScore({
      buckets: goldTwoStatDay(),
      sleepMinutes: 7 * 60,
      earnableStats: earnableStats(hasSleepCapability(scoringSleepDates, scored)),
    });

    expect(day.healthTotal).toBe(MAX_DAILY_SCORE_WITH_WEARABLE);
    expect(day.healthTotal).toBe(4_400);
  });

  // The negative control the positive case above cannot provide on its own:
  // give `hasSleepCapability` a `today` that is not the scored date — the
  // exact regression named in its docstring, a caller reaching for
  // wall-clock "now" instead of threading through the date being scored.
  // 6,200 is asserted here to document what an unsupported call shape pays,
  // not to bless it: nothing in this package produces this call shape today,
  // and nothing should.
  it('would breach if a caller passed wall-clock today instead of the scored date', () => {
    const scored = '2026-08-01';
    const wallClockToday = '2026-08-19';

    const day = computeDailyScore({
      buckets: goldTwoStatDay(),
      sleepMinutes: 7 * 60,
      earnableStats: earnableStats(hasSleepCapability([scored], wallClockToday)),
    });

    expect(day.healthTotal).toBe(6_200);
  });

  // The other direction of the same coupling: no sleep that scores means no
  // MND points, so two earnable stats and the ceiling still holds.
  it('is not reachable by a genuinely phone-only day either', () => {
    const phoneOnly = computeDailyScore({
      buckets: goldTwoStatDay(),
      sleepMinutes: null,
      earnableStats: earnableStats(hasSleepCapability([], '2026-08-19')),
    });
    expect(phoneOnly.healthTotal).toBe(4_400);
  });
});

describe('weekly featured stat', () => {
  it('multiplies only the featured stat by 1.5', () => {
    const buckets = dayWith({ steps: 10_000, activeKcal: 400 });
    const plain = computeDailyScore({ buckets });
    const agiWeek = computeDailyScore({ buckets, featuredStat: 'AGI' });

    expect(plain.stats.AGI.points).toBe(1_200);
    expect(agiWeek.stats.AGI.points).toBe(1_800);
    expect(agiWeek.stats.STR.points).toBe(plain.stats.STR.points);
  });

  it('does not multiply the consistency bonus', () => {
    const result = computeDailyScore({
      buckets: dayWith({ steps: 10_000, activeKcal: 400 }),
      sleepMinutes: 7 * 60,
      featuredStat: 'MND',
    });
    expect(result.consistencyBonus).toBe(800);
  });

  it('cannot resurrect a stat that scored nothing', () => {
    const result = computeDailyScore({ buckets: hours(24), featuredStat: 'AGI' });
    expect(result.stats.AGI.points).toBe(0);
  });
});

describe('worked scenarios', () => {
  it('gym day, low steps = 1,850', () => {
    const result = computeDailyScore({
      buckets: dayWith({
        steps: 2_000, // AGI bronze even after the spread shift
        activeKcal: 450, // STR gold
        activeHours: 6, // a 15% shift on AGI's bands
      }),
    });
    expect(result.stats.AGI.points).toBe(250);
    expect(result.stats.STR.points).toBe(1_200);
    expect(result.stats.MND.points).toBe(0);
    expect(result.consistencyBonus).toBe(400);
    expect(result.healthTotal).toBe(1_850);
  });

  it('gym day with a wearable and a tracked session = 3,850', () => {
    const result = computeDailyScore({
      buckets: dayWith({ steps: 2_000, activeKcal: 450, activeHours: 6 }),
      sleepMinutes: 7 * 60 + 30, // MND gold
      verifiedWorkoutMinutes: 60,
      earnableStats: 3,
    });
    expect(result.stats.MND.points).toBe(1_200);
    expect(result.contributingStats).toBe(3);
    expect(result.healthTotal).toBe(2_650 + 800);
  });

  it('lazy Sunday, walked to the mall = 650', () => {
    const result = computeDailyScore({
      buckets: dayWith({
        steps: 6_000, // AGI silver
        activeKcal: 0, // STR none
        activeHours: 4, // a 5% shift, not enough to reach gold
      }),
    });
    expect(result.stats.STR.points).toBe(0);
    expect(result.contributingStats).toBe(1);
    expect(result.consistencyBonus).toBe(0);
    expect(result.healthTotal).toBe(650);
  });

  it('complete rest day = 0', () => {
    const result = computeDailyScore({ buckets: hours(24) });
    expect(result.healthTotal).toBe(0);
  });
});

describe('score ceilings', () => {
  /** Every stat at gold, with the day spread as far as it goes. */
  function maxedBuckets(): HourBucket[] {
    return dayWith({
      steps: 40_000,
      activeKcal: 2_000,
      activeMinutes: 600,
      activeHours: 24,
    });
  }

  it('caps a phone-only day at 4,400', () => {
    const result = computeDailyScore({
      buckets: maxedBuckets(),
      sleepMinutes: null,
      earnableStats: 2,
    });
    expect(result.healthTotal).toBe(MAX_DAILY_SCORE_PHONE_ONLY);
    expect(result.healthTotal).toBe(4_400);
  });

  it('caps a wearable day at the same 4,400', () => {
    const result = computeDailyScore({
      buckets: maxedBuckets(),
      sleepMinutes: 8 * 60,
      earnableStats: 3,
    });
    expect(result.healthTotal).toBe(MAX_DAILY_SCORE_WITH_WEARABLE);
    expect(result.healthTotal).toBe(4_400);
  });

  // Spec §2's parity claim, as an executable assertion rather than prose. A
  // wearable buys a third *route* to the ceiling, never a higher one.
  it('reaches the same ceiling with or without a wearable', () => {
    const wearable = computeDailyScore({
      buckets: maxedBuckets(),
      sleepMinutes: 7 * 60,
      earnableStats: 3,
    });
    const phoneOnly = computeDailyScore({
      buckets: maxedBuckets(),
      sleepMinutes: null,
      earnableStats: 2,
    });
    expect(wearable.healthTotal).toBe(4_400);
    expect(phoneOnly.healthTotal).toBe(4_400);
  });

  it('exposes one per-stat ceiling, derived from the tier table', () => {
    expect(STAT_POINTS_MAX).toBe(1_200);
  });

  it('keeps the ceilings as the spec states them', () => {
    // Both are 4,400 under deviation #41, and they stay as two constants
    // because they document two different routes to it.
    expect(MAX_DAILY_SCORE_PHONE_ONLY).toBe(4_400);
    expect(MAX_DAILY_SCORE_WITH_WEARABLE).toBe(4_400);
  });

  it('still applies the multiplier when a featured stat is passed explicitly', () => {
    // No caller on the write path does this, but V1 may resurrect the rotation
    // as a read-time projection — so the arithmetic stays proven rather than
    // merely present.
    const result = computeDailyScore({
      buckets: maxedBuckets(),
      sleepMinutes: 8 * 60,
      earnableStats: 3,
      featuredStat: 'AGI',
    });
    expect(result.healthTotal).toBe(
      MAX_DAILY_SCORE_WITH_WEARABLE +
        Math.round(STAT_POINTS_MAX * FEATURED_STAT_MULTIPLIER) -
        STAT_POINTS_MAX,
    );
  });
});

describe('XP', () => {
  it('awards 10/25/50 per bronze/silver/gold stat', () => {
    const result = computeDailyScore({
      buckets: dayWith({
        steps: 1_000, // bronze -> 10
        activeKcal: 200, // silver -> 25
      }),
      sleepMinutes: 7 * 60, // gold -> 50
    });
    expect(result.xp).toBe(85);
  });

  it('awards no XP on a rest day', () => {
    expect(computeDailyScore({ buckets: hours(24) }).xp).toBe(0);
  });

  it('is unaffected by the featured-stat multiplier', () => {
    const buckets = dayWith({ steps: 10_000 });
    expect(computeDailyScore({ buckets }).xp).toBe(
      computeDailyScore({ buckets, featuredStat: 'AGI' }).xp,
    );
  });

  // XP is normalized on the same `3 / earnable stats` factor as stat points:
  // equivalent effort must level two users at the same rate. Scaling the
  // leaderboard and leaving XP alone would move the same gradient onto the
  // slower surface, where it is harder to notice and harder to explain.
  it('scales by the normalization factor, so equivalent days level equally', () => {
    // Two Gold stats phone-only, three Gold stats with a wearable: the same
    // day in each user's own terms, and the same XP.
    const phoneOnly = computeDailyScore({
      buckets: dayWith({ steps: 10_000, activeKcal: 400 }),
      sleepMinutes: null,
      earnableStats: 2,
    });
    const wearable = computeDailyScore({
      buckets: dayWith({ steps: 10_000, activeKcal: 400 }),
      sleepMinutes: 7 * 60,
      earnableStats: 3,
    });
    expect(phoneOnly.xp).toBe(150);
    expect(wearable.xp).toBe(150);
  });
});

describe('nextTierFor', () => {
  it('names bronze and the gap for a stat with no tier yet', () => {
    expect(nextTierFor('AGI', 0)).toEqual({
      tier: 'bronze', gap: 1_000, bandLow: 0, pointsGain: 250,
    });
  });

  it('names silver from inside bronze', () => {
    expect(nextTierFor('AGI', 4_760)).toEqual({
      tier: 'silver', gap: 240, bandLow: 1_000, pointsGain: 400,
    });
  });

  it('names gold from inside silver', () => {
    expect(nextTierFor('AGI', 8_760)).toEqual({
      tier: 'gold', gap: 1_240, bandLow: 5_000, pointsGain: 550,
    });
  });

  // Gold is the ceiling (§6). There is no Diamond.
  it('returns null at gold', () => {
    expect(nextTierFor('AGI', 10_000)).toBeNull();
    expect(nextTierFor('AGI', 25_000)).toBeNull();
  });

  it("uses each stat's own thresholds and units", () => {
    expect(nextTierFor('STR', 120)).toEqual({ tier: 'silver', gap: 80, bandLow: 50, pointsGain: 400 });
    expect(nextTierFor('MND', 5 * 60 + 30)).toEqual({ tier: 'silver', gap: 30, bandLow: 300, pointsGain: 400 });
  });

  // active_kcal is numeric, so raw values arrive fractional. Telling someone
  // they need 0.4 more kcal is not an instruction.
  it('rounds a fractional gap up to a whole unit', () => {
    expect(nextTierFor('STR', 199.6)).toEqual({ tier: 'silver', gap: 1, bandLow: 50, pointsGain: 400 });
  });

  // The boundary is inclusive in tierFor, so it must be inclusive here too or
  // the two disagree about what "at silver" means.
  it('agrees with tierFor on the boundary', () => {
    expect(tierFor('STR', 200)).toBe('silver');
    expect(nextTierFor('STR', 200)).toEqual({ tier: 'gold', gap: 200, bandLow: 200, pointsGain: 550 });
  });

  // The landmine Task 3's review found, and the reason it had to be fixed in
  // the same task that stopped `resolveStatDetail` skipping MND. Reading the
  // linear table above nine hours reported an eleven-hour night as "already
  // gold" while `mindTierFor` scored it Bronze — two functions disagreeing
  // about the same night, on the one line whose job is to say what to do next.
  describe('MND above the oversleep threshold', () => {
    it('refuses to answer rather than claiming gold', () => {
      expect(nextTierFor('MND', 11 * 60)).toBeNull();
    });

    it('does not contradict the tier the scorer actually awards', () => {
      const eleven = computeDailyScore({ buckets: [], sleepMinutes: 11 * 60 });
      expect(eleven.stats.MND.tier).toBe('bronze');
      // Bronze with no next tier is the honest reading: there is no positive
      // number of extra minutes that recovers Gold.
      expect(nextTierFor('MND', 11 * 60)).toBeNull();
    });

    it('still answers normally at nine hours exactly', () => {
      expect(computeDailyScore({ buckets: [], sleepMinutes: 9 * 60 }).stats.MND.tier).toBe('gold');
      expect(nextTierFor('MND', 9 * 60)).toBeNull();
    });
  });

  // `bandLow` is the current band's floor — the tier threshold `raw` is at or
  // above, or 0 below bronze — so a caller can compute a true fraction
  // through the band (`gap / (threshold - bandLow)`) instead of a fraction of
  // the target value, which only agreed with "share of band" in the first band.
  describe('bandLow', () => {
    it('is 0 below bronze', () => {
      expect(nextTierFor('MND', 0)?.bandLow).toBe(0);
      expect(nextTierFor('MND', 120)?.bandLow).toBe(0);
    });

    it('is the bronze threshold inside the bronze band (heading to silver)', () => {
      expect(nextTierFor('MND', 330)).toEqual({ tier: 'silver', gap: 30, bandLow: 300, pointsGain: 400 });
    });

    it('is the silver threshold inside the silver band (heading to gold)', () => {
      expect(nextTierFor('MND', 390)).toEqual({ tier: 'gold', gap: 30, bandLow: 360, pointsGain: 550 });
    });

    it('is moot at gold — nextTierFor returns null, there is nothing to band', () => {
      expect(nextTierFor('MND', 420)).toBeNull();
    });
  });
});

describe('nextTierFor — the band the day is actually judged against', () => {
  // The bug this closes: the hint read the unshifted ladder while the scorer
  // read the shifted one, so a well-spread day was told "1,240 more steps"
  // and hit Gold 2,500 steps early. Arriving early reads as a bug in the
  // score, not as a gift — and it is the one line on the screen whose whole
  // job is to say what to do next.

  it('reports the distance to the shifted band on a well-spread day', () => {
    // Eight active hours earns the 25% cap, so AGI Gold sits at 7,500.
    const shift = spreadShift(8);
    expect(nextTierFor('AGI', 7_000, shift)).toEqual({
      tier: 'gold',
      gap: 500,
      // The floor moves with the ceiling: shifted Silver is 3,750. A band
      // whose top is shifted and whose floor is not is a false fraction on
      // every progress bar reading it.
      bandLow: 3_750,
      pointsGain: 550,
    });
  });

  it('stops asking exactly where the scorer awards gold', () => {
    const shift = spreadShift(8);
    expect(shiftedTierFor('AGI', 7_500, shift)).toBe('gold');
    expect(nextTierFor('AGI', 7_500, shift)).toBeNull();
    // And one step below it, the two still agree there is something to ask
    // for — a hint that goes quiet early is the same failure mirrored.
    expect(shiftedTierFor('AGI', 7_499, shift)).toBe('silver');
    expect(nextTierFor('AGI', 7_499, shift)).toMatchObject({ tier: 'gold', gap: 1 });
  });

  it("uses STR's own shift, which comes from verified workout minutes", () => {
    // Sixty verified minutes is the cap, so STR Silver sits at 150 and Gold
    // at 300. Unshifted, 200 kcal is exactly the Silver line and Gold is 200
    // away; shifted, it is already inside Silver and Gold is 100 away.
    const shift = workoutShift(60);
    expect(nextTierFor('STR', 200)).toMatchObject({ tier: 'gold', gap: 200, bandLow: 200 });
    expect(nextTierFor('STR', 200, shift)).toEqual({
      tier: 'gold',
      gap: 100,
      bandLow: 150,
      pointsGain: 550,
    });
  });

  it('is the unshifted ladder when the day earned no shift', () => {
    // The default and an explicit zero are the same answer, and both are the
    // bands a user has learned.
    expect(nextTierFor('AGI', 8_760, 0)).toEqual(nextTierFor('AGI', 8_760));
    expect(nextTierFor('AGI', 8_760, spreadShift(2))).toEqual(nextTierFor('AGI', 8_760));
  });
});

describe('nextTierFor — what the gap is worth', () => {
  // `pointsGain` exists so the character screen can say "1,240 more steps for
  // +550 AGI" without naming a tier. The bands still decide the number; they
  // just stopped being the vocabulary the user reads.

  it('is the difference between the two bands, not the next band’s value', () => {
    // Crossing into Silver from inside Bronze is worth 650 - 250, not 650.
    expect(nextTierFor('AGI', 4_999)!.pointsGain).toBe(400);
  });

  it('is the full band value when nothing has been earned yet', () => {
    expect(nextTierFor('AGI', 0)!.pointsGain).toBe(250);
  });

  it('is always positive, for every stat and every raw value', () => {
    for (const stat of CORE_STATS) {
      for (const raw of [0, 1, 9, 50, 199, 250, 999, 5_000, 9_999]) {
        const next = nextTierFor(stat, raw);
        if (next) expect(next.pointsGain).toBeGreaterThan(0);
      }
    }
  });

  it('sums to the gold band from a standing start', () => {
    // Bronze + the two steps up must equal what a gold day is worth, or the
    // copy would promise points the scorer does not award.
    const toBronze = nextTierFor('MND', 0)!.pointsGain;
    const toSilver = nextTierFor('MND', 300)!.pointsGain;
    const toGold = nextTierFor('MND', 360)!.pointsGain;
    expect(toBronze + toSilver + toGold).toBe(STAT_POINTS_MAX);
  });
});

describe('the three-stat model', () => {
  it('has exactly three stats', () => {
    expect(CORE_STATS).toEqual(['AGI', 'STR', 'MND']);
  });

  it('no longer exposes END or VIT', () => {
    const score = computeDailyScore({ buckets: [], sleepMinutes: null, earnableStats: 2 });
    expect(Object.keys(score.stats).sort()).toEqual(['AGI', 'MND', 'STR']);
  });

  // TIER_POINTS is module-private and stays that way; the re-tune is asserted
  // through the one figure that is exported, and through behaviour.
  it('pays the re-tuned gold figure', () => {
    expect(STAT_POINTS_MAX).toBe(1_200);
    const oneGoldStat = computeDailyScore({
      buckets: [],
      sleepMinutes: 7 * 60,
      earnableStats: 3,
    });
    expect(oneGoldStat.stats.MND.points).toBe(1_200);
  });

  // The re-tune is derived, not invented: four stats at 900 and three at 1,200
  // are the same ceiling, which is what keeps replayed history comparable.
  it('keeps the four-stat gold ceiling intact across the change', () => {
    expect(3 * STAT_POINTS_MAX).toBe(4 * 900);
  });

  it('still measures the hours and minutes END and VIT rode', () => {
    // They stopped being stats, not measurements — the shifts read them.
    const totals = aggregateBuckets(
      dayWith({ steps: 3_000, activeMinutes: 45, activeHours: 6 }),
    );
    expect(totals.activeHours).toBe(6);
    expect(totals.activeMinutes).toBe(45);
  });
});

describe('MND as a core stat', () => {
  it('scores sleep through the MND bands', () => {
    const score = computeDailyScore({ buckets: [], sleepMinutes: 7 * 60 });
    expect(score.stats.MND.tier).toBe('gold');
    expect(score.stats.MND.raw).toBe(7 * 60);
  });

  it('scores no MND when there is no sleep data at all', () => {
    const score = computeDailyScore({ buckets: [], sleepMinutes: null });
    expect(score.stats.MND.tier).toBe('none');
  });

  // Oversleep is a promoted bonus, never a penalty.
  it('flattens an eleven-hour night to bronze', () => {
    const score = computeDailyScore({ buckets: [], sleepMinutes: 11 * 60 });
    expect(score.stats.MND.tier).toBe('bronze');
  });

  it('reports sleep presence for the leaderboard’s wearable icon', () => {
    expect(computeDailyScore({ buckets: [], sleepMinutes: 480 }).hasRec).toBe(true);
    expect(computeDailyScore({ buckets: [] }).hasRec).toBe(false);
  });
});

describe('DAILY_STEP_BASELINE', () => {
  it('is 10,000 — the public-health number, pinned', () => {
    // Deliberately a literal on this side. The constant itself is *derived*
    // from the AGI Gold threshold so the two can never describe different
    // numbers, but the Daily Walk baseline must never scale with the user
    // (solo-mode design §5), and a derivation alone would let a raised Gold
    // drag it upward without anyone deciding to. This is where that decision
    // gets forced: raise Gold and this fails.
    expect(DAILY_STEP_BASELINE).toBe(10_000);
  });

  it('is exactly the AGI gold threshold', () => {
    // The coupling the walk streak rests on. `daily_scores` stores tiers and
    // never raw steps, so "cleared the walk" is read as `tiers.AGI === 'gold'`
    // — which is only true while these two are the same number.
    expect(tierFor('AGI', DAILY_STEP_BASELINE)).toBe('gold');
    expect(tierFor('AGI', DAILY_STEP_BASELINE - 1)).not.toBe('gold');
  });

  // The shift genuinely lowers the SCORING band — that is its whole point.
  it('is not the band the spread shift lowers', () => {
    expect(DAILY_STEP_BASELINE).toBe(10_000);
    expect(shiftedTierFor('AGI', 7_500, 0.25)).toBe('gold');
  });
});

// The Daily Walk baseline is a public-health number and must never scale with
// the user (CLAUDE.md; spec §1). The spread shift made that easy to break by
// accident, because `daily_scores.tiers->>'AGI'` is the SHIFTED tier and every
// walk read went through it — including `walk_cleared`, which feeds a
// consistency goal that LATCHES.
//
// These tests deliberately assert through `computeDailyScore`, not `tierFor`.
// `tierFor` is `shiftedTierFor(stat, raw, 0)`, so it is the one path where the
// shift is absent by construction — a guard written there passes no matter how
// wrong the stored tier becomes. That is exactly how this got through review.
describe('the walk baseline against the spread shift', () => {
  // Eight active hours earns the 25% cap, so AGI Gold scores at 7,500 steps.
  const spreadDay = (steps: number) =>
    computeDailyScore({ buckets: dayWith({ steps, activeHours: 8 }) });

  it('scores Gold at 7,500 steps on a well-spread day', () => {
    expect(spreadDay(7_500).stats.AGI.tier).toBe('gold');
  });

  it('does not let that day clear the walk', () => {
    // The divergence, stated as plainly as it can be: same day, same steps,
    // Gold for scoring and NOT cleared for the walk. Collapsing these two back
    // into one field is the regression this file exists to stop.
    const day = spreadDay(7_500);
    expect(day.stats.AGI.tier).toBe('gold');
    expect(day.stats.AGI.unshiftedTier).not.toBe('gold');
  });

  it('clears the walk only at the full baseline, however spread the day', () => {
    expect(spreadDay(DAILY_STEP_BASELINE).stats.AGI.unshiftedTier).toBe('gold');
    expect(spreadDay(DAILY_STEP_BASELINE - 1).stats.AGI.unshiftedTier).not.toBe(
      'gold',
    );
  });

  it('agrees with the scoring tier when no shift is earned', () => {
    // Three active hours is the floor, so the shift is zero and the two
    // ladders must not drift apart for the ordinary case.
    const flat = computeDailyScore({
      buckets: dayWith({ steps: DAILY_STEP_BASELINE, activeHours: 3 }),
    });
    expect(flat.stats.AGI.tier).toBe('gold');
    expect(flat.stats.AGI.unshiftedTier).toBe('gold');
  });

  it('leaves MND alone, which takes no shift at all', () => {
    const night = computeDailyScore({
      buckets: dayWith({ steps: 1_000 }),
      sleepMinutes: 7 * 60,
    });
    expect(night.stats.MND.unshiftedTier).toBe(night.stats.MND.tier);
  });
});

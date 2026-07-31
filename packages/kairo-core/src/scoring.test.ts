import { describe, expect, it } from 'vitest';
import {
  FEATURED_STAT_MULTIPLIER,
  MAX_DAILY_SCORE_PHONE_ONLY,
  MAX_DAILY_SCORE_PHONE_ONLY_FEATURED,
  MAX_DAILY_SCORE_WITH_WEARABLE,
  MAX_DAILY_SCORE_WITH_WEARABLE_FEATURED,
  STAT_POINTS_MAX,
  STAT_POINTS_MAX_FEATURED,
  VIT_ACTIVE_HOUR_STEPS,
  aggregateBuckets,
  computeDailyScore,
} from './scoring.ts';
import type { CoreStat, HourBucket } from './types.ts';

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
      [1_000, 'bronze', 200],
      [4_999, 'bronze', 200],
      [5_000, 'silver', 500],
      [9_999, 'silver', 500],
      [10_000, 'gold', 900],
      [40_000, 'gold', 900],
    ],
    STR: [
      [0, 'none', 0],
      [49, 'none', 0],
      [50, 'bronze', 200],
      [199, 'bronze', 200],
      [200, 'silver', 500],
      [399, 'silver', 500],
      [400, 'gold', 900],
      [5_000, 'gold', 900],
    ],
    END: [
      [0, 'none', 0],
      [9, 'none', 0],
      [10, 'bronze', 200],
      [29, 'bronze', 200],
      [30, 'silver', 500],
      [59, 'silver', 500],
      [60, 'gold', 900],
      [600, 'gold', 900],
    ],
    VIT: [
      [0, 'none', 0],
      [2, 'none', 0],
      [3, 'bronze', 200],
      [5, 'bronze', 200],
      [6, 'silver', 500],
      [8, 'silver', 500],
      [9, 'gold', 900],
      // The spec table caps Gold at "9-12 hrs"; a genuinely active person can
      // exceed 12, and dropping them back to zero would be absurd.
      [24, 'gold', 900],
    ],
  };

  for (const [stat, rows] of Object.entries(cases) as [
    CoreStat,
    ReadonlyArray<readonly [number, string, number]>,
  ][]) {
    for (const [raw, tier, points] of rows) {
      it(`${stat} at ${raw} is ${tier} (${points} pts)`, () => {
        const buckets =
          stat === 'AGI'
            ? dayWith({ steps: raw })
            : stat === 'STR'
              ? dayWith({ activeKcal: raw })
              : stat === 'END'
                ? dayWith({ activeMinutes: raw })
                : dayWith({ steps: raw * VIT_ACTIVE_HOUR_STEPS, activeHours: raw });

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
    // 1,000 steps in one hour: AGI bronze, and that hour is active but
    // 1 active hour is still VIT "none".
    const result = computeDailyScore({ buckets: dayWith({ steps: 1_000 }) });
    expect(result.contributingStats).toBe(1);
    expect(result.consistencyBonus).toBe(0);
  });

  it('awards 150 for two', () => {
    const result = computeDailyScore({
      buckets: dayWith({ steps: 1_000, activeKcal: 50 }),
    });
    expect(result.contributingStats).toBe(2);
    expect(result.consistencyBonus).toBe(150);
  });

  it('awards 400 for three', () => {
    const result = computeDailyScore({
      buckets: dayWith({ steps: 1_000, activeKcal: 50, activeMinutes: 10 }),
    });
    expect(result.contributingStats).toBe(3);
    expect(result.consistencyBonus).toBe(400);
  });

  it('awards 800 for all four', () => {
    const result = computeDailyScore({
      buckets: dayWith({
        steps: 1_000,
        activeKcal: 50,
        activeMinutes: 10,
        activeHours: 3,
      }),
    });
    expect(result.contributingStats).toBe(4);
    expect(result.consistencyBonus).toBe(800);
  });
});

describe('REC sleep bonus (wearable only)', () => {
  const bands: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [4 * 60 + 59, 0],
    [5 * 60, 100],
    [5 * 60 + 59, 100],
    [6 * 60, 250],
    [6 * 60 + 59, 250],
    [7 * 60, 500],
    [9 * 60, 500], // 9h exactly is still optimal
    [9 * 60 + 1, 200], // oversleeping
    [12 * 60, 200],
  ];

  for (const [minutes, expected] of bands) {
    it(`${minutes} minutes of sleep is worth ${expected}`, () => {
      const result = computeDailyScore({ buckets: hours(24), sleepMinutes: minutes });
      expect(result.recBonus).toBe(expected);
    });
  }

  it('is absent, not zero-penalised, without a wearable', () => {
    const result = computeDailyScore({ buckets: hours(24) });
    expect(result.recBonus).toBe(0);
    expect(result.hasRec).toBe(false);
  });

  it('is reported as present when sleep data exists', () => {
    const result = computeDailyScore({ buckets: hours(24), sleepMinutes: 480 });
    expect(result.hasRec).toBe(true);
  });

  it('never counts toward the consistency bonus', () => {
    // REC alone must not make this look like a 1-stat day.
    const result = computeDailyScore({ buckets: hours(24), sleepMinutes: 480 });
    expect(result.contributingStats).toBe(0);
    expect(result.consistencyBonus).toBe(0);
  });
});

describe('weekly featured stat', () => {
  it('multiplies only the featured stat by 1.5', () => {
    const buckets = dayWith({ steps: 10_000, activeKcal: 400 });
    const plain = computeDailyScore({ buckets });
    const agiWeek = computeDailyScore({ buckets, featuredStat: 'AGI' });

    expect(plain.stats.AGI.points).toBe(900);
    expect(agiWeek.stats.AGI.points).toBe(1_350);
    expect(agiWeek.stats.STR.points).toBe(plain.stats.STR.points);
  });

  it('does not multiply the consistency bonus', () => {
    const buckets = dayWith({
      steps: 10_000,
      activeKcal: 400,
      activeMinutes: 60,
      activeHours: 9,
    });
    const result = computeDailyScore({ buckets, featuredStat: 'VIT' });
    expect(result.consistencyBonus).toBe(800);
  });

  it('does not multiply the REC bonus', () => {
    const result = computeDailyScore({
      buckets: dayWith({ steps: 10_000 }),
      sleepMinutes: 8 * 60,
      featuredStat: 'AGI',
    });
    expect(result.recBonus).toBe(500);
  });

  it('cannot resurrect a stat that scored nothing', () => {
    const result = computeDailyScore({ buckets: hours(24), featuredStat: 'AGI' });
    expect(result.stats.AGI.points).toBe(0);
  });
});

describe('worked scenarios from the spec', () => {
  it('gym day, low steps = 2,900', () => {
    const result = computeDailyScore({
      buckets: dayWith({
        steps: 2_000, // AGI bronze
        activeKcal: 450, // STR gold
        activeMinutes: 45, // END silver
        activeHours: 6, // VIT silver
      }),
    });
    expect(result.stats.AGI.points).toBe(200);
    expect(result.stats.STR.points).toBe(900);
    expect(result.stats.END.points).toBe(500);
    expect(result.stats.VIT.points).toBe(500);
    expect(result.consistencyBonus).toBe(800);
    expect(result.healthTotal).toBe(2_900);
  });

  it('lazy Sunday, walked to the mall = 1,300', () => {
    const result = computeDailyScore({
      buckets: dayWith({
        steps: 6_000, // AGI silver
        activeKcal: 0, // STR none
        activeMinutes: 15, // END bronze
        activeHours: 4, // VIT bronze
      }),
    });
    expect(result.stats.STR.points).toBe(0);
    expect(result.contributingStats).toBe(3);
    expect(result.consistencyBonus).toBe(400);
    expect(result.healthTotal).toBe(1_300);
  });

  it('complete rest day = 0', () => {
    const result = computeDailyScore({ buckets: hours(24) });
    expect(result.healthTotal).toBe(0);
  });
});

describe('score ceilings', () => {
  it('caps a phone-only day at 4,400', () => {
    const result = computeDailyScore({
      buckets: dayWith({
        steps: 40_000,
        activeKcal: 2_000,
        activeMinutes: 600,
        activeHours: 24,
      }),
    });
    expect(result.healthTotal).toBe(MAX_DAILY_SCORE_PHONE_ONLY);
    expect(result.healthTotal).toBe(4_400);
  });

  it('caps a wearable day at 4,900', () => {
    const result = computeDailyScore({
      buckets: dayWith({
        steps: 40_000,
        activeKcal: 2_000,
        activeMinutes: 600,
        activeHours: 24,
      }),
      sleepMinutes: 8 * 60,
    });
    expect(result.healthTotal).toBe(MAX_DAILY_SCORE_WITH_WEARABLE);
    expect(result.healthTotal).toBe(4_900);
  });

  it('exposes the per-stat ceilings, featured and not', () => {
    expect(STAT_POINTS_MAX).toBe(900);
    expect(STAT_POINTS_MAX_FEATURED).toBe(
      Math.round(STAT_POINTS_MAX * FEATURED_STAT_MULTIPLIER),
    );
  });

  it('exposes daily ceilings that account for the featured multiplier', () => {
    // Three stats at Gold, one featured Gold, plus the consistency bonus.
    expect(MAX_DAILY_SCORE_PHONE_ONLY_FEATURED).toBe(
      MAX_DAILY_SCORE_PHONE_ONLY + (STAT_POINTS_MAX_FEATURED - STAT_POINTS_MAX),
    );
    expect(MAX_DAILY_SCORE_WITH_WEARABLE_FEATURED).toBe(
      MAX_DAILY_SCORE_WITH_WEARABLE + (STAT_POINTS_MAX_FEATURED - STAT_POINTS_MAX),
    );
  });

  it('keeps the un-featured ceilings as the spec states them', () => {
    // §5 quotes 4,400 and 4,900; those remain correct for a day with no
    // featured stat, which is why the names above are additive rather than
    // replacements.
    expect(MAX_DAILY_SCORE_PHONE_ONLY).toBe(4_400);
    expect(MAX_DAILY_SCORE_WITH_WEARABLE).toBe(4_900);
  });

  it('reaches the featured ceiling from a real maximal day', () => {
    // Not a restatement of the constants: this drives computeDailyScore to the
    // top and proves the arithmetic the constants document is the arithmetic
    // the engine performs.
    const result = computeDailyScore({
      buckets: dayWith({
        steps: 40_000,
        activeKcal: 2_000,
        activeMinutes: 600,
        activeHours: 24,
      }),
      featuredStat: 'AGI',
    });
    expect(result.healthTotal).toBe(MAX_DAILY_SCORE_PHONE_ONLY_FEATURED);
  });
});

describe('XP', () => {
  it('awards 10/25/50 per bronze/silver/gold stat', () => {
    const result = computeDailyScore({
      buckets: dayWith({
        steps: 1_000, // bronze -> 10
        activeKcal: 200, // silver -> 25
        activeMinutes: 60, // gold  -> 50
        activeHours: 3, // bronze -> 10
      }),
    });
    expect(result.xp).toBe(95);
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
});

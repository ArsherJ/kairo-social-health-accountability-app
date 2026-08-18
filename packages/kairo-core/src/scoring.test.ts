import { describe, expect, it } from 'vitest';
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
  tierFor,
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

  it('never itself counts toward the consistency bonus', () => {
    // REC-the-bonus is still not a core stat and adds nothing on its own.
    // MND now reads the same sleepMinutes input and *does* legitimately
    // contribute (roadmap deviation #41) — 480 minutes is gold — so this
    // is a 1-stat day, not a 0-stat day as it was before MND existed.
    const result = computeDailyScore({ buckets: hours(24), sleepMinutes: 480 });
    expect(result.contributingStats).toBe(1);
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

  // MAX_DAILY_SCORE_WITH_WEARABLE (4,900) is a four-stat figure and is not
  // re-tuned by this task (Task 4 of the three-stat-model switch does that).
  // With MND now scoring transitionally alongside the still-live REC bonus
  // (deviation #41; both paying at once is expected during the expand
  // phase), a maxed wearable day is arithmetically higher than the constant
  // describes: 5 stats at gold (4,500) + REC's 500 = 5,000. The constant
  // itself is asserted unchanged in "keeps the ceilings as the spec states
  // them" below; this scenario just no longer equals it.
  it('scores a maxed wearable day above the (stale, four-stat) 4,900 ceiling', () => {
    const result = computeDailyScore({
      buckets: dayWith({
        steps: 40_000,
        activeKcal: 2_000,
        activeMinutes: 600,
        activeHours: 24,
      }),
      sleepMinutes: 8 * 60,
    });
    expect(result.healthTotal).toBe(5_000);
    expect(result.healthTotal).toBeGreaterThan(MAX_DAILY_SCORE_WITH_WEARABLE);
  });

  it('exposes one per-stat ceiling, derived from the tier table', () => {
    expect(STAT_POINTS_MAX).toBe(900);
  });

  it('keeps the ceilings as the spec states them', () => {
    // §5 quotes 4,400 and 4,900. With the rotation retired (deviation #10)
    // stored points are always base points, so these are now the only
    // ceilings — the *_FEATURED variants were deleted rather than left to
    // describe scores the engine no longer produces.
    expect(MAX_DAILY_SCORE_PHONE_ONLY).toBe(4_400);
    expect(MAX_DAILY_SCORE_WITH_WEARABLE).toBe(4_900);
  });

  it('still applies the multiplier when a featured stat is passed explicitly', () => {
    // No caller on the write path does this, but V1 may resurrect the rotation
    // as a read-time projection — so the arithmetic stays proven rather than
    // merely present.
    const result = computeDailyScore({
      buckets: dayWith({
        steps: 40_000,
        activeKcal: 2_000,
        activeMinutes: 600,
        activeHours: 24,
      }),
      featuredStat: 'AGI',
    });
    expect(result.healthTotal).toBe(
      MAX_DAILY_SCORE_PHONE_ONLY +
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

describe('nextTierFor', () => {
  it('names bronze and the gap for a stat with no tier yet', () => {
    expect(nextTierFor('AGI', 0)).toEqual({
      tier: 'bronze', gap: 1_000, bandLow: 0, pointsGain: 200,
    });
  });

  it('names silver from inside bronze', () => {
    expect(nextTierFor('AGI', 4_760)).toEqual({
      tier: 'silver', gap: 240, bandLow: 1_000, pointsGain: 300,
    });
  });

  it('names gold from inside silver', () => {
    expect(nextTierFor('AGI', 8_760)).toEqual({
      tier: 'gold', gap: 1_240, bandLow: 5_000, pointsGain: 400,
    });
  });

  // Gold is the ceiling (§6). There is no Diamond.
  it('returns null at gold', () => {
    expect(nextTierFor('AGI', 10_000)).toBeNull();
    expect(nextTierFor('AGI', 25_000)).toBeNull();
  });

  it("uses each stat's own thresholds and units", () => {
    expect(nextTierFor('STR', 120)).toEqual({ tier: 'silver', gap: 80, bandLow: 50 , pointsGain: 300 });
    expect(nextTierFor('END', 9)).toEqual({ tier: 'bronze', gap: 1, bandLow: 0 , pointsGain: 200 });
    expect(nextTierFor('VIT', 5)).toEqual({ tier: 'silver', gap: 1, bandLow: 3 , pointsGain: 300 });
  });

  // active_minutes is numeric(6,2), so raw values arrive fractional. Telling
  // someone they need 0.4 more minutes is not an instruction.
  it('rounds a fractional gap up to a whole unit', () => {
    expect(nextTierFor('END', 29.6)).toEqual({ tier: 'silver', gap: 1, bandLow: 10 , pointsGain: 300 });
  });

  // The boundary is inclusive in tierFor, so it must be inclusive here too or
  // the two disagree about what "at silver" means.
  it('agrees with tierFor on the boundary', () => {
    expect(tierFor('STR', 200)).toBe('silver');
    expect(nextTierFor('STR', 200)).toEqual({ tier: 'gold', gap: 200, bandLow: 200 , pointsGain: 400 });
  });

  // `bandLow` is the current band's floor — the tier threshold `raw` is at or
  // above, or 0 below bronze — so a caller can compute a true fraction
  // through the band (`gap / (threshold - bandLow)`) instead of a fraction of
  // the target value, which only agreed with "share of band" in the first band.
  describe('bandLow', () => {
    it('is 0 below bronze', () => {
      expect(nextTierFor('VIT', 0)?.bandLow).toBe(0);
      expect(nextTierFor('VIT', 2)?.bandLow).toBe(0);
    });

    it('is the bronze threshold inside the bronze band (heading to silver)', () => {
      // VIT bronze = 3, silver = 6. raw=4 is inside bronze, heading to silver.
      expect(nextTierFor('VIT', 4)).toEqual({ tier: 'silver', gap: 2, bandLow: 3 , pointsGain: 300 });
    });

    it('is the silver threshold inside the silver band (heading to gold)', () => {
      // VIT silver = 6, gold = 9. raw=7 is inside silver, heading to gold.
      expect(nextTierFor('VIT', 7)).toEqual({ tier: 'gold', gap: 2, bandLow: 6 , pointsGain: 400 });
    });

    it('is moot at gold — nextTierFor returns null, there is nothing to band', () => {
      expect(nextTierFor('VIT', 9)).toBeNull();
    });
  });
});

describe('nextTierFor — what the gap is worth', () => {
  // `pointsGain` exists so the character screen can say "1,240 more steps for
  // +400 AGI" without naming a tier. The bands still decide the number; they
  // just stopped being the vocabulary the user reads.

  it('is the difference between the two bands, not the next band’s value', () => {
    // Crossing into Silver from inside Bronze is worth 500 - 200, not 500.
    expect(nextTierFor('AGI', 4_999)!.pointsGain).toBe(300);
  });

  it('is the full band value when nothing has been earned yet', () => {
    expect(nextTierFor('AGI', 0)!.pointsGain).toBe(200);
  });

  it('is always positive, for every stat and every raw value', () => {
    const stats: CoreStat[] = ['AGI', 'STR', 'END', 'VIT', 'MND'];
    for (const stat of stats) {
      for (const raw of [0, 1, 9, 50, 199, 250, 999, 5_000, 9_999]) {
        const next = nextTierFor(stat, raw);
        if (next) expect(next.pointsGain).toBeGreaterThan(0);
      }
    }
  });

  it('sums to the gold band from a standing start', () => {
    // Bronze + the two steps up must equal what a gold day is worth, or the
    // copy would promise points the scorer does not award.
    const toBronze = nextTierFor('VIT', 0)!.pointsGain;
    const toSilver = nextTierFor('VIT', 3)!.pointsGain;
    const toGold = nextTierFor('VIT', 6)!.pointsGain;
    expect(toBronze + toSilver + toGold).toBe(STAT_POINTS_MAX);
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
});

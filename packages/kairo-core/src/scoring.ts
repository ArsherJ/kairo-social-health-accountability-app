import {
  CORE_STATS,
  type CoreStat,
  type DailyScore,
  type DailyScoreInput,
  type DayTotals,
  type HourBucket,
  type StatResult,
  type Tier,
} from './types.ts';

/** An hour counts toward VIT once it contains this many steps. */
export const VIT_ACTIVE_HOUR_STEPS = 250;

/** The weekly featured stat scores at this multiple. */
export const FEATURED_STAT_MULTIPLIER = 1.5;

const TIER_POINTS: Record<Tier, number> = {
  none: 0,
  bronze: 200,
  silver: 500,
  gold: 900,
};

/**
 * A single stat's Gold ceiling (§6). Derived from the tier table rather than
 * repeated, so raising Gold cannot leave a UI sizing bars against the old
 * number with no test to catch it.
 */
export const STAT_POINTS_MAX = TIER_POINTS.gold;

/** The same stat when it is the week's featured stat. */
export const STAT_POINTS_MAX_FEATURED = Math.round(
  STAT_POINTS_MAX * FEATURED_STAT_MULTIPLIER,
);

/** Maximum for a day with NO featured stat. §5 quotes this figure. */
export const MAX_DAILY_SCORE_PHONE_ONLY = 4_400;
/** Maximum for a day with NO featured stat. §5 quotes this figure. */
export const MAX_DAILY_SCORE_WITH_WEARABLE = 4_900;

// The weekly featured stat (§6) scores at 1.5x, so the true ceilings sit
// 450 points higher than the figures §5 quotes. Nothing clamps to any of
// these — they exist so UI can size against a real maximum rather than one
// a featured stat quietly exceeds.
export const MAX_DAILY_SCORE_PHONE_ONLY_FEATURED = 4_850;
export const MAX_DAILY_SCORE_WITH_WEARABLE_FEATURED = 5_350;

const TIER_XP: Record<Tier, number> = {
  none: 0,
  bronze: 10,
  silver: 25,
  gold: 50,
};

/**
 * Minimum raw value to reach each tier.
 *
 * VIT's gold threshold is a floor, not the spec table's "9-12 hrs" range: a
 * genuinely active person can clear 12 active hours, and dropping them to zero
 * for it would be absurd.
 */
const THRESHOLDS: Record<CoreStat, Record<Exclude<Tier, 'none'>, number>> = {
  AGI: { bronze: 1_000, silver: 5_000, gold: 10_000 },
  STR: { bronze: 50, silver: 200, gold: 400 },
  END: { bronze: 10, silver: 30, gold: 60 },
  VIT: { bronze: 3, silver: 6, gold: 9 },
};

/** Indexed by how many core stats contributed. Rewards breadth over specialisation. */
const CONSISTENCY_BONUS: readonly number[] = [0, 0, 150, 400, 800];

export function tierFor(stat: CoreStat, raw: number): Tier {
  const t = THRESHOLDS[stat];
  if (raw >= t.gold) return 'gold';
  if (raw >= t.silver) return 'silver';
  if (raw >= t.bronze) return 'bronze';
  return 'none';
}

/**
 * REC is a bonus laid on top of the four core stats — never a penalty. Users
 * without a wearable simply never reach this function.
 */
export function recBonusFor(sleepMinutes: number): number {
  const hrs = sleepMinutes / 60;
  if (hrs < 5) return 0;
  if (hrs < 6) return 100;
  if (hrs < 7) return 250;
  if (hrs <= 9) return 500;
  return 200; // oversleeping
}

export function aggregateBuckets(buckets: readonly HourBucket[]): DayTotals {
  const totals: DayTotals = {
    steps: 0,
    distanceM: 0,
    activeKcal: 0,
    activeMinutes: 0,
    activeHours: 0,
  };

  for (const b of buckets) {
    totals.steps += b.steps;
    totals.distanceM += b.distanceM;
    totals.activeKcal += b.activeKcal;
    totals.activeMinutes += b.activeMinutes;
    if (b.steps >= VIT_ACTIVE_HOUR_STEPS) totals.activeHours += 1;
  }

  return totals;
}

function rawFor(stat: CoreStat, totals: DayTotals): number {
  switch (stat) {
    case 'AGI':
      return totals.steps;
    case 'STR':
      return totals.activeKcal;
    case 'END':
      return totals.activeMinutes;
    case 'VIT':
      return totals.activeHours;
  }
}

/**
 * The single source of scoring truth, shared verbatim by the Expo client and
 * the Supabase Edge Functions. Pure: no I/O, no clock, no randomness.
 *
 * The returned `healthTotal` deliberately excludes sabotage. Sabotage is
 * replayed separately from its immutable event log so that nothing ever
 * mutates a score in place.
 */
export function computeDailyScore(input: DailyScoreInput): DailyScore {
  const { buckets, sleepMinutes = null, featuredStat = null } = input;

  const totals = aggregateBuckets(buckets);

  const stats = {} as Record<CoreStat, StatResult>;
  let contributingStats = 0;
  let statPoints = 0;
  let xp = 0;

  for (const stat of CORE_STATS) {
    const raw = rawFor(stat, totals);
    const tier = tierFor(stat, raw);
    const base = TIER_POINTS[tier];
    const points =
      stat === featuredStat ? Math.round(base * FEATURED_STAT_MULTIPLIER) : base;

    stats[stat] = { tier, raw, base, points };

    if (tier !== 'none') contributingStats += 1;
    statPoints += points;
    xp += TIER_XP[tier];
  }

  // Neither the consistency bonus nor REC is multiplied by the featured stat —
  // the weekly meta shifts which stat is worth grinding, not the reward for
  // breadth or for sleeping well.
  const consistencyBonus = CONSISTENCY_BONUS[contributingStats] ?? 0;
  const hasRec = sleepMinutes !== null && sleepMinutes !== undefined;
  const recBonus = hasRec ? recBonusFor(sleepMinutes) : 0;

  return {
    totals,
    stats,
    contributingStats,
    consistencyBonus,
    recBonus,
    hasRec,
    healthTotal: statPoints + consistencyBonus + recBonus,
    xp,
    featuredStat,
  };
}

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

/**
 * The multiple a featured stat scores at, if one is supplied.
 *
 * **Nothing on the write path supplies one** — deviation #10 retired the weekly
 * rotation from stored scoring, because a stored multiplier would stack with a
 * squad program's read-time weight (an AGI week in a running squad = 2.25×).
 * This is kept, and kept tested, because V1 may resurrect the rotation as a
 * read-time projection on All-around boards.
 */
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

/**
 * Ceilings for a stored day. §5 quotes both figures.
 *
 * These are now the *only* ceilings: with the rotation retired, stored points
 * are always base points, so nothing quietly exceeds them. The `*_FEATURED`
 * variants that used to sit here were deleted with deviation #10 rather than
 * left to describe scores the engine no longer produces.
 *
 * Nothing clamps to either number — scores are replayed, not clamped — so they
 * exist for UI sizing and for tests to check the arithmetic against.
 */
export const MAX_DAILY_SCORE_PHONE_ONLY = 4_400;
export const MAX_DAILY_SCORE_WITH_WEARABLE = 4_900;

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

export interface NextTier {
  tier: Exclude<Tier, 'none'>;
  /** Raw units still needed to reach it, rounded up. Always > 0. */
  gap: number;
  /**
   * The floor of the current band: the highest tier threshold `raw` is at or
   * above, or 0 when `raw` has not reached bronze. Together with the next
   * threshold (`gap + raw`) this lets a caller compute a true fraction
   * through the current band — `gap / (threshold - bandLow)` — rather than a
   * fraction of the target value, which only agrees with "share of band" in
   * the first band, where the floor is 0.
   */
  bandLow: number;
  /**
   * Points this stat would *gain* by crossing into `tier` — the difference
   * between the two bands, not the new band's value.
   *
   * Here rather than in the caller because it is derived from `TIER_POINTS`,
   * which this module owns and does not export. It exists so the character
   * screen can say "1,240 more steps for +400 AGI": the bands still decide the
   * number, they just stopped being the vocabulary the user reads.
   */
  pointsGain: number;
}

/**
 * The next tier up from a raw value, or null once Gold is reached — Gold is
 * the ceiling (§6) and nothing above it exists.
 *
 * Reads the same THRESHOLDS table as `tierFor`, so the two can never disagree
 * about where a boundary sits. Raw values arrive fractional from
 * `active_minutes numeric(6,2)`, and a gap of "0.4 more minutes" is not an
 * instruction, so the gap is rounded up to a whole unit.
 */
export function nextTierFor(stat: CoreStat, raw: number): NextTier | null {
  const t = THRESHOLDS[stat];
  if (raw < t.bronze) {
    return {
      tier: 'bronze',
      gap: Math.ceil(t.bronze - raw),
      bandLow: 0,
      pointsGain: TIER_POINTS.bronze - TIER_POINTS.none,
    };
  }
  if (raw < t.silver) {
    return {
      tier: 'silver',
      gap: Math.ceil(t.silver - raw),
      bandLow: t.bronze,
      pointsGain: TIER_POINTS.silver - TIER_POINTS.bronze,
    };
  }
  if (raw < t.gold) {
    return {
      tier: 'gold',
      gap: Math.ceil(t.gold - raw),
      bandLow: t.silver,
      pointsGain: TIER_POINTS.gold - TIER_POINTS.silver,
    };
  }
  return null;
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
 * `healthTotal` is the whole of a day: it is built from that user's own buckets
 * and nothing else, and nothing subtracts from it. Program weighting exists but
 * happens at *read* time in `squad_leaderboard()` (deviation #11), so the stored
 * number stays canonical and program-independent.
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

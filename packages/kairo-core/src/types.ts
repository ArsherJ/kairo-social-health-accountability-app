/** Contribution tier for a single stat on a single day. */
export type Tier = 'none' | 'bronze' | 'silver' | 'gold';

/** The four phone-only competitive stats. REC is a wearable bonus, not a core stat. */
export type CoreStat = 'AGI' | 'STR' | 'END' | 'VIT';

export const CORE_STATS: readonly CoreStat[] = ['AGI', 'STR', 'END', 'VIT'];

/**
 * One hour of health data in the user's local timezone — the canonical
 * ingestion unit. Upserts on (user, local_date, hour) are idempotent, which is
 * what makes re-syncs and Apple's retroactive step revisions safe.
 */
export interface HourBucket {
  /** 0-23, local time. */
  hour: number;
  steps: number;
  /** Walking + running distance. Stored for anti-cheat cross-checks; not scored. */
  distanceM: number;
  activeKcal: number;
  activeMinutes: number;
}

export interface DayTotals {
  steps: number;
  distanceM: number;
  activeKcal: number;
  activeMinutes: number;
  /** Hours with at least VIT_ACTIVE_HOUR_STEPS steps. Drives VIT. */
  activeHours: number;
}

export interface StatResult {
  tier: Tier;
  /** The underlying measurement this tier was derived from. */
  raw: number;
  /** Tier points before the weekly featured-stat multiplier. */
  base: number;
  /** Tier points after the weekly featured-stat multiplier. */
  points: number;
}

export interface DailyScoreInput {
  buckets: readonly HourBucket[];
  /** Wearable users only. Null/absent means the REC row simply doesn't exist. */
  sleepMinutes?: number | null;
  /** The week's 1.5x featured stat, if any. */
  featuredStat?: CoreStat | null;
}

export interface DailyScore {
  totals: DayTotals;
  stats: Record<CoreStat, StatResult>;
  /** How many core stats reached at least bronze. Drives the consistency bonus. */
  contributingStats: number;
  consistencyBonus: number;
  recBonus: number;
  /** Whether the user has sleep data at all — controls the leaderboard's wearable icon. */
  hasRec: boolean;
  /** Total from health alone, before any sabotage effects are replayed. */
  healthTotal: number;
  xp: number;
  featuredStat: CoreStat | null;
}

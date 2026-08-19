/** Contribution tier for a single stat on a single day. */
export type Tier = 'none' | 'bronze' | 'silver' | 'gold';

/**
 * The three competitive stats (roadmap deviation #41).
 *
 * END and VIT are **not deleted measurements** — they are the same signals
 * expressed as threshold shifts: `activeHours` lowers AGI's bands and verified
 * workout minutes lower STR's (see `shifts.ts`). `aggregateBuckets` still
 * computes both. They stopped being stats, not measurements.
 *
 * MND is sleep, promoted from the REC bonus. It is the only stat a user can be
 * unable to earn, which is why stat points are normalized by `earnableStats`
 * (spec §2) — a wearable buys a third route to the same ceiling, not a higher
 * one.
 */
export type CoreStat = 'AGI' | 'STR' | 'MND';

export const CORE_STATS: readonly CoreStat[] = ['AGI', 'STR', 'MND'];

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
  /**
   * Hours with at least `VIT_ACTIVE_HOUR_STEPS` steps.
   *
   * Drove VIT until deviation #41; it now drives AGI's **spread shift**, which
   * is the same signal spent as generosity instead of as points. The constant
   * keeps its name on purpose (spec §1: "untouched") — the threshold is the
   * same 250 steps it always was, and renaming it would make every historical
   * reference to it read as describing something else.
   */
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
  /**
   * Attributed sleep for the day. Null/absent means no sleep row exists, and
   * MND simply scores none — never a penalty.
   */
  sleepMinutes?: number | null;
  /** The week's 1.5x featured stat, if any. */
  featuredStat?: CoreStat | null;
  /**
   * How many stats this user can earn today. Defaults to all of them.
   *
   * Passed in rather than derived: deciding it needs a trailing window over
   * `daily_sleep` (`hasSleepCapability`), which is I/O and a clock — neither of
   * which may enter this package. `earnableStats()` in `capability.ts` is where
   * the number comes from.
   */
  earnableStats?: number;
  /**
   * Minutes from workouts passing `workoutVerified`. Unverified sessions
   * contribute 0.
   *
   * Also passed in rather than derived, and for a sharper reason: the
   * allowlist that decides "verified" lives server-side on purpose (spec §3),
   * so a pure function could not apply it even in principle.
   */
  verifiedWorkoutMinutes?: number;
}

export interface DailyScore {
  totals: DayTotals;
  stats: Record<CoreStat, StatResult>;
  /** How many core stats reached at least bronze. Drives the consistency bonus. */
  contributingStats: number;
  consistencyBonus: number;
  /**
   * `3 / earnableStats` — what stat points were multiplied by (spec §2).
   *
   * Reported rather than left implicit because it is the one number that
   * explains why two users with identical steps and kcal can score
   * differently, and the update note has to be able to say so.
   */
  normalizationFactor: number;
  /** Whether the user has sleep data at all — controls the leaderboard's wearable icon. */
  hasRec: boolean;
  /** The day's whole score, from this user's own activity. Nothing reduces it. */
  healthTotal: number;
  /**
   * Progression XP for the day, **after** normalization.
   *
   * Scaled by the same `3 / earnableStats` factor as stat points: a level is
   * the thing a user watches move, so leaving it unscaled would put the
   * gradient §2 removes from the leaderboard back on the slower surface, where
   * it is harder to notice and harder to explain.
   */
  xp: number;
  featuredStat: CoreStat | null;
}

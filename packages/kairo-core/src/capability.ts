import { addDays } from './day.ts';

/**
 * How much of the game a user can play, and what that does to their score.
 *
 * MND is the only stat that can be unreachable — it needs a trusted sleep
 * source. Left alone, that would make a wearable worth 27% of the daily
 * ceiling and a permanent leaderboard gradient, which lands hardest on the
 * users least likely to own one. So a day's stat points scale by
 * `total stats / earnable stats` (spec §2), and a wearable buys a third route
 * to the same ceiling rather than a higher one.
 */

/**
 * Trusted sleep inside this trailing window makes MND earnable.
 *
 * **Both obvious alternatives are traps, and both were found in design.**
 * Keying off *today's* data inverts the incentive: skip tracking tonight, be
 * normalized as a two-stat user, and score more for sleeping less. Keying off
 * `profiles.has_wearable` fails the other way, because that flag is
 * deliberately sticky — someone who abandons a wearable would be divided by
 * three forever with MND stuck at zero, punished twice for one thing.
 *
 * A fortnight is long enough that one missed night is invisible, and short
 * enough that abandoning a wearable is noticed. Gaming it costs fourteen
 * nights of untracked sleep to buy a normalization bump worth far less.
 */
export const SLEEP_CAPABILITY_WINDOW_DAYS = 14;

/**
 * `scoringSleepDates` are local dates (`YYYY-MM-DD`) on which sleep data that
 * **scores** arrived — trusted or flagged, per `scoresAtAll`. Only nights
 * rejected as hand-typed are excluded.
 *
 * **This was resolved the other way in Phase 1 and corrected here.** If a
 * night scores MND, it must also make MND earnable. Excluding flagged nights
 * from capability while still scoring them lets a user earn three stats and be
 * normalized as a two-stat user: (1,200 x 3) x 1.5 + 800 = 6,200, against a
 * stated ceiling of 4,400. The consequence is deliberate — the allowlist no
 * longer affects score at all, and survives as the `flagged` social signal
 * (§20) it was always documented to be.
 *
 * Lexicographic comparison is exact for this format.
 */
export function hasSleepCapability(
  scoringSleepDates: readonly string[],
  today: string,
): boolean {
  const windowStart = addDays(today, -(SLEEP_CAPABILITY_WINDOW_DAYS - 1));
  return scoringSleepDates.some((date) => date >= windowStart && date <= today);
}

export function earnableStats(hasSleep: boolean): number {
  return hasSleep ? 3 : 2;
}

/**
 * `totalStats` is passed in rather than read from `CORE_STATS.length` so this
 * module never imports the `CoreStat` union. Phase 2 changes that union from
 * four members to three; this file must not need editing when it does.
 */
export function normalizationFactor(earnable: number, totalStats: number): number {
  if (earnable <= 0) return 1;
  return totalStats / earnable;
}

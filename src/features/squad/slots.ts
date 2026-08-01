/**
 * How many squad slots are filled, and how many are still locked (§7).
 *
 * `memberCount` must come from `squad_members`, never from the leaderboard's
 * row count: `squad_leaderboard` returns one row per *scored* member, so a
 * squadmate who joined this morning and has not moved yet is absent from it.
 * Deriving locked slots from the board would render a real person as an empty
 * slot and invite them again.
 */

export interface Slots {
  filled: number;
  locked: number;
}

export function resolveSlots({
  memberCount,
  maxMembers,
}: {
  /** Undefined while the count query is still in flight. */
  memberCount: number | undefined;
  maxMembers: number;
}): Slots {
  // No count yet is not "an empty squad" — showing a full set of locked slots
  // during a load would flash a lie at the user and then correct itself.
  if (memberCount === undefined) return { filled: 0, locked: 0 };

  const filled = Math.max(0, memberCount);
  // A cap can shrink under an existing squad (a lapsed Legendary), which would
  // otherwise ask the renderer for a negative number of rows.
  const locked = Math.max(0, maxMembers - filled);

  return { filled, locked };
}

/**
 * Whether a slot has just been unlocked — §7's "squad slot unlocked" moment.
 *
 * Membership changes have nothing to subscribe to (Phase 4 follow-up #8), so
 * the reveal is a comparison across refetches rather than an event. The first
 * observed count is never a reveal: opening the app to a squad you already had
 * is not somebody joining.
 */
export function shouldRevealUnlock(
  previous: number | undefined,
  next: number | undefined,
): boolean {
  if (previous === undefined || next === undefined) return false;
  return next > previous;
}

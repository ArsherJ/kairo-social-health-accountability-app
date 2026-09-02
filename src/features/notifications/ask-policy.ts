/**
 * When Kairo may ask for notification permission.
 *
 * A plain function for the same reason the health permission decision is one:
 * this is the ask you get exactly one chance at. iOS shows its dialog once per
 * install, and a "Don't Allow" there is effectively permanent — nothing in the
 * app can re-prompt, only Settings can.
 *
 * §5: every ask has a visible why. So the ask waits for the user to have
 * something worth being notified about — a squad, or a battle running. Never
 * during onboarding, where the why does not exist yet.
 *
 * A running battle counts on its own, with no squad flag set — though today it
 * cannot occur without one, since `events_need_squad` makes every Event a
 * squad's. The condition stays as its own reason rather than being folded into
 * `hasSquad`, so the ask does not silently re-couple to squad membership if an
 * Event ever stops needing a squad. `event_completed` is the budget-exempt
 * trigger it is anticipating.
 *
 * **A first scored day is the third reason, added 2026-09-02.** The two social
 * reasons above meant the ask never reached a solo player, and Kairo is
 * solo-first: most new accounts are alone for their first days, the Digest is
 * the only scheduled push the product has, and `digestCopy()`'s solo branch —
 * written deliberately to speak no rank — could not be received by anybody. The
 * first scored day is the earliest moment the Digest has something true to
 * report, and it supplies a why the player can see rather than one borrowed
 * from a squad. The two social reasons are unchanged and still fire earlier.
 *
 * The other half of this shipped in the same pass and the two correct each
 * other: `users_needing_digest()` now stops sending to an account with no
 * scored day in seven local days. Opening the ask without that suppression
 * gives a lapsed solo player a push every morning they would never previously
 * have received. See deviation #60.
 */

export type NotificationPermission = 'undetermined' | 'granted' | 'denied';

export function shouldAskForNotifications(input: {
  permission: NotificationPermission;
  hasSquad: boolean;
  hasEvent: boolean;
  /**
   * Whether the account has ever scored a day above zero — the same lifetime
   * reading the disclosure gate uses (`useScoredDayCount`), and lifetime rather
   * than a recent window for the same reason: a returning player is not a new
   * one, and asking again is not possible anyway.
   */
  hasScoredDay: boolean;
  /** Dismissal is per-session, matching HealthPermissionSheet: there is no
   * "never ask again" until there is a settings screen to re-enable from. */
  dismissedThisSession: boolean;
}): boolean {
  if (input.permission !== 'undetermined') return false;
  if (input.dismissedThisSession) return false;
  return input.hasSquad || input.hasEvent || input.hasScoredDay;
}

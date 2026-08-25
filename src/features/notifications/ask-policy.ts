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
 */

export type NotificationPermission = 'undetermined' | 'granted' | 'denied';

export function shouldAskForNotifications(input: {
  permission: NotificationPermission;
  hasSquad: boolean;
  hasEvent: boolean;
  /** Dismissal is per-session, matching HealthPermissionSheet: there is no
   * "never ask again" until there is a settings screen to re-enable from. */
  dismissedThisSession: boolean;
}): boolean {
  if (input.permission !== 'undetermined') return false;
  if (input.dismissedThisSession) return false;
  return input.hasSquad || input.hasEvent;
}

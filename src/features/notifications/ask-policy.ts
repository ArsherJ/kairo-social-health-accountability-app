/**
 * When Kairo may ask for notification permission.
 *
 * A plain function for the same reason the health permission decision is one:
 * this is the ask you get exactly one chance at. iOS shows its dialog once per
 * install, and a "Don't Allow" there is effectively permanent — nothing in the
 * app can re-prompt, only Settings can.
 *
 * §5: every ask has a visible why. So the ask waits for the user to have
 * something worth being notified about — a squad, or a banana to the face.
 * Never during onboarding, where the why does not exist yet.
 */

export type NotificationPermission = 'undetermined' | 'granted' | 'denied';

export function shouldAskForNotifications(input: {
  permission: NotificationPermission;
  hasSquad: boolean;
  hasBeenSabotaged: boolean;
  /** Dismissal is per-session, matching HealthPermissionSheet: there is no
   * "never ask again" until there is a settings screen to re-enable from. */
  dismissedThisSession: boolean;
}): boolean {
  if (input.permission !== 'undetermined') return false;
  if (input.dismissedThisSession) return false;
  return input.hasSquad || input.hasBeenSabotaged;
}

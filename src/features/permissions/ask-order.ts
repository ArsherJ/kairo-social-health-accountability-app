// Relative, not `@/`: this module is exercised by vitest, whose config does not
// carry Metro's path alias. Every other pure module under test does the same.
import type { HealthPermissionState } from '../health/permission-state.ts';
import {
  shouldAskForNotifications,
  type NotificationPermission,
} from '../notifications/ask-policy.ts';

/**
 * Which permission Kairo asks for right now — **at most one, ever**.
 *
 * This exists because of a real defect, not for tidiness. The two sheets were
 * separate `<Modal>`s mounted at different levels (`NotificationPermissionSheet`
 * at the tabs shell, `HealthPermissionSheet` inside the character screen), and
 * a `<Modal>` presents on the root view controller wherever it is mounted. When
 * both became visible in the same frame UIKit refused the second —
 * *"Attempt to present … which is already presenting …"* — and the loser was
 * suppressed with no error surfaced to the user. On a fresh install by someone
 * who already had a squad, the loser was the **Health** sheet: the only in-app
 * route to the app's entire data source. It also left UIKit wedged badly enough
 * that the tab bar stopped accepting touches until the device was rebooted.
 *
 * Making that impossible needs one decision function and one modal host, not
 * two components each confident it is the only one on screen.
 *
 * **Health goes first.** It is the data source: without it every score is zero,
 * and a notification ask answered first would be promising to announce nothing.
 * §5's "every ask has a visible why" is about *whether* to ask; this is about
 * the order once more than one has a why, which §5 does not address.
 *
 * Pure, so the ordering is testable without a device, a modal, or a permission
 * dialog — the same reason `shouldAskForNotifications` is pure.
 */

export type PermissionAsk = 'health' | 'notifications' | null;

export interface PermissionAskInput {
  health: HealthPermissionState;
  /** Per-session dismissal, matching the sheets' own "not now". */
  healthDismissed: boolean;
  notification: NotificationPermission;
  notificationDismissed: boolean;
  hasSquad: boolean;
  hasEvent: boolean;
  /**
   * Whether the user has already answered *an* ask this session. Answering
   * Health makes the notification ask eligible in the same frame, and a second
   * sheet arriving as the first slides away reads as a permission gauntlet —
   * which is how an install spends its one iOS dialog on a "Don't Allow".
   */
  answeredAnAskThisSession: boolean;
}

export function nextPermissionAsk(input: PermissionAskInput): PermissionAsk {
  if (input.answeredAnAskThisSession) return null;

  if (input.health === 'should-ask' && !input.healthDismissed) return 'health';

  // Delegated rather than reimplemented: §14/§5's conditions for the
  // notification ask live in one tested place, and this function only decides
  // ordering between asks that are already eligible.
  if (
    shouldAskForNotifications({
      permission: input.notification,
      hasSquad: input.hasSquad,
      hasEvent: input.hasEvent,
      dismissedThisSession: input.notificationDismissed,
    })
  ) {
    return 'notifications';
  }

  return null;
}

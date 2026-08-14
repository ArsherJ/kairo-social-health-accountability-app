import type { NotificationPermission } from './ask-policy.ts';

/**
 * What the Profile row says about notifications.
 *
 * The August QA pass turned notifications off in iOS Settings mid-session and
 * found Kairo carried on as though nothing had changed — no status anywhere, no
 * way back, and nothing to explain why the day-end reminder never arrived. The
 * app cannot re-prompt once iOS has a denial on file, so silence there is
 * permanent: the only route back is Settings, and only the app can point at it.
 *
 * Pure, so the wording is testable without a simulator — the same split
 * `ask-policy.ts` already keeps between the rule and `expo-notifications`.
 */
export interface NotificationStatus {
  /** The state, in one word. */
  value: string;
  help: string;
  /** Label for the control that opens iOS Settings, or null when none is needed. */
  action: string | null;
}

export function notificationStatus(
  permission: NotificationPermission,
): NotificationStatus {
  if (permission === 'granted') {
    return {
      value: 'On',
      // Names the limits rather than selling the feature: someone deciding
      // whether to leave this on wants to know how noisy it gets.
      help: 'Day-end reminders and goal alerts. Three a day at most, and never overnight.',
      action: null,
    };
  }

  if (permission === 'denied') {
    return {
      value: 'Off',
      // States the consequence, then the fix. No apology, and no pleading —
      // this is a setting the user chose and may well want to keep.
      help: 'You will not get day-end reminders or goal alerts. iOS only lets you turn these back on in Settings.',
      action: 'Open Settings',
    };
  }

  // Not asked yet. `PermissionAsks` raises this in context after squad or goal
  // activity, so pre-empting it here with a button would be the onboarding
  // ambush that policy exists to avoid.
  return {
    value: 'Not set',
    help: 'Kairo will ask once you have a squad or a goal to be reminded about.',
    action: null,
  };
}

/**
 * The APNs environment the running build actually registered against.
 *
 * `'development'` is the sandbox, `'production'` is the live service, and
 * `null` is a simulator, which cannot register with APNs at all.
 */
export type PushEnvironment = 'development' | 'production' | null;

/**
 * A one-line delivery diagnostic, shown under the permission state.
 *
 * This exists because granting the permission proves nothing about whether a
 * push can arrive. Two things sit between the two and both fail silently: the
 * `aps-environment` entitlement baked into the committed `ios/` (deviation
 * #28 means EAS is not there to set it), and whether a token was ever handed
 * to the server. Neither is visible from a log this machine can read — USB
 * pairing is blocked at the kernel — so the build has to say so itself.
 *
 * It ships in Release on purpose. `__DEV__` would hide it from TestFlight,
 * which is the only place the question can be asked.
 *
 * Returns `null` when there is nothing worth saying: no permission means no
 * registration was attempted, and the row above already explains that.
 */
export function deliveryStatus(input: {
  permission: NotificationPermission;
  environment: PushEnvironment;
  registered: boolean;
}): string | null {
  if (input.permission !== 'granted') return null;

  if (input.environment === null) {
    // A simulator. Worth naming rather than reporting a failure — nothing is
    // wrong, and this is where most hand verification happens.
    return 'Delivery: simulator — this device cannot receive push.';
  }

  if (!input.registered) {
    // The state that used to be invisible: permission on, no token, so the
    // server has nothing to address and every push silently reaches nobody.
    return `Delivery: not registered (${input.environment}). Reopen Kairo to retry.`;
  }

  return `Delivery: registered (${input.environment}).`;
}

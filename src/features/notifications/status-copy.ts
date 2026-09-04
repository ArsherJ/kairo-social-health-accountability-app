import { DIGEST_LOCAL_HOUR } from './ask-copy.ts';
import type { NotificationPermission } from './ask-policy.ts';

/**
 * What the Profile row says about notifications.
 *
 * The August QA pass turned notifications off in iOS Settings mid-session and
 * found Kairo carried on as though nothing had changed — no status anywhere, no
 * way back, and nothing to explain why the reminder never arrived (the 23:00
 * pair, in the shape the app had then; the 08:00 digest now). The app cannot
 * re-prompt once iOS has a denial on file, so silence there is permanent: the
 * only route back is Settings, and only the app can point at it.
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
      //
      // **Three retired or false claims went from this line.** "Day-end
      // reminders" named the 23:00 and 00:00 pair, which deviation #52 dropped
      // on 2026-08-25. "Three a day at most" named a cap the engine does not
      // enforce, since `BUDGET_EXEMPT` sends bypass the budget without
      // consuming it. And "never overnight" was the replacement's own mistake:
      // quiet hours live in `planNotifications`, which `finalize-days` does not
      // call, so the two alerts named here are exactly the ones that arrive in
      // the small hours. See `ask-copy.ts`, which carries the argument.
      help: `One digest at ${DIGEST_LOCAL_HOUR}am, plus alerts when a boss goes down or a challenge clears — those arrive when your day closes.`,
      action: null,
    };
  }

  if (permission === 'denied') {
    return {
      value: 'Off',
      // States the consequence, then the fix. No apology, and no pleading —
      // this is a setting the user chose and may well want to keep.
      help: 'You will not get the morning digest or battle alerts. iOS only lets you turn these back on in Settings.',
      action: 'Open Settings',
    };
  }

  // Not asked yet. `PermissionAsks` raises this in context after squad or battle
  // activity, so pre-empting it here with a button would be the onboarding
  // ambush that policy exists to avoid.
  return {
    value: 'Not set',
    help: 'Kairo will ask once you have a squad or a battle to be reminded about.',
    action: null,
  };
}

/**
 * The APNs environment the running build registered against, when it can be
 * read at all.
 *
 * **`null` does not mean simulator.** `expo-application` reads this out of
 * `embedded.mobileprovision`, and App Store and TestFlight distribution strip
 * that file from the bundle — the library's own `appReleaseType` has an
 * explicit branch for its absence. So on the one install where the question
 * matters most, the answer is structurally unavailable. Treating that null as
 * "simulator" is a mistake this diagnostic shipped with on 2026-08-14 and it
 * told a TestFlight device it could not receive push while it was receiving
 * push. Simulator is decided by the release type instead.
 */
export type PushEnvironment = 'development' | 'production' | null;

/**
 * A one-line delivery diagnostic, shown under the permission state.
 *
 * This exists because granting the permission proves nothing about whether a
 * push can arrive, and the gap between the two is silent. It ships in Release
 * on purpose: `__DEV__` would hide it from TestFlight, which is the only place
 * the question can be asked.
 *
 * **What it reports is registration, not the entitlement** — a correction to
 * how it was first built. Registration is both knowable everywhere and the
 * stronger signal: `getExpoPushTokenAsync` fails outright with "no valid
 * aps-environment entitlement string found" when the entitlement is wrong, so
 * a token that exists is evidence the entitlement is right. The environment is
 * appended only where it can be read, and its absence is not worth explaining
 * to a beta tester.
 *
 * Returns `null` when there is nothing worth saying: no permission means no
 * registration was attempted, and the row above already explains that.
 */
export function deliveryStatus(input: {
  permission: NotificationPermission;
  /** From the release type, not from a missing environment. See above. */
  isSimulator: boolean;
  environment: PushEnvironment;
  registered: boolean;
}): string | null {
  if (input.permission !== 'granted') return null;

  if (input.isSimulator) {
    // Worth naming rather than reporting a failure — nothing is wrong, and
    // this is where most hand verification happens.
    return 'Delivery: simulator — this device cannot receive push.';
  }

  // The state that would otherwise be invisible: permission on, no token, so
  // the server has nothing to address and every push reaches nobody.
  if (!input.registered) return 'Delivery: not registered. Reopen Kairo to retry.';

  // The environment rides along only when the provisioning profile is present
  // to be read — a development or ad-hoc build. On TestFlight there is no
  // profile in the bundle and "registered" is the whole of the answer.
  return input.environment === null
    ? 'Delivery: registered.'
    : `Delivery: registered (${input.environment}).`;
}

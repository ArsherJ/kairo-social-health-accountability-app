import {
  configureBackgroundTypes,
  subscribeToChanges,
  UpdateFrequency,
} from '@kingstinct/react-native-healthkit';

/**
 * Observer queries and background delivery.
 *
 * ## Status: generated and verified 2026-08-23
 *
 * Two separate things have to be true for a terminated app to be woken by
 * HealthKit, and both now come from Expo config rather than native hand-edits:
 *
 * 1. **The entitlement.** `app.config.ts` passes `background: true` to the
 *    HealthKit plugin.
 * 2. **Observer registration in `didFinishLaunchingWithOptions`.** The
 *    project-owned `withHealthKitBackgroundObservers` plugin injects
 *    `setupBackgroundObservers()` into the generated AppDelegate.
 *
 * EAS iOS build 21 was generated with CNG, and its 2026-08-23 device pass
 * verified foreground and background delivery. `configureBackgroundTypes`
 * persists the observed types while the injected launch call restores their
 * native observers when iOS starts the app for a delivery.
 *
 * **Background delivery is best-effort regardless.** The native observer calls
 * iOS's completion handler as soon as JS is notified, not when the sync
 * finishes, so the process can be suspended mid-request. The foreground flush
 * is the guarantee; this is the optimisation.
 */

/**
 * The types worth waking for. Sleep and the anti-cheat signals are read during
 * a sync but do not trigger one — they never move a score on their own, and
 * every extra observed type multiplies the wake-ups.
 */
export const KAIRO_OBSERVED_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierAppleExerciseTime',
] as const;

export function subscribeToHealthChanges(
  identifier: (typeof KAIRO_OBSERVED_TYPES)[number],
  onChange: () => void,
): { remove: () => void } {
  return subscribeToChanges(identifier, () => {
    onChange();
  });
}

/**
 * Registers the observed types for background delivery.
 *
 * `hourly`, not `immediate`: iOS caps background delivery for cumulative types
 * like step count at hourly anyway, which is exactly the bucket granularity
 * §11 chose. Asking for `immediate` would buy nothing and cost wake-ups.
 *
 * Safe to call repeatedly — the configuration is replaced, not appended.
 */
export async function configureHealthBackgroundDelivery(): Promise<boolean> {
  try {
    return await configureBackgroundTypes(
      [...KAIRO_OBSERVED_TYPES],
      UpdateFrequency.hourly,
    );
  } catch {
    // Never worth failing the caller: without this the app still syncs on
    // foreground, which is the path that actually carries the guarantee.
    return false;
  }
}

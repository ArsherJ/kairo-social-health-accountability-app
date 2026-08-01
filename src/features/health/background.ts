import {
  configureBackgroundTypes,
  subscribeToChanges,
  UpdateFrequency,
} from '@kingstinct/react-native-healthkit';

/**
 * Observer queries and background delivery.
 *
 * ## Status: registration is written, delivery is NOT verified
 *
 * Two separate things have to be true for a terminated app to be woken by
 * HealthKit, and only one of them currently is:
 *
 * 1. **The entitlement.** Present — `app.config.ts` passes `background: true`
 *    and `ios/Kairo/Kairo.entitlements` carries
 *    `com.apple.developer.healthkit.background-delivery`.
 * 2. **Observer registration in `didFinishLaunchingWithOptions`.** *Missing.*
 *    The library's Expo plugin runs only `withEntitlementsPlist` and
 *    `withInfoPlist` — it does not patch the AppDelegate — and nothing in the
 *    pod self-registers. `BackgroundDeliveryManager.swift`'s own docstring says
 *    `setupBackgroundObservers()` must be called from the AppDelegate, and
 *    `ios/Kairo/AppDelegate.swift` contains no HealthKit reference at all.
 *
 * So today `configureBackgroundTypes` persists its configuration and registers
 * observers *for the running process*. Foreground and backgrounded-but-alive
 * sync work. Cold launch from a background delivery does not, until a
 * project-owned config plugin injects that call. Recorded in `docs/roadmap.md`
 * rather than fixed here, because it needs a device to verify and this machine
 * has none.
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

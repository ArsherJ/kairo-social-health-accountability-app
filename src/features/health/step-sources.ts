/**
 * Which apps' steps Kairo counts, and what to say about the ones it does not.
 *
 * Zero-import on purpose, so root Vitest can hold it: `read.ts`, its only
 * caller, reaches the HealthKit library and React Native's Flow syntax that the
 * runner cannot parse. Same arrangement `stat-names.ts` and `kairo-voice.ts`
 * have, for the same reason.
 *
 * **This decides nothing about scoring.** It partitions a list of sources so
 * `read.ts` can pass the trusted ones to HealthKit as a source predicate on the
 * *same* combined statistics query it already runs. That matters: Apple
 * deduplicates within one query, which is what stops an iPhone and a paired
 * Watch counting the same steps twice (deviation #8). Summing per-source sums
 * looks equivalent and rebuilds that double count for exactly the most
 * competitive users.
 *
 * **Exclusion is inert, never accusatory.** An unrecognised source does not
 * flag the day. §5's own rule is that a false positive costs more than a miss,
 * and the Philippine market runs cheap bands that write to HealthKit under
 * their own identifiers — "count Apple only and flag the rest" would accuse the
 * target market of cheating for owning the hardware it owns. The posture is
 * `workout-units.ts`'s: inert beats wrong.
 */

/** A source as HealthKit reports it. Structural, so `SourceProxy` satisfies it. */
export interface HealthSourceIdentity {
  readonly name: string;
  readonly bundleIdentifier: string;
}

/**
 * Device-recorded data carries a per-device identifier under this prefix —
 * `com.apple.health.<device-uuid>` — so this is a prefix rule and not an exact
 * list like `WORKOUT_SOURCE_ALLOWLIST`'s. One list per shape of identifier.
 *
 * **The trailing dot is load-bearing** and so is the case. Without the dot,
 * `com.apple.healthkitreporter` would match. And `com.apple.Health` — capital
 * H — is the *Health app*, i.e. hand entry: it differs from this prefix only by
 * case, so a case-insensitive match would trust typed-in numbers, leaving
 * `EXCLUDE_TYPED_IN` as the only thing between a typed figure and the score.
 * Two independent rules is the point; do not collapse them to one.
 */
export const DEVICE_SOURCE_PREFIX = 'com.apple.health.';

/**
 * Bridges that write step counts Kairo is willing to count, by exact
 * identifier.
 *
 * **Deliberately empty, and that is a decision rather than a stub.** No cohort
 * exists yet, so any entry here would be a guess about which bands the market
 * carries — and a wrong guess in this direction is the only one that inflates a
 * score. The disclosure line is how the list gets filled: it names the apps
 * players actually carry, which is a real answer instead of a guess made before
 * anyone had the app. Add entries as they are observed, not in anticipation.
 */
export const STEP_SOURCE_BRIDGE_ALLOWLIST: readonly string[] = [];

export interface StepSourcePartition<T> {
  /**
   * Pass these to HealthKit as `filter.sources`, **as-is**.
   *
   * They are the very objects that came in, not copies, and that is a
   * requirement rather than an efficiency: the native side recovers each one
   * with `source as? SourceProxy`, so a reconstructed object downcasts to nil,
   * contributes no predicate, and the query counts every source silently. This
   * function is generic for that reason — it never reads a field it does not
   * need, and never rebuilds one.
   */
  trusted: T[];
  /** Display names for the disclosure line, de-duplicated, first-seen order. */
  droppedNames: string[];
}

function isTrusted(bundleIdentifier: string, alsoTrust: readonly string[]): boolean {
  // `startsWith` rather than a regex: the prefix contains dots, and a regex
  // spelled without escaping them would match `comXappleXhealthX`.
  if (bundleIdentifier.startsWith(DEVICE_SOURCE_PREFIX)) {
    // A device carries an identifier after the dot. The bare prefix is not one.
    return bundleIdentifier.length > DEVICE_SOURCE_PREFIX.length;
  }
  return (
    STEP_SOURCE_BRIDGE_ALLOWLIST.includes(bundleIdentifier) ||
    alsoTrust.includes(bundleIdentifier)
  );
}

/**
 * Split the day's step sources into the ones to count and the ones to name.
 *
 * `alsoTrust` exists for exactly one caller: `read.ts` passes the app's own
 * bundle identifier under `__DEV__`, because `dev-seed.ts` writes its samples
 * as Kairo and would otherwise be dropped by this — which would take the
 * simulator dev loop out a second time, right after the typed-in predicate took
 * it out the first. It is not a general extension point, and in a release build
 * it is empty.
 */
export function partitionStepSources<T extends HealthSourceIdentity>(
  sources: readonly T[],
  alsoTrust: readonly string[] = [],
): StepSourcePartition<T> {
  const trusted: T[] = [];
  const droppedNames: string[] = [];

  for (const source of sources) {
    if (isTrusted(source.bundleIdentifier, alsoTrust)) {
      trusted.push(source);
      continue;
    }
    // A source that reports no usable name still has to be nameable, or the
    // line reads "Steps from aren't counted yet".
    const name = source.name.trim() || source.bundleIdentifier;
    if (!droppedNames.includes(name)) droppedNames.push(name);
  }

  return { trusted, droppedNames };
}

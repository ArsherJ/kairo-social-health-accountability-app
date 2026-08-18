/**
 * Three-way trust verdict over a health sample's origin, shared by sleep and
 * workouts (spec §3).
 *
 * **The allowlist is not here on purpose.** It lives server-side in the Edge
 * Function, so it can change without an app release and so a forged client
 * cannot promote itself past a list it does not hold. The client sends the
 * bundle identifier and the user-entered flag; the server decides. Same
 * arrangement `profiles.has_wearable` already uses — capability observed from
 * data, never asserted.
 */

export type SampleTrust = 'trusted' | 'flagged' | 'rejected';

export interface SampleOrigin {
  /** Apple's `HKWasUserEntered` metadata, as read off the sample. */
  wasUserEntered: boolean;
  /** `sourceRevision.source.bundleIdentifier`, or null if absent. */
  sourceBundleId: string | null;
}

export function sampleTrust(
  origin: SampleOrigin,
  allowlist: readonly string[],
): SampleTrust {
  if (origin.wasUserEntered) return 'rejected';
  if (origin.sourceBundleId !== null && allowlist.includes(origin.sourceBundleId)) {
    return 'trusted';
  }
  return 'flagged';
}

/**
 * A flagged sample still scores. `flagged` is a social signal (§20), never a
 * ban and never a score reduction — reading it as "discard" is the mistake
 * this function exists to prevent.
 */
export function scoresAtAll(trust: SampleTrust): boolean {
  return trust !== 'rejected';
}

/**
 * Which scheme the app draws in — the decision, with nothing attached to it.
 *
 * Zero imports, so root Vitest can hold it: the store that remembers the
 * choice reaches MMKV and the hook that applies it reaches React Native, and
 * neither can be loaded by the runner. This is the `ask-policy.ts` /
 * `milestones.ts` split applied to appearance.
 *
 * Three preferences, and `system` is the default because a phone already has
 * an answer to this question and asking it twice is how an app ends up dark
 * at noon. The other two exist for the person whose answer differs from their
 * phone's — a reader who keeps iOS dark for the battery and wants the bird in
 * daylight, or the reverse.
 */
export type AppearancePreference = 'system' | 'light' | 'dark';

export type ResolvedScheme = 'light' | 'dark';

/** In the order Settings draws them. `system` first because it is the default. */
export const APPEARANCE_OPTIONS: readonly { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export const DEFAULT_APPEARANCE: AppearancePreference = 'system';

/**
 * A stored value, or anything else, back to a preference.
 *
 * Anything unrecognised is the default rather than an error: the only way an
 * unknown string reaches storage is a future preference this build does not
 * know, and following the phone is the right answer for a build that does not
 * know.
 */
export function parseAppearance(raw: unknown): AppearancePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : DEFAULT_APPEARANCE;
}

/**
 * The scheme to draw.
 *
 * `system` follows the phone; a phone that reports nothing (an old simulator,
 * a web preview) is read as light, because that is what the app was before
 * it had a dark scheme and a silent flip to dark is the surprising failure.
 */
export function resolveScheme(
  preference: AppearancePreference,
  system: ResolvedScheme | null | undefined,
): ResolvedScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

/** The one-line help under the Settings control, following what is chosen. */
export function appearanceHelp(preference: AppearancePreference): string {
  switch (preference) {
    case 'system':
      return 'Follows your phone. Dark at night if your phone is.';
    case 'light':
      return 'Daylight, whatever your phone is set to.';
    case 'dark':
      return 'Night, whatever your phone is set to.';
  }
}

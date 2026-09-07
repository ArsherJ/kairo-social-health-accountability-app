import { colors, ramp } from '../theme.ts';

/**
 * The grounds an `Avatar` draws an initial on, and the ink that goes on each.
 *
 * **Here rather than in `Avatar.tsx` for the reason `stat-names.ts` is not in
 * `StatIcon.tsx`:** that file reaches React Native, whose Flow syntax root
 * Vitest cannot parse, so the table was unreachable by the one test that exists
 * to check exactly this — and `contrast.test.ts` is the file whose whole job is
 * "every painted fill in the app, and what may be set on it". A tint table with
 * no tested ink is where somebody picks a step that looks fine to them.
 *
 * It found a real one. The self tint set `colors.bg` on `colors.accent` —
 * **cream on a bright fill, 2.65:1** — which is the single pairing the palette
 * forbids and which `contrast.test.ts` already asserts *fails*, one file away.
 * It is `colors.text` now, at 5.53:1. `ramp.accent[900]` is the tempting
 * alternative, since it is the ink the other four rows use, and it measures
 * 4.39 against this brighter ground: near enough to pass a glance and not near
 * enough to pass AA.
 *
 * Two ramps rather than four, because the palette has two lanes and inventing
 * a third to tell six people apart would cost more than it buys. The ramp step
 * is the role — a wash you set text on — never a hue: `ramp.sage` is a violet
 * under Playful and was a green before it, and these rows did not move.
 */
export interface AvatarTint {
  /** The disc. */
  bg: string;
  /** The initial on it. */
  ink: string;
}

export const AVATAR_TINTS: readonly AvatarTint[] = [
  { bg: ramp.accent[400], ink: ramp.accent[900] },
  { bg: ramp.sage[400], ink: ramp.sage[900] },
  { bg: ramp.accent[300], ink: ramp.accent[900] },
  { bg: ramp.sage[300], ink: ramp.sage[900] },
];

/** You, and only you. The primary fill, so it takes ink and never cream. */
export const SELF_AVATAR_TINT: AvatarTint = { bg: colors.accent, ink: colors.text };

/** djb2, trimmed. Any stable spread will do; this one is four lines. */
function hash(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The tint for a name.
 *
 * Derived rather than stored, so a squad reads as distinguishable people the
 * first time it renders and without a column that could disagree with itself
 * across devices.
 */
export function avatarTint(name: string, self = false): AvatarTint {
  if (self) return SELF_AVATAR_TINT;
  return AVATAR_TINTS[hash(name) % AVATAR_TINTS.length]!;
}

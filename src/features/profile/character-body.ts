/**
 * Which character the player chose to be.
 *
 * Deliberately **not** `profiles.sex`. That column exists, is already in the
 * client grants, and would need no migration — but its documented purpose is
 * physiological (HealthKit's calorie estimate, §5) and this question is
 * cosmetic, which is how §6 files character appearance. One column answering
 * two questions is what deviation #22 removed `profiles.focus` for.
 *
 * The values mirror `check (character_body in ('male', 'female'))` in
 * `20260811120000_character_body.sql`. `sex` additionally allows 'other'; this
 * does not, and the two lists must not be assumed to track each other.
 */
export const CHARACTER_BODIES = ['male', 'female'] as const;

export type CharacterBody = (typeof CHARACTER_BODIES)[number];

/**
 * An untrusted route param as a body, or `null`.
 *
 * `null` is a real answer here — "never asked" — not a failure. Someone
 * deep-linking `/name` with no param gets the default character rather than a
 * screen that refuses to render, which is what the nullable column is for.
 *
 * Takes `unknown` rather than `string | string[] | undefined` so the validation
 * is total: this is the boundary where a value stops being data off a URL.
 */
export function parseCharacterBody(raw: unknown): CharacterBody | null {
  if (typeof raw !== 'string') return null;
  return (CHARACTER_BODIES as readonly string[]).includes(raw)
    ? (raw as CharacterBody)
    : null;
}

/**
 * Character-name rules, shared by the client's inline validation and the
 * database CHECK on profiles.character_name.
 *
 * The constraint is `char_length(btrim(character_name)) between 2 and 20`, so
 * length is measured after trimming. Clients should store the normalized form
 * — the database would accept padding, but then two players could hold names
 * that render identically.
 */

export const CHARACTER_NAME_MIN = 2;
export const CHARACTER_NAME_MAX = 20;

export function normalizeCharacterName(raw: string): string {
  return raw.trim();
}

export function isValidCharacterName(raw: string): boolean {
  const length = normalizeCharacterName(raw).length;
  return length >= CHARACTER_NAME_MIN && length <= CHARACTER_NAME_MAX;
}

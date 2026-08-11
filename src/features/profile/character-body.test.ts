import { describe, expect, it } from 'vitest';
import { CHARACTER_BODIES, parseCharacterBody } from './character-body.ts';

describe('parseCharacterBody', () => {
  it('accepts each body the column allows', () => {
    expect(parseCharacterBody('male')).toBe('male');
    expect(parseCharacterBody('female')).toBe('female');
  });

  it('lists exactly the two values in the CHECK constraint', () => {
    // Mirrors `check (character_body in ('male', 'female'))`. A value this
    // accepts and the database rejects is a 23514 the user can do nothing
    // with — the same discipline body-metrics.ts applies to its bounds.
    expect([...CHARACTER_BODIES]).toEqual(['male', 'female']);
  });

  it('returns null for a missing param rather than throwing', () => {
    // Deep-linking /name directly is legitimate. The column is nullable
    // precisely so this renders a default character instead of a dead screen.
    expect(parseCharacterBody(undefined)).toBeNull();
    expect(parseCharacterBody(null)).toBeNull();
    expect(parseCharacterBody('')).toBeNull();
  });

  it('rejects a value outside the CHECK', () => {
    // `profiles.sex` allows 'other'; this column deliberately does not, and
    // the two must not be conflated.
    expect(parseCharacterBody('other')).toBeNull();
    expect(parseCharacterBody('Male')).toBeNull();
  });

  it('rejects a repeated query param', () => {
    // expo-router types a search param as `string | string[]`. `?body=male&body=female`
    // arrives as an array, which is an ambiguous answer, not a choice.
    expect(parseCharacterBody(['male', 'female'])).toBeNull();
    expect(parseCharacterBody(['male'])).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(parseCharacterBody(0)).toBeNull();
    expect(parseCharacterBody({})).toBeNull();
  });
});

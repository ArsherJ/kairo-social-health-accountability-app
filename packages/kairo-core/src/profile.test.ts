import { describe, expect, it } from 'vitest';
import {
  CHARACTER_NAME_MAX,
  CHARACTER_NAME_MIN,
  isValidCharacterName,
  normalizeCharacterName,
} from './profile.ts';

describe('normalizeCharacterName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeCharacterName('  Aeon  ')).toBe('Aeon');
  });

  it('leaves inner spacing alone', () => {
    expect(normalizeCharacterName('Shadow Monarch')).toBe('Shadow Monarch');
  });
});

describe('isValidCharacterName', () => {
  it('rejects an empty name', () => {
    expect(isValidCharacterName('')).toBe(false);
  });

  it('rejects whitespace only', () => {
    expect(isValidCharacterName('     ')).toBe(false);
  });

  it('rejects one character', () => {
    expect(isValidCharacterName('A')).toBe(false);
  });

  it('accepts exactly the minimum', () => {
    expect(isValidCharacterName('A'.repeat(CHARACTER_NAME_MIN))).toBe(true);
  });

  it('accepts exactly the maximum', () => {
    expect(isValidCharacterName('A'.repeat(CHARACTER_NAME_MAX))).toBe(true);
  });

  it('rejects one past the maximum', () => {
    expect(isValidCharacterName('A'.repeat(CHARACTER_NAME_MAX + 1))).toBe(false);
  });

  it('measures the trimmed length, matching the database CHECK', () => {
    // btrim() in the constraint means padding cannot buy length...
    expect(isValidCharacterName(' A ')).toBe(false);
    // ...nor cost it.
    expect(isValidCharacterName(`  ${'A'.repeat(CHARACTER_NAME_MAX)}  `)).toBe(true);
  });
});

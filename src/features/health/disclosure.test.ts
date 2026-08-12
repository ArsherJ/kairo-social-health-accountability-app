import { describe, expect, it } from 'vitest';
import {
  disclosedTypes,
  HEALTH_DISCLOSURE,
  overDisclosedTypes,
  undisclosedTypes,
} from './disclosure.ts';
import { KAIRO_READ_TYPES } from './read-types.ts';

describe('health disclosure', () => {
  it('names every type Kairo asks Apple Health for', () => {
    // The August finding, as a test: the sheet said four types, the request
    // asked for eight. iOS showed the user the true list either way, which is
    // what made the copy a trust problem rather than a wording one.
    expect(undisclosedTypes()).toEqual([]);
  });

  it('does not claim to read anything it never asks for', () => {
    expect(overDisclosedTypes()).toEqual([]);
  });

  it('accounts for each type exactly once', () => {
    const disclosed = disclosedTypes();
    expect(new Set(disclosed).size).toBe(disclosed.length);
    expect(disclosed).toHaveLength(KAIRO_READ_TYPES.length);
  });

  it('gives every group a label and a purpose', () => {
    for (const group of HEALTH_DISCLOSURE) {
      expect(group.types.length).toBeGreaterThan(0);
      expect(group.label.trim()).not.toBe('');
      expect(group.purpose.trim()).not.toBe('');
    }
  });

  it('says out loud that heart rate is not scored', () => {
    // §5 protects hourly movement, and heart rate is at least as revealing.
    // A reader who assumes it feeds their score has been misled by omission.
    const heart = HEALTH_DISCLOSURE.find((g) =>
      g.types.includes('HKQuantityTypeIdentifierHeartRate'),
    );
    expect(heart?.purpose).toMatch(/never scored/i);
  });
});

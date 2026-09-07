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

  /*
    The retired-stat, engine-key and never-scored-heart-rate rules used to sit
    here, and they are `claim-surfaces.test.ts`'s now.

    They were not wrong; they were one of three scans of one rule, and two
    scans of one rule always drift — one always ends up quietly narrower. This
    sheet is registered there as a claim-bearing surface, so the bans that
    caught "Score your END" and "Score your AGI" apply to it beside the policy
    page and the onboarding beats rather than only here.

    What stays in this file is what it is named after: the sheet is *derived*
    from `KAIRO_READ_TYPES`, and these are the assertions that keep the copy in
    step with the identifiers underneath it.
  */

  it('scores sleep, and says so', () => {
    // Sleep was promoted from a bonus to a full stat. This entry is the one
    // that understated what happens to the data rather than overstating it,
    // which is the direction that matters in a permission sheet.
    const sleep = HEALTH_DISCLOSURE.find((g) =>
      g.types.includes('HKCategoryTypeIdentifierSleepAnalysis'),
    );
    expect(sleep?.purpose).toMatch(/Mind/);
  });

});

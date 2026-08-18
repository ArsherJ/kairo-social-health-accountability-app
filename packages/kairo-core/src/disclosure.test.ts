import { describe, expect, it } from 'vitest';
import {
  DISCLOSURE_THRESHOLD_DAYS,
  disclosureStage,
} from './disclosure.ts';

describe('disclosureStage', () => {
  it('is core on a brand new account', () => {
    expect(disclosureStage(0)).toBe('core');
  });

  it('is still core the day before the threshold', () => {
    expect(disclosureStage(DISCLOSURE_THRESHOLD_DAYS - 1)).toBe('core');
  });

  it('is full at the threshold', () => {
    expect(disclosureStage(DISCLOSURE_THRESHOLD_DAYS)).toBe('full');
  });

  it('stays full well past it', () => {
    expect(disclosureStage(900)).toBe('full');
  });

  // The count is a lifetime total read off the server. A negative or
  // fractional value means the caller passed something it should not have —
  // failing open would hide the whole app from an existing user, so this
  // clamps toward showing less only for values below the threshold.
  it('treats a nonsense count as core rather than throwing', () => {
    expect(disclosureStage(-1)).toBe('core');
    expect(disclosureStage(Number.NaN)).toBe('core');
  });
});

describe('DISCLOSURE_THRESHOLD_DAYS', () => {
  // Pinned deliberately. Moving it is a product decision (design D30), and a
  // silent drift would change what every new user sees with no other signal.
  it('is 3', () => {
    expect(DISCLOSURE_THRESHOLD_DAYS).toBe(3);
  });
});

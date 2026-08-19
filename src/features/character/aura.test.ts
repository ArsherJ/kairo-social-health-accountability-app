import { describe, expect, it } from 'vitest';
import { statPointsForRating } from '@kairo/core';
import { AURA_RATING, AURA_STRONG_RATING, auraStrength } from './aura.ts';

/** Exactly the lifetime points that reach `rating`, via the curve's own inverse. */
function at(rating: number) {
  return statPointsForRating(rating);
}

function points(agi: number, str = 0, mnd = 0) {
  return { AGI: agi, STR: str, MND: mnd };
}

describe('auraStrength', () => {
  it('is absent for a character that has not started', () => {
    expect(auraStrength({ lifetimePoints: points(0), balanced: false })).toBe('none');
  });

  it('appears exactly at the threshold rating, not near it', () => {
    expect(
      auraStrength({ lifetimePoints: points(at(AURA_RATING) - 1), balanced: false }),
    ).toBe('none');
    expect(auraStrength({ lifetimePoints: points(at(AURA_RATING)), balanced: false })).toBe(
      'present',
    );
  });

  it('strengthens at the second threshold', () => {
    expect(
      auraStrength({ lifetimePoints: points(at(AURA_STRONG_RATING) - 1), balanced: false }),
    ).toBe('present');
    expect(
      auraStrength({ lifetimePoints: points(at(AURA_STRONG_RATING)), balanced: false }),
    ).toBe('strong');
  });

  it('reads the peak stat, so a specialist is not averaged away', () => {
    // §6 exists to make a specialist look different. A mean would hide one
    // very strong stat behind the untouched ones.
    expect(
      auraStrength({ lifetimePoints: points(at(AURA_STRONG_RATING), 0, 0), balanced: false }),
    ).toBe('strong');
  });

  it('keeps the All-Rounder ring at any rating', () => {
    // That ring predates this and means *shape*, not magnitude.
    expect(auraStrength({ lifetimePoints: points(0), balanced: true })).toBe('present');
  });

  it('does not promote the All-Rounder past what it earned', () => {
    expect(auraStrength({ lifetimePoints: points(at(AURA_RATING)), balanced: true })).toBe(
      'present',
    );
  });

  it('shows the balanced ring while the rollups are still loading', () => {
    // Absent data is not evidence of zero. Dropping the ring for a frame and
    // restoring it would read as a flicker on the one element that is meant to
    // say "you have got somewhere".
    expect(auraStrength({ lifetimePoints: undefined, balanced: true })).toBe('present');
    expect(auraStrength({ lifetimePoints: undefined, balanced: false })).toBe('none');
  });
});

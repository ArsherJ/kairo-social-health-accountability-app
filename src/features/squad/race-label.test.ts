import { describe, expect, it } from 'vitest';
import { raceLaneLabel } from './race-label.ts';

const base = {
  rank: 2,
  characterName: 'Bayani',
  isSelf: false,
  progressPercent: 61,
  finished: false,
  isGhost: false,
};

describe('raceLaneLabel', () => {
  it('leads with position, then who, then how far', () => {
    expect(raceLaneLabel(base)).toBe('2nd, Bayani, 61% to the finish line');
  });

  it('says "you" rather than your own name', () => {
    expect(raceLaneLabel({ ...base, isSelf: true })).toBe(
      '2nd, you, 61% to the finish line',
    );
  });

  it('says finished instead of a percentage once the line is crossed', () => {
    expect(raceLaneLabel({ ...base, rank: 1, finished: true, progressPercent: 100 })).toBe(
      '1st, Bayani, finished',
    );
  });

  it('names a ghost as a past day rather than a person', () => {
    expect(
      raceLaneLabel({ ...base, characterName: 'Saturday', isGhost: true }),
    ).toBe('2nd, your Saturday, 61% to the finish line');
  });

  it('ordinals 3rd and 4th correctly', () => {
    expect(raceLaneLabel({ ...base, rank: 3 })).toMatch(/^3rd,/);
    expect(raceLaneLabel({ ...base, rank: 4 })).toMatch(/^4th,/);
  });

  it('ordinals the irregular teens', () => {
    // Unreachable on a six-lane track today, and pinned anyway: this module is
    // the one place the rule lives, and a Today-tab strip could rank more.
    expect(raceLaneLabel({ ...base, rank: 11 })).toMatch(/^11th,/);
    expect(raceLaneLabel({ ...base, rank: 13 })).toMatch(/^13th,/);
    expect(raceLaneLabel({ ...base, rank: 21 })).toMatch(/^21st,/);
  });

  it('rounds rather than printing a fraction', () => {
    expect(raceLaneLabel({ ...base, progressPercent: 60.6 })).toMatch(/61%/);
  });

  it('says nothing about a lane with no position, which is a different label', () => {
    // A non-consenting squadmate never reaches this function — `RaceTrack`
    // gives them their own label, because "0% to the finish line" would state
    // that they did nothing today rather than that they are not sharing.
    expect(raceLaneLabel({ ...base, progressPercent: 0 })).toBe(
      '2nd, Bayani, 0% to the finish line',
    );
  });
});

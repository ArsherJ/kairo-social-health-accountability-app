import { describe, expect, it } from 'vitest';
import { MIND_OVERSLEEP_HOURS, MIND_THRESHOLD_HOURS, mindTierFor } from './mind.ts';

const hours = (h: number): number => h * 60;

describe('mindTierFor', () => {
  it('scores nothing below the bronze band', () => {
    expect(mindTierFor(hours(0))).toBe('none');
    expect(mindTierFor(hours(4.9))).toBe('none');
  });

  it('scores each band at its exact boundary', () => {
    expect(mindTierFor(hours(5))).toBe('bronze');
    expect(mindTierFor(hours(6))).toBe('silver');
    expect(mindTierFor(hours(7))).toBe('gold');
  });

  it('scores the middle of each band', () => {
    expect(mindTierFor(hours(5.5))).toBe('bronze');
    expect(mindTierFor(hours(6.5))).toBe('silver');
    expect(mindTierFor(hours(8))).toBe('gold');
  });

  // Nine hours is still a good night. The old recBonusFor paid its top figure
  // for `hrs <= 9`, and the tier boundary has to land in the same place or a
  // replayed day silently changes meaning.
  it('still scores gold at exactly nine hours', () => {
    expect(mindTierFor(hours(9))).toBe('gold');
  });

  // Oversleep flattens to bronze and never to none. MND is a promoted bonus:
  // spec §2 says "Bronze, never none", because a stat that punishes a long
  // night is a stat that punishes illness, jet lag and recovery.
  it('flattens oversleep to bronze rather than zero', () => {
    expect(mindTierFor(hours(9.1))).toBe('bronze');
    expect(mindTierFor(hours(12))).toBe('bronze');
    expect(mindTierFor(hours(24))).toBe('bronze');
  });

  it('treats a negative reading as no data rather than throwing', () => {
    expect(mindTierFor(-1)).toBe('none');
  });

  it('publishes its bands so nothing restates them', () => {
    expect(MIND_THRESHOLD_HOURS).toEqual({ bronze: 5, silver: 6, gold: 7 });
    expect(MIND_OVERSLEEP_HOURS).toBe(9);
  });
});

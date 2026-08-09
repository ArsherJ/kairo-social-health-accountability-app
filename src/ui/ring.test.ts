import { describe, expect, it } from 'vitest';
import { ringArcs } from './ring.ts';

describe('ringArcs', () => {
  it('hides both halves at zero, so an unstarted level reads as empty', () => {
    expect(ringArcs(0)).toEqual({ right: -180, left: -180 });
  });

  it('shows both halves at one, closing the ring', () => {
    expect(ringArcs(1)).toEqual({ right: 0, left: 0 });
  });

  it('sweeps only the right half across the first 50%', () => {
    // A quarter turn is 90°, which is halfway through the right half's own
    // 180° of travel — and the left half has not started moving.
    expect(ringArcs(0.25)).toEqual({ right: -90, left: -180 });
  });

  it('hands over at the halfway point with the right half exactly full', () => {
    expect(ringArcs(0.5)).toEqual({ right: 0, left: -180 });
  });

  it('holds the right half full while the left half sweeps', () => {
    // 75% is 270°: the right half is done and the left is halfway.
    expect(ringArcs(0.75)).toEqual({ right: 0, left: -90 });
  });

  it('never points a half past its own travel', () => {
    for (const fraction of [0, 0.1, 0.33, 0.5, 0.66, 0.9, 1]) {
      const { right, left } = ringArcs(fraction);
      expect(right).toBeGreaterThanOrEqual(-180);
      expect(right).toBeLessThanOrEqual(0);
      expect(left).toBeGreaterThanOrEqual(-180);
      expect(left).toBeLessThanOrEqual(0);
    }
  });

  it('advances monotonically, so the arc only ever grows', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 20; i += 1) {
      const { right, left } = ringArcs(i / 20);
      const swept = right + left;
      expect(swept).toBeGreaterThanOrEqual(previous);
      previous = swept;
    }
  });

  // `xpProgress` already clamps, but this ring is also fed by fixtures and by
  // any future caller. A ring that renders backwards is a worse failure than
  // one that reads empty — the same call `xpProgress` makes.
  it('clamps a fraction outside the unit range rather than inverting', () => {
    expect(ringArcs(-0.5)).toEqual(ringArcs(0));
    expect(ringArcs(4)).toEqual(ringArcs(1));
  });

  it('treats a nonsense fraction as empty', () => {
    expect(ringArcs(Number.NaN)).toEqual({ right: -180, left: -180 });
    expect(ringArcs(Number.POSITIVE_INFINITY)).toEqual({ right: -180, left: -180 });
  });
});

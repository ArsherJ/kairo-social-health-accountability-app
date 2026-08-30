import { describe, expect, it } from 'vitest';
import { tabPillGeometry } from './tab-pill-geometry.ts';

// The bar Kairo actually ships: four tabs, 6pt gaps, the selected tab 1.5x wide.
const FOUR = (index: number, rowWidth = 272) =>
  tabPillGeometry(index, rowWidth, 4, 6, 1.5);

describe('tabPillGeometry', () => {
  it('pins the first tab to the row edge', () => {
    expect(FOUR(0).left).toBe(0);
  });

  it('makes the pill focusedFlex units wide, whichever tab is selected', () => {
    const a = FOUR(0).width;
    const b = FOUR(2).width;
    expect(a).toBeCloseTo(b);
    // (272 - 3*6) / 4.5 = 56.44 per unit; the pill is 1.5 of those.
    expect(a).toBeCloseTo(84.67, 1);
  });

  it('lands the last tab flush against the row edge', () => {
    const { left, width } = FOUR(3);
    expect(left + width).toBeCloseTo(272);
  });

  it('steps left by one unit-plus-gap per tab', () => {
    const step = FOUR(1).left - FOUR(0).left;
    expect(FOUR(2).left - FOUR(1).left).toBeCloseTo(step);
    expect(FOUR(3).left - FOUR(2).left).toBeCloseTo(step);
  });

  it('scales with the measured row width', () => {
    expect(FOUR(3, 440).left + FOUR(3, 440).width).toBeCloseTo(440);
  });
});

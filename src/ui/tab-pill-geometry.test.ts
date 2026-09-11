import { describe, expect, it } from 'vitest';
import { TAB_ITEM_FLEX, TAB_ITEM_GAP, TAB_ITEMS } from './tab-copy.ts';
import { tabPillGeometry } from './tab-pill-geometry.ts';

// The bar Kairo actually ships: four equal tabs separated by 6pt gaps.
const FOUR = (index: number, rowWidth = 272) =>
  tabPillGeometry(index, rowWidth, TAB_ITEMS.length, TAB_ITEM_GAP, TAB_ITEM_FLEX);

describe('tabPillGeometry', () => {
  it('gives the current four-tab bar equal 63.5-point items', () => {
    expect([0, 1, 2, 3].map((index) => FOUR(index).width)).toEqual([
      63.5,
      63.5,
      63.5,
      63.5,
    ]);
  });

  it('places the equal items at each exact slot in the 272-point row', () => {
    expect([0, 1, 2, 3].map((index) => FOUR(index).left)).toEqual([
      0,
      69.5,
      139,
      208.5,
    ]);
  });

  it('still supports a generic bar whose selected item is wider', () => {
    const selected = tabPillGeometry(2, 272, 4, 6, 1.5);
    expect(selected.left).toBeCloseTo(124.89, 2);
    expect(selected.width).toBeCloseTo(84.67, 2);
  });

  it('scales with the measured row width', () => {
    expect(FOUR(3, 440).left + FOUR(3, 440).width).toBeCloseTo(440);
  });
});

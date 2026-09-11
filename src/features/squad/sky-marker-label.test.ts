import { describe, expect, it } from 'vitest';
import { skyMarkerLabelAbove } from './sky-marker-label.ts';

const marker = {
  boxHeight: 1000,
  figureSize: 60,
  pillHeight: 30,
  gap: 4,
  bottomClearance: 120,
};

describe('skyMarkerLabelAbove', () => {
  it('moves the pill above when the remaining flight tail cannot clear bottom chrome', () => {
    expect(skyMarkerLabelAbove({ ...marker, placementY: 0.82 })).toBe(true);
  });

  it('keeps the pill below at the exact boundary and through clear tail', () => {
    expect(skyMarkerLabelAbove({ ...marker, placementY: 0.816 })).toBe(false);
    expect(skyMarkerLabelAbove({ ...marker, placementY: 0.7 })).toBe(false);
  });
});

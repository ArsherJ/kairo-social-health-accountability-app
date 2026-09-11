import { describe, expect, it } from 'vitest';
import { skyMarkerLabelAbove, skyMarkerLayout } from './sky-marker-label.ts';

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

describe('skyMarkerLayout', () => {
  const wideRival = {
    placementX: 0.4,
    placementY: 0.5,
    boxWidth: 1000,
    boxHeight: 1000,
    figureSize: 44,
    labelMaxWidth: 120,
    pillHeight: 30,
    gap: 4,
    bottomClearance: 120,
    labelTier: 0,
  };

  it('keeps a 44-point bird on one anchor when its 120-point label crosses the exact threshold', () => {
    const atThreshold = skyMarkerLayout({ ...wideRival, placementY: 0.824 });
    const pastThreshold = skyMarkerLayout({ ...wideRival, placementY: 0.824001 });

    expect(atThreshold).toMatchObject({
      figureLeft: 378,
      figureTop: 802,
      labelSlotLeft: -38,
      labelAbove: false,
    });
    expect(pastThreshold.figureLeft).toBe(378);
    expect(pastThreshold.labelSlotLeft).toBe(-38);
    expect(pastThreshold.labelAbove).toBe(true);
  });

  it('moves only the wide label after its height is measured', () => {
    const beforeMeasurement = skyMarkerLayout({
      ...wideRival,
      placementY: 0.84,
      pillHeight: 0,
    });
    const afterMeasurement = skyMarkerLayout({ ...wideRival, placementY: 0.84 });

    expect(beforeMeasurement.labelAbove).toBe(false);
    expect(afterMeasurement.labelAbove).toBe(true);
    expect(afterMeasurement.figureLeft).toBe(beforeMeasurement.figureLeft);
    expect(afterMeasurement.figureTop).toBe(beforeMeasurement.figureTop);
    expect(afterMeasurement.labelSlotLeft).toBe(beforeMeasurement.labelSlotLeft);
  });

  it('keeps both the figure and its independently sized label inside 320 points', () => {
    const left = skyMarkerLayout({
      ...wideRival,
      placementX: 0,
      boxWidth: 320,
    });
    const right = skyMarkerLayout({
      ...wideRival,
      placementX: 1,
      boxWidth: 320,
    });

    expect(left.figureLeft).toBe(0);
    expect(left.labelSlotLeft).toBe(0);
    expect(right.figureLeft + wideRival.figureSize).toBe(320);
    expect(right.figureLeft + right.labelSlotLeft + wideRival.labelMaxWidth).toBe(320);
  });

  it('separates labels assigned to different tiers without moving their birds', () => {
    const first = skyMarkerLayout({ ...wideRival, labelTier: 0 });
    const third = skyMarkerLayout({ ...wideRival, labelTier: 2 });

    expect(first.figureLeft).toBe(third.figureLeft);
    expect(first.figureTop).toBe(third.figureTop);
    expect(first.labelOffset).toBe(0);
    expect(third.labelOffset).toBe(68);
  });

  it('keeps the full label and bird drift excursion before the minimap', () => {
    const layout = skyMarkerLayout({
      ...wideRival,
      placementX: 0.9,
      boxWidth: 320,
      rightClearance: 52,
      horizontalMotionClearance: 9,
    });

    expect(layout.figureLeft + wideRival.figureSize + 9).toBeLessThanOrEqual(268);
    expect(layout.figureLeft + layout.labelSlotLeft + wideRival.labelMaxWidth + 9)
      .toBeLessThanOrEqual(268);
  });
});

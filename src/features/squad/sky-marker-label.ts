export interface SkyMarkerLabelInput {
  placementY: number;
  boxHeight: number;
  figureSize: number;
  pillHeight: number;
  gap: number;
  bottomClearance: number;
  labelTier?: number;
  rightClearance?: number;
  horizontalMotionClearance?: number;
}

export interface SkyMarkerLayoutInput extends SkyMarkerLabelInput {
  placementX: number;
  boxWidth: number;
  labelMaxWidth: number;
}

export interface SkyMarkerLayout {
  figureLeft: number;
  figureTop: number;
  labelSlotLeft: number;
  labelAbove: boolean;
  labelOffset: number;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Keep a ground-level label out of bottom chrome without moving its bird. */
export function skyMarkerLabelAbove(input: SkyMarkerLabelInput): boolean {
  const placementY = Number.isFinite(input.placementY)
    ? Math.min(1, Math.max(0, input.placementY))
    : 0;
  const remainingTail = (1 - placementY) * nonNegative(input.boxHeight);
  const requiredTail = nonNegative(input.bottomClearance)
    + nonNegative(input.figureSize) / 2
    + nonNegative(input.gap)
    + nonNegative(input.pillHeight)
    + nonNegative(input.labelTier ?? 0) * (nonNegative(input.pillHeight) + nonNegative(input.gap));
  return remainingTail < requiredTail;
}

/** Anchor the bird to path geometry and position its independently sized label. */
export function skyMarkerLayout(input: SkyMarkerLayoutInput): SkyMarkerLayout {
  const figureSize = nonNegative(input.figureSize);
  const boxWidth = nonNegative(input.boxWidth);
  const labelWidth = Math.min(nonNegative(input.labelMaxWidth), boxWidth);
  const anchorX = Number.isFinite(input.placementX) ? input.placementX * boxWidth : 0;
  const motionClearance = nonNegative(input.horizontalMotionClearance ?? 0);
  const leftBound = Math.min(boxWidth, motionClearance);
  const rightBound = Math.max(
    leftBound,
    boxWidth - nonNegative(input.rightClearance ?? 0) - motionClearance,
  );
  const figureLeft = Math.min(
    Math.max(leftBound, rightBound - figureSize),
    Math.max(leftBound, anchorX - figureSize / 2),
  );
  const labelLeft = Math.min(
    Math.max(leftBound, rightBound - labelWidth),
    Math.max(leftBound, anchorX - labelWidth / 2),
  );
  const labelTier = nonNegative(input.labelTier ?? 0);
  return {
    figureLeft,
    figureTop: input.placementY * input.boxHeight - input.figureSize / 2,
    labelSlotLeft: labelLeft - figureLeft,
    labelAbove: skyMarkerLabelAbove(input),
    labelOffset: labelTier * (nonNegative(input.pillHeight) + nonNegative(input.gap)),
  };
}

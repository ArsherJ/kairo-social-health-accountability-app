export interface SkyMarkerLabelInput {
  placementY: number;
  boxHeight: number;
  figureSize: number;
  pillHeight: number;
  gap: number;
  bottomClearance: number;
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
    + nonNegative(input.pillHeight);
  return remainingTail < requiredTail;
}

/** Anchor the bird to path geometry and position its independently sized label. */
export function skyMarkerLayout(input: SkyMarkerLayoutInput): SkyMarkerLayout {
  return {
    figureLeft: input.placementX * input.boxWidth - input.figureSize / 2,
    figureTop: input.placementY * input.boxHeight - input.figureSize / 2,
    labelSlotLeft: (input.figureSize - input.labelMaxWidth) / 2,
    labelAbove: skyMarkerLabelAbove(input),
  };
}

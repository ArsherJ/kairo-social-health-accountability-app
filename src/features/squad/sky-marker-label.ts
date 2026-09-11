export interface SkyMarkerLabelInput {
  placementY: number;
  boxHeight: number;
  figureSize: number;
  pillHeight: number;
  gap: number;
  bottomClearance: number;
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

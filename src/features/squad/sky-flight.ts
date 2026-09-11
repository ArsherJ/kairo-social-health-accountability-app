/**
 * The Sky's straight presentation projection.
 *
 * Race progress remains owned by core. This module only decides where that
 * progress is painted in the open-flight scene, so the app can leave the old
 * winding path behind without changing scoring, rank, or the finish line.
 */

const GROUND_Y = 1420 / 1560;
const RIDGE_Y = 150 / 1560;
export const SKY_MINIMAP_WIDTH = 44;
export const SKY_FLIGHT_RIGHT_CLEARANCE = SKY_MINIMAP_WIDTH + 8;
/** Fixed-scale 11pt label at the shared 1.2 cap, including its pill padding. */
const LABEL_HEIGHT_BOUND = 30;
const LABEL_GAP = 4;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function skyFlightPoint(progress: number): { x: number; y: number } {
  const t = clamp01(progress);
  return {
    x: 0.5,
    y: GROUND_Y + (RIDGE_Y - GROUND_Y) * t,
  };
}

export interface SkyFlightRacer {
  identity: string;
  progress: number;
  figureSize?: number;
}

export interface SkyFlightPlacement {
  x: number;
  y: number;
  angle: number;
  offset: number;
  labelTier: number;
}

export function skyFlightBottomClearance(input: {
  insetBottom: number;
  tabClearance: number;
  footerHeight: number;
  gap: number;
}): number {
  return [input.insetBottom, input.tabClearance, input.footerHeight, input.gap]
    .reduce((total, value) => total + (Number.isFinite(value) ? Math.max(0, value) : 0), 0);
}

/**
 * Rest columns stay tied to identity rather than rank. A crowded flock uses
 * two columns and separates nearby birds into ordered rows; that is the layout
 * that fits six full figure and drift envelopes before the minimap on 320pt.
 */
export function skyFlightPlacements(
  racers: readonly SkyFlightRacer[],
  boxWidth = 320,
  bottomClearance = 120,
): SkyFlightPlacement[] {
  const safeWidth = Number.isFinite(boxWidth) && boxWidth > 0 ? boxWidth : 320;
  const identities = [...new Set(racers.map((racer) => racer.identity))].sort();
  const laneByIdentity = new Map(identities.map((identity, lane) => [identity, lane]));
  const count = Math.max(1, identities.length);
  const leftEdge = 39 / safeWidth;
  const rightEdge = (safeWidth - SKY_FLIGHT_RIGHT_CLEARANCE - 39) / safeWidth;
  const xByIdentity = new Map(
    identities.map((identity, lane) => [
      identity,
      count === 1
        ? (rightEdge + leftEdge) / 2
        : lane % 2 === 0 ? leftEdge : rightEdge,
    ]),
  );
  const boxHeight = safeWidth / (393 / 1560);
  const entries = racers.map((racer, index) => ({
    racer,
    index,
    column: count === 1 ? 0 : (laneByIdentity.get(racer.identity) ?? 0) % 2,
    x: xByIdentity.get(racer.identity) ?? (rightEdge + leftEdge) / 2,
    idealY: skyFlightPoint(racer.progress).y * boxHeight,
    size: Number.isFinite(racer.figureSize) ? Math.max(0, racer.figureSize ?? 44) : 44,
  }));
  const resolvedY = new Array<number>(racers.length);

  for (const column of [0, 1]) {
    const ordered = entries
      .filter((entry) => entry.column === column)
      .sort((a, b) => a.idealY - b.idealY || a.racer.identity.localeCompare(b.racer.identity));
    if (ordered.length === 0) continue;

    const cumulative = [0];
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      cumulative[index] = cumulative[index - 1]!
        + previous.size / 2
        + current.size / 2
        + 2 * (LABEL_HEIGHT_BOUND + LABEL_GAP);
    }
    const fitted = isotonicNonDecreasing(
      ordered.map((entry, index) => entry.idealY - cumulative[index]!),
    );
    let transformedLower = Number.NEGATIVE_INFINITY;
    let transformedUpper = Number.POSITIVE_INFINITY;
    ordered.forEach((entry, index) => {
      const fullExtent = entry.size / 2 + LABEL_GAP + LABEL_HEIGHT_BOUND;
      transformedLower = Math.max(
        transformedLower,
        fullExtent - cumulative[index]!,
      );
      transformedUpper = Math.min(
        transformedUpper,
        boxHeight
          - Math.max(0, bottomClearance)
          - fullExtent
          - cumulative[index]!,
      );
    });
    ordered.forEach((entry, index) => {
      const bounded = Math.min(
        transformedUpper,
        Math.max(transformedLower, fitted[index]!),
      );
      resolvedY[entry.index] = bounded + cumulative[index]!;
    });
  }

  return entries.map((entry) => ({
    x: entry.x,
    y: (resolvedY[entry.index] ?? entry.idealY) / boxHeight,
    angle: -90,
    offset: entry.x - 0.5,
    labelTier: 0,
  }));
}

function isotonicNonDecreasing(values: readonly number[]): number[] {
  const blocks: { start: number; end: number; sum: number; count: number }[] = [];
  values.forEach((value, index) => {
    blocks.push({ start: index, end: index, sum: value, count: 1 });
    while (blocks.length > 1) {
      const right = blocks.at(-1)!;
      const left = blocks.at(-2)!;
      if (left.sum / left.count <= right.sum / right.count) break;
      blocks.splice(-2, 2, {
        start: left.start,
        end: right.end,
        sum: left.sum + right.sum,
        count: left.count + right.count,
      });
    }
  });
  const result = new Array<number>(values.length);
  blocks.forEach((block) => {
    const mean = block.sum / block.count;
    for (let index = block.start; index <= block.end; index++) result[index] = mean;
  });
  return result;
}

export function skyFlightFocusY(
  placements: readonly SkyFlightPlacement[],
  selfIndex: number,
  boxHeight: number,
): number | null {
  const placement = placements[selfIndex];
  return placement && boxHeight > 0 ? placement.y * boxHeight : null;
}

function identityHash(identity: string): number {
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index++) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export interface SkyDriftProfile {
  amplitude: number;
  duration: number;
  direction: -1 | 1;
}

/** A deterministic, modest transform profile; it never changes progress. */
export function skyDriftProfile(identity: string): SkyDriftProfile {
  const hash = identityHash(identity);
  return {
    amplitude: 5 + ((hash >>> 4) % 3),
    duration: 2600 + ((hash >>> 9) % 5) * 200,
    direction: (hash & 1) === 0 ? -1 : 1,
  };
}

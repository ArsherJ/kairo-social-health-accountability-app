import { describe, expect, it } from 'vitest';
import { SKY_FIGURE, SKY_SELF_FIGURE, flightFrame } from './flight-frame.ts';
import { skyMarkerLayout } from './sky-marker-label.ts';
import {
  skyDriftProfile,
  skyFlightBottomClearance,
  skyFlightFocusY,
  skyFlightPlacements,
  skyFlightPoint,
} from './sky-flight.ts';

describe('the open flight projection', () => {
  it('moves straight from midnight to the ridge as progress increases', () => {
    expect(skyFlightPoint(0)).toEqual({ x: 0.5, y: 1420 / 1560 });
    expect(skyFlightPoint(0.5)).toEqual({ x: 0.5, y: 785 / 1560 });
    expect(skyFlightPoint(1).x).toBe(0.5);
    expect(skyFlightPoint(1).y).toBeCloseTo(150 / 1560, 12);
  });

  it('clamps invalid progress instead of putting a bird outside the flight', () => {
    expect(skyFlightPoint(-1)).toEqual(skyFlightPoint(0));
    expect(skyFlightPoint(2)).toEqual(skyFlightPoint(1));
    expect(skyFlightPoint(Number.NaN)).toEqual(skyFlightPoint(0));
  });
});

describe('open flight placements', () => {
  const six = [
    { identity: 'self', progress: 0.5, figureSize: SKY_SELF_FIGURE },
    { identity: 'ada', progress: 0.5, figureSize: SKY_FIGURE },
    { identity: 'bea', progress: 0.51, figureSize: SKY_FIGURE },
    { identity: 'cy', progress: 0.49, figureSize: SKY_FIGURE },
    { identity: 'dia', progress: 0.5, figureSize: SKY_FIGURE },
    { identity: 'eve', progress: 0.52, figureSize: SKY_FIGURE },
  ] as const;

  function envelopes(progresses: readonly number[], bottomClearance = 120) {
    const width = 320;
    const height = width / (393 / 1560);
    const racers = progresses.map((progress, index) => ({
      identity: index === progresses.length - 1 ? 'self' : String.fromCharCode(97 + index),
      progress,
      figureSize: index === progresses.length - 1 ? SKY_SELF_FIGURE : SKY_FIGURE,
    }));
    const placements = skyFlightPlacements(racers, width, bottomClearance);
    return placements.map((placement, index) => {
      const racer = racers[index]!;
      const drift = skyDriftProfile(racer.identity).amplitude;
      const layout = skyMarkerLayout({
        placementX: placement.x,
        placementY: placement.y,
        boxWidth: width,
        boxHeight: height,
        figureSize: racer.figureSize,
        labelMaxWidth: 120,
        pillHeight: 30,
        gap: 4,
        bottomClearance,
        labelTier: placement.labelTier,
        rightClearance: 52,
        horizontalMotionClearance: drift,
      });
      const labelTop = layout.labelAbove
        ? layout.figureTop - 4 - layout.labelOffset - 30
        : layout.figureTop + racer.figureSize + 4 + layout.labelOffset;
      return {
        placement,
        figure: {
          left: layout.figureLeft - drift,
          right: layout.figureLeft + racer.figureSize + drift,
          top: layout.figureTop,
          bottom: layout.figureTop + racer.figureSize,
        },
        label: {
          left: layout.figureLeft + layout.labelSlotLeft - drift,
          right: layout.figureLeft + layout.labelSlotLeft + 120 + drift,
          top: labelTop,
          bottom: labelTop + 30,
        },
      };
    });
  }

  function separated(
    a: { left: number; right: number; top: number; bottom: number },
    b: { left: number; right: number; top: number; bottom: number },
  ) {
    return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
  }

  function expectAllEnvelopesSeparated(progresses: readonly number[]) {
    const result = envelopes(progresses);
    for (let left = 0; left < result.length; left++) {
      for (let right = left + 1; right < result.length; right++) {
        expect(separated(result[left]!.figure, result[right]!.figure)).toBe(true);
        expect(separated(result[left]!.label, result[right]!.label)).toBe(true);
        expect(separated(result[left]!.label, result[right]!.figure)).toBe(true);
        expect(separated(result[right]!.label, result[left]!.figure)).toBe(true);
      }
    }
  }

  it('gives every identity a stable rest lane independent of ranking order', () => {
    const forward = skyFlightPlacements(six);
    const reverse = skyFlightPlacements([...six].reverse());
    const reverseByIdentity = new Map(
      [...six].reverse().map((racer, index) => [racer.identity, reverse[index]!.x]),
    );

    six.forEach((racer, index) => {
      expect(forward[index]!.x).toBe(reverseByIdentity.get(racer.identity));
    });
  });

  it('gives six tied or nearby birds distinct rest lanes before the minimap', () => {
    const width = 320;
    const placements = skyFlightPlacements(six);
    const anchors = placements.map((placement) => `${placement.x}:${placement.y}`);

    expect(new Set(anchors).size).toBe(6);
    expect(new Set(placements.map((placement) => placement.x)).size).toBe(2);
    expect(Math.max(...placements.map((placement) => placement.x)) * width).toBeLessThan(268);
  });

  it('leaves enough edge clearance for every bird\'s automatic drift', () => {
    const width = 320;
    const placements = skyFlightPlacements(six);

    placements.forEach((placement, index) => {
      const racer = six[index]!;
      const amplitude = skyDriftProfile(racer.identity).amplitude;
      expect(placement.x * width - racer.figureSize / 2 - amplitude).toBeGreaterThanOrEqual(0);
      expect(placement.x * width + racer.figureSize / 2 + amplitude).toBeLessThanOrEqual(268);
    });
  });

  it('keeps every pair of six tied bird envelopes separate through full drift', () => {
    const width = 320;
    const height = width / (393 / 1560);
    const placements = skyFlightPlacements(six, width);

    for (let left = 0; left < placements.length; left++) {
      for (let right = left + 1; right < placements.length; right++) {
        const a = placements[left]!;
        const b = placements[right]!;
        const aSize = six[left]!.figureSize;
        const bSize = six[right]!.figureSize;
        const aDrift = skyDriftProfile(six[left]!.identity).amplitude;
        const bDrift = skyDriftProfile(six[right]!.identity).amplitude;
        const separatedX = a.x * width + aSize / 2 + aDrift <= b.x * width - bSize / 2 - bDrift
          || b.x * width + bSize / 2 + bDrift <= a.x * width - aSize / 2 - aDrift;
        const separatedY = a.y * height + aSize / 2 <= b.y * height - bSize / 2
          || b.y * height + bSize / 2 <= a.y * height - aSize / 2;
        expect(separatedX || separatedY).toBe(true);
      }
    }
  });

  it.each([
    [[0.45, 0.493, 0.536, 0.478, 0.521, 0.463]],
    [[0.467, 0.523, 0.478, 0.534, 0.489, 0.545]],
  ])('globally resolves the reviewer collision set %#', (progresses) => {
    expectAllEnvelopesSeparated(progresses);
  });

  it('keeps figure, label, and neighboring figure envelopes separate for one through six', () => {
    for (let count = 1; count <= 6; count++) {
      expectAllEnvelopesSeparated(Array.from({ length: count }, (_, index) => 0.5 + index * 0.007));
    }
  });

  it('keeps the full figure and label visible at both endpoints above actual bottom chrome', () => {
    const height = 320 / (393 / 1560);
    for (const progress of [0, 1]) {
      for (const item of envelopes([progress, progress, progress, progress, progress, progress], 120)) {
        for (const envelope of [item.figure, item.label]) {
          expect(envelope.top).toBeGreaterThanOrEqual(0);
          expect(envelope.bottom).toBeLessThanOrEqual(height - 120);
        }
      }
    }
  });

  it('keeps the ground endpoint above a measured 120-point footer and its air gap', () => {
    const bottomClearance = skyFlightBottomClearance({
      insetBottom: 16,
      tabClearance: 96,
      footerHeight: 120,
      gap: 8,
    });
    const height = 320 / (393 / 1560);

    expect(bottomClearance).toBe(240);
    for (const item of envelopes([0, 0, 0, 0, 0, 0], bottomClearance)) {
      expect(item.figure.bottom).toBeLessThanOrEqual(height - bottomClearance);
      expect(item.label.bottom).toBeLessThanOrEqual(height - bottomClearance);
    }
  });

  it.each([154, 250])(
    'fits mixed ridge, middle, and ground racers inside clearance %s without overlap',
    (bottomClearance) => {
      const height = 320 / (393 / 1560);
      const result = envelopes([1, 0.5, 1, 0.5, 0, 0.5], bottomClearance);
      for (const item of result) {
        for (const envelope of [item.figure, item.label]) {
          expect(envelope.top).toBeGreaterThanOrEqual(0);
          expect(envelope.bottom).toBeLessThanOrEqual(height - bottomClearance);
        }
      }
      for (let left = 0; left < result.length; left++) {
        for (let right = left + 1; right < result.length; right++) {
          expect(separated(result[left]!.figure, result[right]!.figure)).toBe(true);
          expect(separated(result[left]!.label, result[right]!.label)).toBe(true);
          expect(separated(result[left]!.label, result[right]!.figure)).toBe(true);
          expect(separated(result[right]!.label, result[left]!.figure)).toBe(true);
        }
      }
    },
  );

  it('never moves self backward across a fine progress sweep', () => {
    let previousY = Number.POSITIVE_INFINITY;
    for (let step = 0; step <= 1000; step++) {
      const selfProgress = 0.44 + step * 0.00014;
      const racers = [0.45, 0.493, 0.536, 0.478, 0.521].map((progress, index) => ({
        identity: String.fromCharCode(97 + index),
        progress,
        figureSize: SKY_FIGURE,
      }));
      racers.push({ identity: 'self', progress: selfProgress, figureSize: SKY_SELF_FIGURE });
      const selfY = skyFlightPlacements(racers, 320, 120).at(-1)!.y;
      expect(selfY).toBeLessThanOrEqual(previousY + 1e-9);
      previousY = selfY;
    }
  });

  it('focuses the final fanned self placement in a crowded XXXL frame', () => {
    const width = 320;
    const height = width / (393 / 1560);
    const placements = skyFlightPlacements(six, width, 120);
    const selfIndex = six.findIndex((racer) => racer.identity === 'self');
    const focusY = skyFlightFocusY(placements, selfIndex, height);

    expect(focusY).toBe(placements[selfIndex]!.y * height);
    expect(focusY).not.toBe(skyFlightPoint(six[selfIndex]!.progress).y * height);
    const chromeBottom = 340;
    const gap = 16;
    const frame = flightFrame({
      boxHeight: height,
      viewportHeight: 852,
      chromeBottom,
      gap,
      focusY,
    });
    const selfTopOnScreen = frame.topInset + focusY! - frame.openAt - SKY_SELF_FIGURE / 2;
    expect(selfTopOnScreen).toBeGreaterThanOrEqual(chromeBottom + gap);
  });

  it('keeps all six 120-point label envelopes separate through full drift', () => {
    const width = 320;
    const height = width / (393 / 1560);
    const pillHeight = 30;
    const placements = skyFlightPlacements(six, width);
    const labels = placements.map((placement, index) => {
      const racer = six[index]!;
      const drift = skyDriftProfile(racer.identity).amplitude;
      const layout = skyMarkerLayout({
        placementX: placement.x,
        placementY: placement.y,
        boxWidth: width,
        boxHeight: height,
        figureSize: racer.figureSize,
        labelMaxWidth: 120,
        pillHeight,
        gap: 4,
        bottomClearance: 120,
        labelTier: placement.labelTier,
        rightClearance: 52,
        horizontalMotionClearance: drift,
      });
      return {
        left: layout.figureLeft + layout.labelSlotLeft - drift,
        right: layout.figureLeft + layout.labelSlotLeft + 120 + drift,
        top: layout.figureTop + racer.figureSize + 4 + layout.labelOffset,
        bottom: layout.figureTop + racer.figureSize + 4 + layout.labelOffset + pillHeight,
      };
    });

    for (let left = 0; left < labels.length; left++) {
      for (let right = left + 1; right < labels.length; right++) {
        const a = labels[left]!;
        const b = labels[right]!;
        const separatedX = a.right <= b.left || b.right <= a.left;
        const separatedY = a.bottom <= b.top || b.bottom <= a.top;
        expect(separatedX || separatedY).toBe(true);
      }
    }
  });
});

describe('bird drift profiles', () => {
  it('are deterministic, modest, and vary by identity', () => {
    const first = skyDriftProfile('self');
    expect(skyDriftProfile('self')).toEqual(first);
    expect(first.amplitude).toBeGreaterThanOrEqual(5);
    expect(first.amplitude).toBeLessThanOrEqual(7);
    expect(first.duration).toBeGreaterThanOrEqual(2600);
    expect(first.duration).toBeLessThanOrEqual(3400);
    expect(skyDriftProfile('another-bird')).not.toEqual(first);
  });
});

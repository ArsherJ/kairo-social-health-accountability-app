import { describe, expect, it } from 'vitest';
import { SKY_PATH_ASPECT, placeRacers, pointAt } from '@kairo/core';
import {
  MINIMAP_WIDTH,
  mapPoint,
  miniPath,
  miniRacers,
  minimapHeight,
  offsetForMapY,
  viewportWindow,
  type MinimapGeometry,
} from './minimap.ts';

/** A 393x852 phone with a measured rail, and the narrow 320x568 one. */
function geometry(width: number, height: number): MinimapGeometry {
  const boxHeight = width / SKY_PATH_ASPECT;
  const topInset = 59 + 8 + 110 + 16;
  return {
    contentHeight: topInset + boxHeight,
    viewportHeight: height,
    topInset,
    boxWidth: width,
    boxHeight,
    mapHeight: height * 0.5,
  };
}

const PHONES = [geometry(393, 852), geometry(320, 568)];

describe('the miniature path', () => {
  it('stays inside the strip on every phone', () => {
    for (const g of PHONES) {
      for (const p of miniPath(g)) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(MINIMAP_WIDTH);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(g.mapHeight);
      }
    }
  });

  it('puts the ridge above the ground, as the flight does', () => {
    const g = PHONES[0]!;
    const ridge = mapPoint(g, pointAt(1).x, pointAt(1).y);
    const ground = mapPoint(g, pointAt(0).x, pointAt(0).y);
    expect(ridge.y).toBeLessThan(ground.y);
  });

  it('uses the strip\'s width — the path is not squashed to a line', () => {
    const xs = miniPath(PHONES[0]!).map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(MINIMAP_WIDTH * 0.4);
  });
});

describe('the birds', () => {
  it('sit on the miniature where the corridor put them, ties pulled apart included', () => {
    const g = PHONES[0]!;
    const placements = placeRacers([0.5, 0.5, 0.9]);
    const dots = miniRacers(g, placements);
    expect(dots).toHaveLength(3);
    // The two tied birds are drawn apart, not on one pixel.
    expect(dots[0]!.x).not.toBeCloseTo(dots[1]!.x);
    // The bird further along the flight is higher up the strip.
    expect(dots[2]!.y).toBeLessThan(dots[0]!.y);
  });
});

describe('the window', () => {
  it('never leaves the strip, at either end or on overscroll', () => {
    for (const g of PHONES) {
      for (const offset of [-200, 0, 400, g.contentHeight, g.contentHeight + 500]) {
        const w = viewportWindow(g, offset);
        expect(w.top).toBeGreaterThanOrEqual(0);
        expect(w.top + w.height).toBeLessThanOrEqual(g.mapHeight + 1e-9);
      }
    }
  });

  it('is proportional to the screen and moves with the scroll', () => {
    const g = PHONES[0]!;
    const a = viewportWindow(g, 0);
    const b = viewportWindow(g, 300);
    expect(b.top).toBeGreaterThan(a.top);
    expect(a.height).toBeCloseTo((g.viewportHeight / g.contentHeight) * g.mapHeight);
  });

  it('stays a fingertip tall on a very long flight', () => {
    const tall = { ...PHONES[0]!, contentHeight: 40_000 };
    expect(viewportWindow(tall, 0).height).toBeGreaterThanOrEqual(28);
  });
});

describe('a touch on the strip', () => {
  it('scrolls to centre the screen on the touched point, clamped to the flight', () => {
    const g = PHONES[0]!;
    const middle = offsetForMapY(g, g.mapHeight / 2);
    expect(middle).toBeCloseTo(g.contentHeight / 2 - g.viewportHeight / 2);
    expect(offsetForMapY(g, 0)).toBe(0);
    expect(offsetForMapY(g, g.mapHeight)).toBe(g.contentHeight - g.viewportHeight);
    expect(offsetForMapY(g, g.mapHeight * 3)).toBe(g.contentHeight - g.viewportHeight);
  });

  it('round-trips with the window: touching where the window is leaves the scroll put', () => {
    const g = PHONES[0]!;
    const offset = 500;
    const w = viewportWindow(g, offset);
    expect(offsetForMapY(g, w.top + w.height / 2)).toBeCloseTo(offset, 0);
  });
});

describe('the strip\'s height', () => {
  it('is half the screen unless the chrome and the cards leave less', () => {
    expect(
      minimapHeight({ viewportHeight: 852, chromeBottom: 200, footTop: 700, gap: 16 }),
    ).toBe(426);
    expect(
      minimapHeight({ viewportHeight: 568, chromeBottom: 190, footTop: 400, gap: 16 }),
    ).toBe(400 - 190 - 32);
    expect(minimapHeight({ viewportHeight: 568, chromeBottom: 300, footTop: 300, gap: 16 })).toBe(0);
  });
});

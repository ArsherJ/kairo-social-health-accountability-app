import { describe, expect, it } from 'vitest';
import { SKY_PATH_ASPECT, angleAt, placeRacers, pointAt, tangentAt } from './sky-path.ts';

/** Straight-line distance between two normalised points. */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Arc length of the curve between two `t` values, sampled finely. */
function arc(from: number, to: number, samples = 400): number {
  let total = 0;
  let prev = pointAt(from);
  for (let i = 1; i <= samples; i++) {
    const next = pointAt(from + ((to - from) * i) / samples);
    total += dist(prev, next);
    prev = next;
  }
  return total;
}

describe('the corridor runs from the near corner to the far one', () => {
  it('starts and ends where the design puts it', () => {
    // Bottom left to top right, in normalised viewBox coordinates. y grows
    // downward, as it does in the SVG this was transcribed from and as it does
    // in React Native's layout.
    expect(pointAt(0).x).toBeCloseTo(18 / 402, 3);
    expect(pointAt(0).y).toBeCloseTo(470 / 520, 3);
    expect(pointAt(1).x).toBeCloseTo(384 / 402, 3);
    expect(pointAt(1).y).toBeCloseTo(152 / 520, 3);
  });

  it('clamps a t from outside 0 to 1 rather than extrapolating', () => {
    // A racer's progress is already clamped upstream, but this is drawn
    // geometry: extrapolating a Bézier puts a bird outside the picture, which
    // reads as a rendering fault rather than as a very good day.
    expect(pointAt(-3)).toEqual(pointAt(0));
    expect(pointAt(9)).toEqual(pointAt(1));
  });

  it('climbs the whole way — x rises and y falls, monotonically', () => {
    // The one property a reader takes from the picture without being told:
    // further along is further up and further right. A curve that dipped would
    // show somebody moving backwards while their steps went up.
    let prev = pointAt(0);
    for (let i = 1; i <= 100; i++) {
      const next = pointAt(i / 100);
      expect(next.x).toBeGreaterThan(prev.x);
      expect(next.y).toBeLessThan(prev.y);
      prev = next;
    }
  });
});

describe('t is distance along the path, not a Bézier parameter', () => {
  it('puts the halfway racer halfway along', () => {
    // The whole reason this module arc-length parameterises. A naive
    // `t`-per-segment split makes the second half of the path visibly faster
    // than the first, so two racers 1,000 steps apart appear a different
    // distance apart depending on where on the curve they are — which is the
    // one thing a race picture must never do.
    const first = arc(0, 0.5);
    const second = arc(0.5, 1);
    expect(Math.abs(first - second)).toBeLessThan(0.01);
  });

  it('is evenly spaced at every quarter', () => {
    const quarters = [arc(0, 0.25), arc(0.25, 0.5), arc(0.5, 0.75), arc(0.75, 1)];
    const longest = Math.max(...quarters);
    const shortest = Math.min(...quarters);
    expect(longest - shortest).toBeLessThan(0.01);
  });
});

describe('tangentAt and angleAt', () => {
  it('returns a unit vector', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const { dx, dy } = tangentAt(t);
      expect(Math.hypot(dx, dy)).toBeCloseTo(1, 6);
    }
  });

  it('points up and to the right the whole way', () => {
    for (let i = 0; i <= 20; i++) {
      const { dx, dy } = tangentAt(i / 20);
      expect(dx).toBeGreaterThan(0);
      expect(dy).toBeLessThan(0);
    }
  });

  it('is continuous across the join between the two curves', () => {
    // The design's path uses an `S` command, whose first control point is the
    // reflection of the previous segment's second. Getting that reflection
    // wrong produces a visible kink and nothing else fails.
    const before = angleAt(0.49);
    const after = angleAt(0.51);
    expect(Math.abs(after - before)).toBeLessThan(5);
  });

  it('gives a negative angle in degrees, since the path climbs', () => {
    // Screen coordinates: y grows downward, so a rising path has a negative
    // rotation. Stated as a test because getting the sign wrong mirrors every
    // segment of the band and still renders.
    expect(angleAt(0.5)).toBeLessThan(0);
    expect(angleAt(0.5)).toBeGreaterThan(-90);
  });
});

describe('placeRacers', () => {
  it('places each racer at its own progress', () => {
    const [a, b] = placeRacers([0.2, 0.8]);
    expect(a).toMatchObject(pointAt(0.2));
    expect(b).toMatchObject(pointAt(0.8));
    expect(a!.offset).toBe(0);
    expect(b!.offset).toBe(0);
  });

  it('separates racers who are tied — which is the common case, not an edge one', () => {
    // `cappedSteps` stops at the finish line, so two active people are tied on
    // the primary key BY CONSTRUCTION. On six separate lanes that was
    // invisible; on one shared corridor it is two birds drawn on the same
    // pixel.
    const placed = placeRacers([1, 1, 1]);
    const offsets = placed.map((p) => p.offset);
    expect(new Set(offsets).size).toBe(3);
    expect(offsets[0]).toBe(0);
  });

  it('alternates the offsets around the line rather than stacking them one way', () => {
    // Four tied birds all pushed to one side read as a queue beside the
    // corridor. Alternating keeps the cluster centred on the path.
    const offsets = placeRacers([1, 1, 1, 1]).map((p) => p.offset);
    expect(offsets[0]).toBe(0);
    expect(Math.sign(offsets[1]!)).toBe(-Math.sign(offsets[2]!));
  });

  it('leaves racers who are far apart alone', () => {
    expect(placeRacers([0.05, 0.5, 0.95]).every((p) => p.offset === 0)).toBe(true);
  });

  it('is deterministic — the same input gives the same output every time', () => {
    // The board refetches on realtime broadcasts. Anything non-deterministic
    // here makes the picture twitch on every poll, which is the same failure
    // the `user_id` tie-break in `rankRacers` exists to prevent.
    const once = placeRacers([1, 1, 0.4, 0.42]);
    const twice = placeRacers([1, 1, 0.4, 0.42]);
    expect(once).toEqual(twice);
  });

  it('clamps a progress from outside 0 to 1', () => {
    expect(placeRacers([-1])[0]).toMatchObject(pointAt(0));
    expect(placeRacers([2])[0]).toMatchObject(pointAt(1));
  });

  it('returns nothing for nobody', () => {
    expect(placeRacers([])).toEqual([]);
  });
});

describe('SKY_PATH_ASPECT', () => {
  it('is the design viewBox, so the component can size its own box', () => {
    expect(SKY_PATH_ASPECT).toBeCloseTo(402 / 520, 6);
  });
});

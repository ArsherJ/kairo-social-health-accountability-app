import { describe, expect, it } from 'vitest';
import {
  MIND_OVERSLEEP_HOURS,
  MIND_TAPER_END_HOURS,
  MIND_THRESHOLD_HOURS,
  mindPoints,
  mindTierFor,
} from './mind.ts';

const hours = (h: number): number => h * 60;

/**
 * The anchors `mind.ts` draws its curve through, restated as literals on
 * purpose: this file pins the *shape* of Mind's curve against known values, and
 * importing the table would let both move together in silence. If these three
 * ever disagree with the scorer, `scoring.test.ts`'s ceiling assertions fail —
 * the pairing that keeps both honest.
 */
const ANCHORS = { bronze: 250, silver: 650, gold: 1_200 };

describe('mindPoints', () => {
  it('pays nothing below the bronze band', () => {
    expect(mindPoints(hours(0))).toBe(0);
    expect(mindPoints(hours(4.9))).toBe(0);
  });

  it('lands exactly on each anchor at its own boundary', () => {
    expect(mindPoints(hours(5))).toBe(250);
    expect(mindPoints(hours(6))).toBe(650);
    expect(mindPoints(hours(7))).toBe(1_200);
  });

  // The dead zone this pass removed. Half an hour of extra sleep used to be
  // worth precisely nothing anywhere inside a band.
  it('moves continuously between the anchors', () => {
    expect(mindPoints(hours(5.5))).toBeCloseTo(450);
    expect(mindPoints(hours(6.5))).toBeCloseTo(925);
  });

  it('holds gold flat from seven hours through nine', () => {
    expect(mindPoints(hours(8))).toBe(1_200);
    expect(mindPoints(hours(MIND_OVERSLEEP_HOURS))).toBe(1_200);
  });

  // The taper, and the reason it exists. HealthKit sleep is noisy — a watch on
  // the nightstand, `inBed` against `asleep`, a nap merged into the night — so
  // the old cliff punished measurement error as though it were behaviour.
  it('declines smoothly past nine hours rather than falling off a cliff', () => {
    const nine = mindPoints(hours(9));
    const nineHalf = mindPoints(hours(9.75));
    const ten = mindPoints(hours(10.25));
    expect(nine).toBeGreaterThan(nineHalf);
    expect(nineHalf).toBeGreaterThan(ten);
    expect(nineHalf).toBeCloseTo(925);
  });

  // The floor is Silver and it does not move. An eleven-hour night must never
  // score below a five-hour one, which is exactly what the old cliff did.
  it('floors at the silver anchor and stays there', () => {
    expect(mindPoints(hours(MIND_TAPER_END_HOURS))).toBe(650);
    expect(mindPoints(hours(12))).toBe(650);
    expect(mindPoints(hours(24))).toBe(650);
    expect(mindPoints(hours(12))).toBeGreaterThan(
      mindPoints(hours(5)),
    );
  });

  it('treats a negative reading as no data rather than throwing', () => {
    expect(mindPoints(-1)).toBe(0);
    expect(mindPoints(Number.NaN)).toBe(0);
  });
});

describe('mindTierFor', () => {
  it('scores nothing below the bronze band', () => {
    expect(mindTierFor(hours(0))).toBe('none');
    expect(mindTierFor(hours(4.9))).toBe('none');
  });

  it('scores each band at its exact boundary', () => {
    expect(mindTierFor(hours(5))).toBe('bronze');
    expect(mindTierFor(hours(6))).toBe('silver');
    expect(mindTierFor(hours(7))).toBe('gold');
  });

  it('still scores gold at exactly nine hours', () => {
    expect(mindTierFor(hours(MIND_OVERSLEEP_HOURS))).toBe('gold');
  });

  // Was Bronze until 2026-08-29, which meant 9h01m and 5h00m scored alike.
  it('lands a long night on silver, never on bronze or none', () => {
    expect(mindTierFor(hours(9.1))).toBe('silver');
    expect(mindTierFor(hours(12))).toBe('silver');
    expect(mindTierFor(hours(24))).toBe('silver');
  });

  // The guard that matters most here. The taper means points are no longer a
  // step function, so a tier read off an independent threshold table would call
  // a 9h30m night Gold while the curve paid it ~1,017 — two functions
  // disagreeing about one night.
  it('never disagrees with the points curve about which band a night is in', () => {
    for (let m = 0; m <= hours(14); m += 5) {
      const points = mindPoints(m);
      const tier = mindTierFor(m);
      const floor =
        tier === 'gold'
          ? ANCHORS.gold
          : tier === 'silver'
            ? ANCHORS.silver
            : tier === 'bronze'
              ? ANCHORS.bronze
              : 0;
      expect(points).toBeGreaterThanOrEqual(floor);
    }
  });

  it('treats a negative reading as no data rather than throwing', () => {
    expect(mindTierFor(-1)).toBe('none');
  });

  it('publishes its bands so nothing restates them', () => {
    expect(MIND_THRESHOLD_HOURS).toEqual({ bronze: 5, silver: 6, gold: 7 });
    expect(MIND_OVERSLEEP_HOURS).toBe(9);
    expect(MIND_TAPER_END_HOURS).toBe(10.5);
  });
});

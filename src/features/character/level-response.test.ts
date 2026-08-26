import { describe, expect, it } from 'vitest';
import { evolutionStageForLevel } from '@kairo/core';
import { figureResponse } from './level-response.ts';

const at = (level: number, aura: 'none' | 'present' | 'strong' = 'none') =>
  figureResponse({
    level,
    stage: evolutionStageForLevel(level),
    aura,
    shadowWeight: 0,
    height: 220,
  });

describe('figureResponse', () => {
  it('grows the shadow at every single level-up, not only at band boundaries', () => {
    // The whole point of the change. `stage` moves at 6, 11 and 21 only, so
    // levelling 12 → 13 used to change nothing at all — and a reward you need
    // two screenshots to see is not a reward.
    for (const level of [2, 7, 13, 24]) {
      expect(at(level + 1).shadowWidth).toBeGreaterThan(at(level).shadowWidth);
    }
  });

  it('makes a band boundary a bigger jump than an ordinary level', () => {
    // The four artworks stay the milestone; the levels between them are still
    // a reward. Both halves, or the within-band term flattens the bands.
    const ordinary = at(8).shadowWidth - at(7).shadowWidth;
    const boundary = at(11).shadowWidth - at(10).shadowWidth;
    expect(boundary).toBeGreaterThan(ordinary * 2);
  });

  it('is substantially louder across the whole range than it used to be', () => {
    // The old curve was (128 + stage * 18): 146 at level 1 and 200 at level 21,
    // a 37% span across the entire game. Pin a much wider one so a later tuning
    // pass cannot quietly flatten it back.
    expect(at(30).shadowWidth / at(1).shadowWidth).toBeGreaterThan(1.7);
  });

  it('deepens the shadow with the band and clamps it before it becomes a hole', () => {
    expect(at(21).shadowOpacity).toBeGreaterThan(at(1).shadowOpacity);
    expect(at(99).shadowOpacity).toBeLessThanOrEqual(0.45);
  });

  it('stops growing past the last band, so a year-old account is not a poster', () => {
    // Unbounded growth would eventually push the figure out of the diorama.
    expect(at(200).shadowWidth).toBe(at(120).shadowWidth);
  });

  it('gives no ring without an aura, and a bigger one with a strong aura', () => {
    expect(at(10, 'none').ringSize).toBeNull();
    expect(at(10, 'strong').ringSize!).toBeGreaterThan(at(10, 'present').ringSize!);
  });

  it('keeps the ring outside the shadow it encircles', () => {
    // A ring drawn inside the contact patch reads as a puddle, not as a halo.
    expect(at(10, 'present').ringSize!).toBeGreaterThan(at(10, 'present').shadowWidth);
  });

  it('thickens the ring by band, so the ring reads level as well as rating', () => {
    expect(at(25, 'present').ringWidth).toBeGreaterThan(at(2, 'present').ringWidth);
  });

  it("scales everything with the figure's box", () => {
    const small = figureResponse({ level: 10, stage: 3, aura: 'none', shadowWeight: 0, height: 110 });
    const large = figureResponse({ level: 10, stage: 3, aura: 'none', shadowWeight: 0, height: 220 });
    expect(large.shadowWidth).toBeCloseTo(small.shadowWidth * 2);
  });

  it('does not scale opacity with the box', () => {
    // A shadow that faded on a card and darkened in the diorama would read as
    // two different characters.
    const small = figureResponse({ level: 10, stage: 3, aura: 'none', shadowWeight: 0, height: 110 });
    const large = figureResponse({ level: 10, stage: 3, aura: 'none', shadowWeight: 0, height: 220 });
    expect(large.shadowOpacity).toBe(small.shadowOpacity);
  });

  it('lets a heavy build sit in a denser contact patch', () => {
    const heavy = figureResponse({ level: 10, stage: 3, aura: 'none', shadowWeight: 0.07, height: 220 });
    const light = figureResponse({ level: 10, stage: 3, aura: 'none', shadowWeight: -0.05, height: 220 });
    expect(heavy.shadowOpacity).toBeGreaterThan(light.shadowOpacity);
  });

  it('survives a level of 0 or NaN from an unloaded profile', () => {
    // An unloaded profile renders a level-1 character rather than a collapsed
    // one — which is what a brand-new account sees anyway, so it never looks
    // like a bug.
    expect(Number.isFinite(at(0).shadowWidth)).toBe(true);
    expect(Number.isFinite(at(Number.NaN).shadowWidth)).toBe(true);
    expect(at(0).shadowWidth).toBe(at(1).shadowWidth);
  });
});

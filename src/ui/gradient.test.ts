import { describe, expect, it } from 'vitest';
import { rampColors } from './gradient.ts';

const BLACK = '#000000';
const WHITE = '#ffffff';

describe('rampColors', () => {
  it('holds a single stop across every band', () => {
    expect(rampColors([{ color: '#c67139', at: 0 }], 3)).toEqual([
      '#c67139ff',
      '#c67139ff',
      '#c67139ff',
    ]);
  });

  it('expands #rgb shorthand', () => {
    expect(rampColors([{ color: '#f00', at: 0 }], 1)).toEqual(['#ff0000ff']);
  });

  it('runs end to end across the band centres', () => {
    const bands = rampColors(
      [
        { color: BLACK, at: 0 },
        { color: WHITE, at: 1 },
      ],
      4,
    );

    // Centres at 0.125 / 0.375 / 0.625 / 0.875 of a 0->255 ramp.
    expect(bands).toEqual(['#202020ff', '#606060ff', '#9f9f9fff', '#dfdfdfff']);
  });

  it('samples centres so neither end colour is clipped away', () => {
    const bands = rampColors(
      [
        { color: BLACK, at: 0 },
        { color: WHITE, at: 1 },
      ],
      2,
    );

    // Sampling leading edges would have produced pure black and mid-grey,
    // leaving the white end unrendered and a seam where the ramp meets it.
    expect(bands[0]).not.toBe('#000000ff');
    expect(bands[1]).not.toBe('#808080ff');
  });

  it('interpolates alpha, which is what the fade to cream rides on', () => {
    const bands = rampColors(
      [
        { color: '#f5ead800', at: 0 },
        { color: '#f5ead8ff', at: 1 },
      ],
      2,
    );

    expect(bands).toEqual(['#f5ead840', '#f5ead8bf']);
  });

  it('sorts stops given out of order', () => {
    const jumbled = rampColors(
      [
        { color: WHITE, at: 1 },
        { color: BLACK, at: 0 },
      ],
      4,
    );
    const ordered = rampColors(
      [
        { color: BLACK, at: 0 },
        { color: WHITE, at: 1 },
      ],
      4,
    );

    expect(jumbled).toEqual(ordered);
  });

  it('holds the end colours outside the stop range', () => {
    const bands = rampColors(
      [
        { color: BLACK, at: 0.4 },
        { color: WHITE, at: 0.6 },
      ],
      10,
    );

    expect(bands[0]).toBe('#000000ff');
    expect(bands[9]).toBe('#ffffffff');
  });

  it('treats two stops at one position as a hard edge, not a divide by zero', () => {
    const bands = rampColors(
      [
        { color: BLACK, at: 0 },
        { color: BLACK, at: 0.5 },
        { color: WHITE, at: 0.5 },
        { color: WHITE, at: 1 },
      ],
      4,
    );

    expect(bands).toEqual(['#000000ff', '#000000ff', '#ffffffff', '#ffffffff']);
  });

  it('clamps stop positions rather than inverting the ramp', () => {
    const bands = rampColors(
      [
        { color: BLACK, at: -2 },
        { color: WHITE, at: 3 },
      ],
      2,
    );

    expect(bands).toEqual(rampColors(
      [
        { color: BLACK, at: 0 },
        { color: WHITE, at: 1 },
      ],
      2,
    ));
  });

  it('returns nothing for a ramp with no bands', () => {
    expect(rampColors([{ color: BLACK, at: 0 }], 0)).toEqual([]);
  });

  it('rejects a colour it cannot parse rather than rendering something wrong', () => {
    expect(() => rampColors([{ color: 'sage', at: 0 }], 2)).toThrow(/hex colour/);
  });
});

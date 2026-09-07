import { describe, expect, it } from 'vitest';
import { SKY_PATH_ASPECT, pointAt } from '@kairo/core';
import { flightFrame } from './flight-frame.ts';

/**
 * The flight is scrolled under chrome that is pinned over it, so the drawing
 * box has to start below that chrome. Everything here is the arithmetic that
 * makes that true; the screen only performs the result.
 */

/** A 393x852 phone, and a 320x568 one — the narrow screen the app supports. */
const PHONES = [
  { width: 393, height: 852 },
  { width: 320, height: 568 },
] as const;

/** The rail at default type, and at the largest accessibility size. */
const RAIL = { small: 96, large: 132 };

/** `SkyMarker`'s own figure, the biggest bird drawn on the corridor. */
const SELF_FIGURE = 60;

const GAP = 16;

describe('flightFrame', () => {
  it('starts the drawing box below the pinned chrome, by the gap', () => {
    const frame = flightFrame({
      boxHeight: 1560,
      viewportHeight: 852,
      chromeBottom: 163,
      gap: GAP,
      focusY: 780,
    });

    expect(frame.topInset).toBe(163 + GAP);
    expect(frame.contentHeight).toBe(163 + GAP + 1560);
  });

  it('keeps the topmost bird clear of the chrome however far the reader scrolls up', () => {
    // The scroll cannot go above zero, so the worst case is offset 0 and the
    // bird nearest the ridge — which is where everybody who has cleared the
    // Daily Walk ends up, since `cappedSteps` stops at the line.
    for (const phone of PHONES) {
      for (const railHeight of [RAIL.small, RAIL.large]) {
        const boxHeight = phone.width / SKY_PATH_ASPECT;
        const chromeBottom = 59 + 8 + railHeight;
        const frame = flightFrame({
          boxHeight,
          viewportHeight: phone.height,
          chromeBottom,
          gap: GAP,
          focusY: pointAt(1).y * boxHeight,
        });

        const headTop = frame.topInset + pointAt(1).y * boxHeight - SELF_FIGURE / 2;
        expect(headTop).toBeGreaterThan(chromeBottom);
      }
    }
  });

  it('opens on your own bird, a third of the way down the viewport', () => {
    const frame = flightFrame({
      boxHeight: 1560,
      viewportHeight: 852,
      chromeBottom: 0,
      gap: 0,
      focusY: 780,
    });

    expect(frame.openAt).toBeCloseTo(780 - 852 / 3);
  });

  it('never scrolls above the start of the flight', () => {
    const frame = flightFrame({
      boxHeight: 1560,
      viewportHeight: 852,
      chromeBottom: 163,
      gap: GAP,
      focusY: pointAt(1).y * 1560,
    });

    expect(frame.openAt).toBeGreaterThanOrEqual(0);
  });

  it('never scrolls past the end of the flight', () => {
    const frame = flightFrame({
      boxHeight: 1560,
      viewportHeight: 852,
      chromeBottom: 163,
      gap: GAP,
      focusY: 1560,
    });

    expect(frame.openAt).toBeLessThanOrEqual(frame.contentHeight - 852);
  });

  it('opens at the ground when there is no bird of your own to open on', () => {
    const frame = flightFrame({
      boxHeight: 1560,
      viewportHeight: 852,
      chromeBottom: 163,
      gap: GAP,
      focusY: null,
    });

    expect(frame.openAt).toBe(frame.contentHeight - 852);
  });

  it('does not scroll a flight shorter than the screen', () => {
    const frame = flightFrame({
      boxHeight: 400,
      viewportHeight: 852,
      chromeBottom: 163,
      gap: GAP,
      focusY: 200,
    });

    expect(frame.openAt).toBe(0);
  });

  it('insets nothing when there is no chrome to clear yet', () => {
    // The rail measures on the first layout pass, so the first render asks for
    // a frame with a zero-height rail. That has to be an ordinary answer
    // rather than a negative inset.
    const frame = flightFrame({
      boxHeight: 1560,
      viewportHeight: 852,
      chromeBottom: -20,
      gap: 0,
      focusY: 780,
    });

    expect(frame.topInset).toBe(0);
  });
});

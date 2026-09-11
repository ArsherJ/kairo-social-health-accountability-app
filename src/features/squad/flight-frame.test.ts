import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SKY_PATH_ASPECT } from '@kairo/core';
import { SKY_SELF_FIGURE, flightFrame } from './flight-frame.ts';
import { skyFlightPoint } from './sky-flight.ts';

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

/**
 * Two rail heights to drive the invariant with. Not measurements of the real
 * rail — nothing here knows how tall it renders, which is exactly why the
 * screen measures it — just a short one and a taller one, because a rule that
 * only holds at one of them is not a rule.
 */
const RAIL_HEIGHTS = [96, 132];

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
      for (const railHeight of RAIL_HEIGHTS) {
        const boxHeight = phone.width / SKY_PATH_ASPECT;
        const chromeBottom = 59 + 8 + railHeight;
        const frame = flightFrame({
          boxHeight,
          viewportHeight: phone.height,
          chromeBottom,
          gap: GAP,
          focusY: skyFlightPoint(1).y * boxHeight,
        });

        const headTop = frame.topInset + skyFlightPoint(1).y * boxHeight - SKY_SELF_FIGURE / 2;
        expect(headTop).toBeGreaterThan(chromeBottom);
      }
    }
  });

  it('leaves the biggest bird room inside the box, which is what the inset assumes', () => {
    // The inset clears the *box*, so it carries any marker drawn inside it and
    // the assertion above passes for almost any figure size. What it cannot
    // carry is a bird bigger than the headroom the path leaves above the ridge
    // — that bird hangs out of the top of the box and the inset never knew
    // about it. This is the half `SKY_SELF_FIGURE` is actually load-bearing
    // in, and the narrow screen is where it binds first, so it is asserted on
    // its own rather than left implied by the clearance above.
    for (const phone of PHONES) {
      const boxHeight = phone.width / SKY_PATH_ASPECT;
      expect(skyFlightPoint(1).y * boxHeight - SKY_SELF_FIGURE / 2).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not shift the flight when the rail finally reports its height', () => {
    // The rail measures on a layout pass, so the first frame asks for a frame
    // with no rail and the second asks again with one. `contentOffset` is not
    // a mount-only prop on Fabric — `RCTScrollViewComponentView.mm` re-applies
    // it whenever it changes — so the second answer really does move the
    // scroller, and the screen would visibly jump if the inset moved without
    // it.
    //
    // It cannot, because both grow by the same amount: the inset pushes the
    // content down and the offset follows it down, so what is under the
    // reader's eye is unchanged. That is what makes the late measurement
    // harmless, and it is a property of the arithmetic rather than a timing
    // accident, so it belongs in a test rather than in a comment.
    const before = flightFrame({
      boxHeight: 1560,
      viewportHeight: 852,
      chromeBottom: 67,
      gap: GAP,
      focusY: 780,
    });
    const after = flightFrame({
      boxHeight: 1560,
      viewportHeight: 852,
      chromeBottom: 67 + 96,
      gap: GAP,
      focusY: 780,
    });

    const onScreen = (f: typeof before) => f.topInset + 780 - f.openAt;
    expect(onScreen(after)).toBeCloseTo(onScreen(before));
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

  it('opens below tall measured chrome when one third of the viewport is obscured', () => {
    const chromeBottom = 340;
    const frame = flightFrame({
      boxHeight: 1560,
      viewportHeight: 852,
      chromeBottom,
      gap: GAP,
      focusY: 780,
    });
    const birdOnScreen = frame.topInset + 780 - frame.openAt;

    expect(birdOnScreen - SKY_SELF_FIGURE / 2).toBeGreaterThanOrEqual(chromeBottom + GAP);
  });

  it('never scrolls above the start of the flight', () => {
    const frame = flightFrame({
      boxHeight: 1560,
      viewportHeight: 852,
      chromeBottom: 163,
      gap: GAP,
      focusY: skyFlightPoint(1).y * 1560,
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

describe('the Sky screen feeds it a measured rail', () => {
  /**
   * The arithmetic above is only as good as what the screen hands it.
   *
   * `flightFrame` is given `chromeBottom`, so every assertion in this file
   * holds by construction for whatever the caller composes — drop the rail out
   * of that sum and the flight goes back under it with the whole suite green.
   * A source scan is the only way to reach a screen root Vitest cannot load;
   * `bleed-inset.test.ts` and `invite-code.test.ts` make the same move for the
   * same reason.
   *
   * Comments are stripped first. This file's own reasoning names `railHeight`
   * and `onLayout` repeatedly, and a guard that passes on prose is a guard that
   * passes on a screen whose prose survived its code.
   */
  const screen = (() => {
    const source = readFileSync('app/(tabs)/sky.tsx', 'utf8');
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  })();

  it('measures the rail rather than assuming a height', () => {
    expect(screen).toMatch(/onLayout={measureRail}/);
    expect(screen).toMatch(/setRailHeight\(/);
  });

  it('measures the rail itself, not some other pinned thing', () => {
    const measured = screen.slice(screen.indexOf('onLayout={measureRail}'));
    expect(measured.slice(0, measured.indexOf('</View>'))).toMatch(/<SkyFlockRail/);
  });

  it('spends the measurement on the chrome the flight has to clear', () => {
    const call = screen.slice(screen.indexOf('flightFrame({'));
    expect(call.slice(0, call.indexOf('});'))).toMatch(/chromeBottom:[^,]*railHeight/);
  });
});

/**
 * Where the flight sits inside the Sky tab's scroller.
 *
 * The Sky is a picture the size of the glass with chrome floating on it: the
 * flock rail is pinned over the top of the screen and the flight scrolls
 * underneath. That arrangement had a defect nothing could see from a
 * simulator's default scroll position — the corridor's own drawing box began
 * at content offset zero, so the *top* of the path, which is the ridge, was
 * drawn under the rail. Every racer who cleared the Daily Walk ends up there,
 * because `cappedSteps` stops at the finish line, so the bird the reader most
 * wants to see was the one with its head cut off.
 *
 * The fix is an inset rather than a clamp: blank content above the drawing box,
 * as tall as the chrome plus a gap. That makes the clearance a property of the
 * layout at **every** scroll offset instead of only at the one the screen opens
 * at — the reader can drag the flight all the way down and still not push a
 * bird under the rail. The rail's own height is measured rather than assumed,
 * because it carries a line of type and therefore grows with Dynamic Type.
 *
 * Pure, and here rather than in `app/(tabs)/sky.tsx`, for the reason every
 * other decision on this screen is: root Vitest cannot load a component file at
 * all, and the clearance is exactly the kind of arithmetic that is invisible
 * until somebody looks at a device.
 */

export interface FlightFrame {
  /** Blank air above the drawing box, in points. */
  topInset: number;
  /** Everything the scroller holds: the inset plus the flight. */
  contentHeight: number;
  /** Where to open the flight, as a content offset. */
  openAt: number;
}

export interface FlightFrameInput {
  /** The drawing box, whose height follows from `SKY_PATH_ASPECT`. */
  boxHeight: number;
  /** The scroller's own height — the screen, since the flight bleeds. */
  viewportHeight: number;
  /**
   * How far down the screen the pinned chrome reaches. The safe-area inset,
   * the chrome's own offset from it, and the measured rail.
   */
  chromeBottom: number;
  /** Clear air between the chrome and the first thing the flight draws. */
  gap: number;
  /**
   * Your own bird's `y` inside the drawing box, or null when you have none —
   * a squadless account with no scored history has no position to open on.
   */
  focusY: number | null;
}

/**
 * How far down the viewport to put the bird the flight opens on.
 *
 * A third, which is the design's own figure: opening at the ground shows a new
 * day's worth of empty sky and opening at the ridge shows the flag to somebody
 * who has not reached it. A third puts what the reader came for on screen and
 * leaves the climb above them visible as the thing to do.
 */
const FOCUS_FROM_TOP = 1 / 3;

export function flightFrame(input: FlightFrameInput): FlightFrame {
  // Never negative. The rail measures on the first layout pass, so the first
  // render legitimately asks for a frame before there is a rail to clear.
  const topInset = Math.max(0, input.chromeBottom + input.gap);
  const contentHeight = topInset + input.boxHeight;

  // No bird of your own opens at the foot, where the day starts.
  const focus = topInset + (input.focusY ?? input.boxHeight);

  const furthest = Math.max(0, contentHeight - input.viewportHeight);
  const openAt = Math.min(furthest, Math.max(0, focus - input.viewportHeight * FOCUS_FROM_TOP));

  return { topInset, contentHeight, openAt };
}

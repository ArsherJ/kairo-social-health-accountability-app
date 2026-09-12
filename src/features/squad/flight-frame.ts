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
 * The fix is an inset rather than a nudge to where the screen opens: blank
 * content above the drawing box, as tall as the chrome plus a gap. Because a
 * scroller cannot go above offset zero, that makes the **top of the path**
 * unreachable by the rail at any offset the reader can produce, rather than
 * only at the one offset the screen chose. Nudging the opening position would
 * have fixed the first frame and left the ridge one drag away from being
 * clipped again.
 *
 * It claims nothing more than that. Birds *below* the top of the path scroll
 * under the rail as the reader climbs, which is what pinned chrome means and
 * is not what was broken. What was broken is that the ridge — where everybody
 * who cleared the Daily Walk ends up, since `cappedSteps` stops at the line —
 * had no offset at which it was clear.
 *
 * The rail's own height is measured rather than assumed, because it carries a
 * line of type and therefore grows with Dynamic Type.
 *
 * Pure, and here rather than in `app/(tabs)/sky.tsx`, for the reason every
 * other decision on this screen is: root Vitest cannot load a component file at
 * all, and the clearance is exactly the kind of arithmetic that is invisible
 * until somebody looks at a device.
 */

/**
 * How big a bird on the corridor is, in points — the ordinary one and your own.
 *
 * Here rather than in `SkyMarker.tsx`, which is where they were and where they
 * are used. The inset above exists to keep the topmost figure clear of the
 * rail, so the only test that can prove it needs the figure's size — and root
 * Vitest cannot load a component file at all, so a literal there means a
 * literal hand-copied into the test beside it. Grow the bird and the head goes
 * back under the rail with the guard still green. That is the `stat-names.ts`
 * move again: a constant a test cannot reach is a constant with no rule on it.
 */
export const SKY_FIGURE = 44;
export const SKY_SELF_FIGURE = 60;

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
 * A third is preferred: it puts what the reader came for on screen and leaves
 * the climb above visible as the thing to do. Enlarged chrome can extend past
 * that point, so the actual target moves down just enough to clear the measured
 * chrome, the layout gap, and half of the self figure.
 */
const FOCUS_FROM_TOP = 1 / 3;

export function flightFrame(input: FlightFrameInput): FlightFrame {
  // Never negative. The rail measures on the first layout pass, so the first
  // render legitimately asks for a frame before there is a rail to clear.
  const topInset = Math.max(0, input.chromeBottom + input.gap);
  const contentHeight = topInset + input.boxHeight;

  // No bird of your own opens at the foot, where the day starts.
  const focus = topInset + (input.focusY ?? input.boxHeight);
  const preferredFocus = input.viewportHeight * FOCUS_FROM_TOP;
  const clearOfChrome = topInset + SKY_SELF_FIGURE / 2;
  const focusFromTop = Math.min(
    Math.max(0, input.viewportHeight - SKY_SELF_FIGURE / 2),
    Math.max(preferredFocus, clearOfChrome),
  );

  const furthest = Math.max(0, contentHeight - input.viewportHeight);
  const openAt = Math.min(furthest, Math.max(0, focus - focusFromTop));

  return { topInset, contentHeight, openAt };
}

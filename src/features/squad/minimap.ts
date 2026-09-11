import { SKY_MINIMAP_WIDTH, type SkyFlightPlacement } from './sky-flight.ts';

/**
 * The flight's minimap — the arithmetic (deviation #72).
 *
 * The Sky is a corridor four times taller than the screen, scrolled. A pinned
 * strip on the right edge draws the whole flight at once: every bird as a dot,
 * the ridge as a tick, and a window showing
 * which part of the flight the screen is looking at. Dragging the window
 * scrolls the flight; that is what makes it a map rather than a picture.
 *
 * Pure, and here rather than in the component, for the reason every other
 * decision on this screen is: root Vitest cannot load a component file, and
 * "does the window ever leave the strip" and "does a tap land where it points"
 * are exactly the kind of arithmetic that is invisible until somebody drags
 * on a device.
 *
 * All positions are in **points inside the strip**. The strip's own size and
 * where it is pinned are the screen's; the scroller's geometry is
 * `flightFrame`'s and arrives here as `contentHeight`, `topInset` and
 * `boxHeight`, so the map and the flight cannot disagree about where a bird is.
 */

/** The strip is also the scrub responder, so its width meets the 44-point touch minimum. */
export const MINIMAP_WIDTH = SKY_MINIMAP_WIDTH;

/** Horizontal breathing room inside the strip, so a dot never touches its edge. */
const PAD_X = 9;

export interface MinimapGeometry {
  /** The scroller's whole content, in points — `flightFrame().contentHeight`. */
  contentHeight: number;
  /** The scroller's own height. */
  viewportHeight: number;
  /** Blank air above the drawing box — `flightFrame().topInset`. */
  topInset: number;
  /** The drawing box. */
  boxWidth: number;
  boxHeight: number;
  /** The strip's height, in points. */
  mapHeight: number;
}

/** Points per content point, vertically. */
function scaleY(g: MinimapGeometry): number {
  return g.contentHeight > 0 ? g.mapHeight / g.contentHeight : 0;
}

/** A normalised box position to a point inside the strip. */
export function mapPoint(g: MinimapGeometry, x: number, y: number): { x: number; y: number } {
  const clampedX = Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0.5));
  return {
    x: PAD_X + clampedX * (MINIMAP_WIDTH - PAD_X * 2),
    y: (g.topInset + y * g.boxHeight) * scaleY(g),
  };
}

/** Where each bird sits in the strip, from the corridor's own placements. */
export function miniRacers(
  g: MinimapGeometry,
  placements: readonly SkyFlightPlacement[],
): { x: number; y: number }[] {
  return placements.map((p) => mapPoint(g, p.x, p.y));
}

/**
 * The window: which slice of the flight the screen is showing.
 *
 * Clamped to the strip, because the scroller can overscroll past both ends
 * on iOS and a window drawn off the end of the map reads as the map being
 * wrong. Never shorter than a fingertip, so it stays draggable on a very tall
 * flight.
 */
const MIN_WINDOW = 28;

export function viewportWindow(g: MinimapGeometry, offset: number): { top: number; height: number } {
  const s = scaleY(g);
  const height = Math.max(MIN_WINDOW, Math.min(g.mapHeight, g.viewportHeight * s));
  const furthest = Math.max(0, g.contentHeight - g.viewportHeight);
  const clampedOffset = Math.min(furthest, Math.max(0, offset));
  const top = Math.min(g.mapHeight - height, Math.max(0, clampedOffset * s));
  return { top, height };
}

/**
 * A touch at `y` inside the strip, to the content offset that centres the
 * screen on it. Clamped to what the scroller can actually reach, so a drag
 * past either end holds at the end rather than asking for an offset the
 * scroller will refuse.
 */
export function offsetForMapY(g: MinimapGeometry, y: number): number {
  const s = scaleY(g);
  if (s <= 0) return 0;
  const contentY = y / s;
  const furthest = Math.max(0, g.contentHeight - g.viewportHeight);
  return Math.min(furthest, Math.max(0, contentY - g.viewportHeight / 2));
}

/**
 * How tall the strip should be for a given screen: half the viewport, and
 * never past what sits between the pinned chrome above and the cards below.
 * A strip that ran under the standing card would put the ground — where a new
 * day starts — under a card, and the drag would land on the card instead.
 */
export function minimapHeight(input: {
  viewportHeight: number;
  chromeBottom: number;
  footTop: number;
  gap: number;
}): number {
  const room = input.footTop - input.chromeBottom - input.gap * 2;
  return Math.max(0, Math.min(input.viewportHeight * 0.5, room));
}

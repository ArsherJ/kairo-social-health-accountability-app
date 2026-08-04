/**
 * The two motion decisions worth testing, kept out of the hooks so they can
 * run in plain node. No React, no react-native imports — this file is reached
 * by vitest, which resolves neither.
 */

/** Zero when Reduce Motion is on, so every animation resolves instantly. */
export function animationDuration(ms: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : ms;
}

/**
 * Whether an arriving number should animate.
 *
 * A board refetch that returns an unchanged total must not replay the count —
 * realtime broadcasts make that the common case, and a number that re-counts
 * without changing reads as a rendering bug.
 */
export function shouldRecount(previous: number | undefined, next: number): boolean {
  return previous === undefined || previous !== next;
}

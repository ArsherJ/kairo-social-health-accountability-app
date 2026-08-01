/**
 * Interval arithmetic shared by the sleep and workout reads.
 *
 * Zero imports so root Vitest can load this — it has no `@/` alias and cannot
 * parse React Native's Flow syntax.
 */

export interface Interval {
  startMs: number;
  endMs: number;
}

const HOUR_MS = 3_600_000;

/**
 * Union of a set of intervals, sorted and non-overlapping.
 *
 * `HKStatistics` deduplicates overlapping samples across sources for cumulative
 * quantity types, but there is no statistics query for category types, so sleep
 * has to do it by hand. A watch and a third-party sleep app both recording the
 * same night would otherwise report twice the minutes — enough to push a
 * healthy eight hours into REC's over-nine-hours penalty.
 *
 * Touching intervals merge: a session split at 02:00 is one sleep, not two.
 */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const merged: Interval[] = [];

  for (const next of sorted) {
    const last = merged[merged.length - 1];
    if (last && next.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, next.endMs);
    } else {
      merged.push({ startMs: next.startMs, endMs: next.endMs });
    }
  }

  return merged;
}

/**
 * One instant inside each local hour the interval touches.
 *
 * Returned as instants rather than hour numbers on purpose: the caller maps
 * each through `localHourFor`, so this works unchanged in a zone with a
 * half-hour offset, where UTC hour boundaries and local ones do not line up.
 *
 * Half-open — an interval ending exactly on the hour does not mark the hour it
 * ends on, because nothing happened during it.
 */
export function hourlySampleInstants(startMs: number, endMs: number): number[] {
  if (endMs <= startMs) return [startMs];

  const instants: number[] = [];
  for (let at = startMs; at < endMs; at += HOUR_MS) instants.push(at);

  // The interval can end mid-hour, and stepping by whole hours from the start
  // can miss that final hour entirely (08:50 -> 09:10 steps only to 08:50).
  const last = endMs - 1;
  if ((instants[instants.length - 1] as number) < last) instants.push(last);

  return instants;
}

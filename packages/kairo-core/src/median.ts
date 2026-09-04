/**
 * The ordinary median: the middle value, or the mean of the two middle values
 * on an even count.
 *
 * One definition rather than two. It is the judgment the Challenge resolver
 * makes about a run history and the one calibration makes about a fortnight of
 * days, and both make it for the same reason: a mean lets one outstanding day
 * stand in for the ordinary ones, which is exactly the thing neither of them
 * wants to measure.
 *
 * Worth stating rather than assuming, because a small even window is the
 * *common* early case in both callers, not an edge case.
 *
 * **Deliberately not re-exported from `index.ts`.** Both callers are inside
 * this package and reach it by path; a general-purpose statistic on the
 * keystone's public surface invites a consumer that then constrains it.
 *
 * Empty input is the caller's problem, not this function's — both callers
 * already have a minimum-count rule of their own, and returning a number for
 * "nothing to average" would let one of them skip it silently.
 */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

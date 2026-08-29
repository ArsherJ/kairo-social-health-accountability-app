import type { CoreStat } from '@kairo/core';

/**
 * How a record reads, per stat.
 *
 * Zero-runtime-import, the house pattern: the decision is testable in plain
 * Node and the component only performs it. It reaches nothing — the stat words
 * are passed in, exactly as `statDetailLine` takes them, so this module never
 * has to resolve the `@/ui` barrel that root Vitest cannot load.
 */

/** Minutes to "7h 20m" — a record is read at a glance, not spoken aloud. */
function duration(minutes: number): string {
  const whole = Math.round(minutes);
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * The figure itself, in the unit the stat is measured in.
 *
 * **Body is calories, not the strength composite the scorer uses.** A record is
 * what a calorimeter actually saw; the strength credit is a scoring adjustment,
 * and reporting it here would be claiming the day burned energy it did not.
 */
export function recordValue(stat: CoreStat, value: number): string {
  const n = Math.round(value);
  switch (stat) {
    case 'AGI':
      return `${n.toLocaleString()} steps`;
    case 'STR':
      return `${n.toLocaleString()} cal`;
    case 'MND':
      return duration(value);
  }
}

/**
 * "14 Aug" — the day, without the year unless it needs one.
 *
 * Parsed off the string rather than through `Date`, because a `YYYY-MM-DD`
 * handed to `new Date()` is read as UTC and renders as the previous day for
 * every player west of Greenwich. Kairo's whole day model is local; a record
 * dated one day early is a small bug that reads as a broken memory.
 */
export function recordDate(localDate: string, today: string | undefined): string {
  const [y, m, d] = localDate.split('-').map(Number);
  if (!y || !m || !d) return '';
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = MONTHS[m - 1] ?? '';
  const thisYear = today ? Number(today.slice(0, 4)) : y;
  return y === thisYear ? `${d} ${month}` : `${d} ${month} ${y}`;
}

/**
 * The line under an empty rail.
 *
 * An empty screen is an invitation, never a report of absence — so this names
 * what makes a record rather than observing that there isn't one.
 */
export const RECORDS_EMPTY = 'Your best day on each stat lands here once you have one.';

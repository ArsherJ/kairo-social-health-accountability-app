/**
 * A month of local dates, laid out as calendar cells.
 *
 * Pure and clock-free, like everything worth testing in this app: it takes the
 * month to draw and the days that cleared, and returns the cells. That is what
 * lets the awkward cases — a month starting on a Sunday, a February, a day in
 * the future, a leading run of blanks — be settled in Node rather than by
 * squinting at a simulator on the 1st of a month.
 *
 * **Zero imports**, so root Vitest can load it: no `@/` alias, no React Native.
 * The same constraint that shaped `stat-names.ts`, `buffer.ts` and
 * `quest-dial.ts`.
 *
 * **It does no timezone arithmetic and must not start.** Every date here is an
 * ISO `YYYY-MM-DD` *local date string* — the key `daily_scores` is already
 * stored under, resolved by `currentLocalDate` in the caller against the
 * player's own zone (§2). Parsing one into a `Date` to ask what weekday it is
 * would reintroduce exactly the UTC-drift bug per-user local days exist to
 * avoid: `new Date('2026-08-01')` is midnight *UTC*, which in Manila is already
 * the 1st at 8am and in Los Angeles is still July 31st.
 *
 * So the weekday is computed arithmetically from the calendar itself.
 */

/** What a single cell in the grid is. */
export type MonthCell =
  /** Padding before the 1st, so the month starts on the right weekday. */
  | { kind: 'blank' }
  /** A day that has happened, and whether the Daily Walk cleared on it. */
  | { kind: 'day'; date: string; day: number; cleared: boolean; isToday: boolean }
  /** A day still to come this month. Drawn, but quiet — it is not a miss. */
  | { kind: 'future'; date: string; day: number };

export interface MonthGrid {
  /** `2026-08`, the month drawn. */
  month: string;
  /** Cells in reading order, Sunday-first, blanks included. */
  cells: MonthCell[];
  /** How many days in this month cleared. What the header chip counts. */
  cleared: number;
}

/** Days in each month, January first. February is corrected below. */
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month1: number): number {
  if (month1 === 2) return isLeap(year) ? 29 : 28;
  return MONTH_LENGTHS[month1 - 1] ?? 30;
}

/**
 * The weekday of a date, 0 = Sunday, by Sakamoto's method.
 *
 * Arithmetic rather than `new Date(...).getDay()`, and that is the load-bearing
 * choice in this file — see the module comment. Sakamoto is exact for any date
 * in the Gregorian calendar and needs no clock, no zone and no parsing.
 */
export function weekdayOf(year: number, month1: number, day: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;
  const y = month1 < 3 ? year - 1 : year;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + (t[month1 - 1] ?? 0) + day) % 7;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The grid for the month containing `today`.
 *
 * `cleared` is the set of local dates on which the Daily Walk cleared — pass
 * `useWalkHistory`'s rows filtered to `met`. Dates outside the month are
 * ignored rather than rejected: the history window is 90 days and the grid is
 * one month, so being handed extra is the normal case.
 *
 * A date **after** `today` is a `future` cell, never a miss. That distinction
 * is the whole reason this is not a two-state grid: on the 3rd of the month,
 * twenty-eight grey squares reading as twenty-eight failures is a worse thing
 * to show somebody than no calendar at all.
 */
export function monthGrid(today: string, cleared: Iterable<string>): MonthGrid {
  const [yearText, monthText] = today.split('-');
  const year = Number(yearText);
  const month1 = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month1) || month1 < 1 || month1 > 12) {
    return { month: '', cells: [], cleared: 0 };
  }

  const done = new Set(cleared);
  const length = daysInMonth(year, month1);
  const lead = weekdayOf(year, month1, 1);

  const cells: MonthCell[] = Array.from({ length: lead }, () => ({ kind: 'blank' as const }));
  let count = 0;

  for (let day = 1; day <= length; day++) {
    const date = `${year}-${pad2(month1)}-${pad2(day)}`;
    if (date > today) {
      cells.push({ kind: 'future', date, day });
      continue;
    }
    const isCleared = done.has(date);
    if (isCleared) count += 1;
    cells.push({ kind: 'day', date, day, cleared: isCleared, isToday: date === today });
  }

  return { month: `${year}-${pad2(month1)}`, cells, cleared: count };
}

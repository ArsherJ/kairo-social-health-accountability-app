import { CORE_STATS, type CoreStat } from './types.ts';

/**
 * Per-user local days (spec §2). Every player's day runs midnight-to-midnight in
 * their own timezone, so an OFW in Dubai and their sibling in Cebu each get a
 * fair 24-hour window and correct hourly buckets.
 *
 * Every function here takes `now` as an argument and never reads the clock.
 * That is what makes timezone and DST behaviour testable without time mocking.
 *
 * A "local date" is always the string `YYYY-MM-DD`.
 */

/** Days finalize this long after the user's local midnight, to catch late syncs. */
export const FINALIZATION_GRACE_MS = 2 * 60 * 60 * 1000;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsIn(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  const hour = read('hour');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // Some ICU builds report midnight as hour 24.
    hour: hour === 24 ? 0 : hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** The zone's UTC offset, in milliseconds, at a given instant. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const p = partsIn(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncatedToSecond = Math.floor(instant.getTime() / 1000) * 1000;
  return asIfUtc - truncatedToSecond;
}

function parseLocalDate(date: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new Error(`Invalid local date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function toLocalDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** The user's local calendar date at a given instant. */
export function currentLocalDate(now: Date, timeZone: string): string {
  const p = partsIn(now, timeZone);
  return toLocalDate(p.year, p.month, p.day);
}

/** The user's local hour (0-23) at a given instant — the health bucket key. */
export function localHourFor(now: Date, timeZone: string): number {
  return partsIn(now, timeZone).hour;
}

/**
 * The UTC instant of a given wall-clock hour on a given local date.
 *
 * Resolved by guessing with the offset at the naive instant and then refining
 * once with the offset at the guess, which settles DST transitions. On a
 * spring-forward day where the requested hour does not exist, this lands on the
 * following hour rather than throwing.
 */
export function localZonedTimeUtc(
  localDate: string,
  timeZone: string,
  hour = 0,
): Date {
  const { year, month, day } = parseLocalDate(localDate);
  const naive = Date.UTC(year, month - 1, day, hour);
  const firstGuess = naive - offsetMsAt(new Date(naive), timeZone);
  return new Date(naive - offsetMsAt(new Date(firstGuess), timeZone));
}

/** Local midnight opening the given date. */
export function dayStartUtc(localDate: string, timeZone: string): Date {
  return localZonedTimeUtc(localDate, timeZone, 0);
}

/** Local midnight closing the given date — i.e. the next day's start. */
export function dayEndUtc(localDate: string, timeZone: string): Date {
  return dayStartUtc(addDays(localDate, 1), timeZone);
}

/** Shift a local date string by whole days. */
export function addDays(localDate: string, days: number): string {
  const { year, month, day } = parseLocalDate(localDate);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return toLocalDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

export function previousDay(localDate: string): string {
  return addDays(localDate, -1);
}

/**
 * When the day's results stop being provisional. Coins and XP are awarded here,
 * and backfilled data arriving after this point can no longer change rankings.
 */
export function finalizesAtUtc(localDate: string, timeZone: string): Date {
  return new Date(dayEndUtc(localDate, timeZone).getTime() + FINALIZATION_GRACE_MS);
}

export function isFinalizable(
  localDate: string,
  timeZone: string,
  now: Date,
): boolean {
  return now.getTime() >= finalizesAtUtc(localDate, timeZone).getTime();
}

/**
 * The last local date that has fully elapsed. Squad leaderboards compare
 * most-recently-completed days so mixed-timezone squads stay comparable.
 */
export function mostRecentlyCompletedLocalDate(now: Date, timeZone: string): string {
  return previousDay(currentLocalDate(now, timeZone));
}

/** ISO-8601 week number. Weeks start Monday, matching the Monday meta rotation. */
export function isoWeekOf(localDate: string): number {
  const { year, month, day } = parseLocalDate(localDate);
  const target = new Date(Date.UTC(year, month - 1, day));

  // Shift to the Thursday of this week; the ISO year is whatever year that lands in.
  const dayIndex = (target.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayIndex + 3);

  const isoYear = target.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Index = (jan4.getUTCDay() + 6) % 7;
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4 - jan4Index + 3));

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / weekMs);
}

/**
 * The week's 1.5x featured stat (spec §6). Rotates over `CORE_STATS` — AGI →
 * STR → MND since deviation #41 — so no single build dominates long-term, and
 * gives Monday a reason to re-engage.
 *
 * Nothing on the write path calls this: deviation #10 retired the rotation
 * from stored scoring. It survives so V1 can resurrect it as a read-time
 * projection.
 */
export function featuredStatFor(localDate: string): CoreStat {
  const index = (isoWeekOf(localDate) - 1) % CORE_STATS.length;
  return CORE_STATS[index] as CoreStat;
}

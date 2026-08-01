import {
  addDays,
  currentLocalDate,
  dayEndUtc,
  dayStartUtc,
  previousDay,
} from '@kairo/core';
import { MAX_DIRTY_DATES, type SyncState } from './sync-state.ts';

/**
 * Which local days to re-read from HealthKit, and the UTC span covering them.
 *
 * There are no persisted HealthKit anchors (roadmap deviation #8). Instead the
 * window is derived fresh every time from the dirty set plus today, which makes
 * a stale-anchor data loss impossible: the worst case is re-reading data
 * already sent, and `sync-health` upserts, so that is free.
 *
 * `now` is an argument and the clock is never read, which is what makes the
 * timezone and DST behaviour testable without mocking time.
 */

/**
 * Yesterday rides along with today on every sync.
 *
 * Nothing marks yesterday dirty at the midnight rollover, and a watch or phone
 * that syncs late writes samples into hours that have already passed. Without
 * this, those steps would only ever reach the server if something else happened
 * to dirty the date — and `finalize-days` closes the day ~2h after local
 * midnight (FINALIZATION_GRACE_MS), so the miss would be permanent.
 */
const ROUTINE_WINDOW_DAYS = 2;

export interface SyncWindow {
  /** Local dates to send, ascending. Always contains today and yesterday. */
  dates: string[];
  /** Local midnight opening the first date. */
  fromUtc: Date;
  /** Local midnight closing the last date. */
  toUtc: Date;
}

export function resolveSyncWindow(
  state: SyncState,
  now: Date,
  timeZone: string,
): SyncWindow {
  const today = currentLocalDate(now, timeZone);
  const oldest = addDays(today, -(MAX_DIRTY_DATES - 1));

  const routine: string[] = [today];
  for (let i = 1; i < ROUTINE_WINDOW_DAYS; i += 1) {
    routine.push(previousDay(routine[i - 1] as string));
  }

  const dates = [...new Set([...state.dirtyDates, ...routine])]
    // Bounding by *date* rather than by count is what keeps the UTC span short.
    // A single date stuck from months ago would otherwise turn one sync into an
    // hourly read across half a year, for a day that is long final anyway.
    //
    // Future dates are excluded rather than dropped: travelling west moves the
    // local date backwards, so a day already synced can briefly sit ahead of
    // the clock. It stays in `dirtyDates` and syncs once the clock catches up.
    .filter((d) => d >= oldest && d <= today)
    .sort();

  return {
    dates,
    fromUtc: dayStartUtc(dates[0] as string, timeZone),
    // Not `fromUtc + n * 24h`. A local day is 23 or 25 hours across a DST
    // transition, and the closing midnight is the only honest end.
    toUtc: dayEndUtc(dates[dates.length - 1] as string, timeZone),
  };
}

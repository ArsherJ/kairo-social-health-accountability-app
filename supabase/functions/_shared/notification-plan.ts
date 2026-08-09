/**
 * The decision-making half of `dispatch-notifications`, kept free of I/O so it
 * can be tested in plain Node.
 *
 * The cron fires every hour and asks the database which users are living at
 * each of the three hours §14 schedules on. This module turns that answer into
 * candidates: which trigger, and — the part that is easy to get wrong — which
 * local date the notification is actually *about*.
 */

import { previousDay, type Candidate, type NotificationTrigger } from './core.ts';

/**
 * The three local hours MVP dispatches on (§14). Every MVP trigger is on a
 * clock; nothing fires in real time from another user's action any more.
 *
 * V1 adds 20:00 (streak at risk) and Sunday 21:00 PHT (weekly recap).
 */
export const DISPATCH_HOURS: Readonly<Record<number, NotificationTrigger>> = {
  0: 'day_ends',
  9: 'day_starts',
  23: 'day_ending_soon',
};

/** One row of `users_at_local_hour()`. */
export interface DispatchUser {
  userId: string;
  /** The date the user is currently living in — not necessarily the one the
   * notification is about. */
  localDate: string;
  timeZone: string;
}

export type DispatchData = {
  /** The local date the notification concerns. */
  aboutDate: string;
  /**
   * The local date the user is living in when it goes out — the budget bucket
   * `notification_log.local_date` records. Equal to `aboutDate` except at local
   * hour 0, where the day being described has just ended.
   */
  sendDate: string;
  timeZone: string;
};

export interface DispatchCandidate extends Candidate {
  data: DispatchData;
}

/**
 * Turn "these users are at local hour H" into what may be sent to them.
 *
 * Note there is no `now` parameter. The local date arrives from SQL, where the
 * timezone arithmetic already happened; re-deriving it here from a UTC instant
 * would be a second implementation of the thing this function is downstream of.
 */
export function planHourlyDispatch(input: {
  hour: number;
  users: readonly DispatchUser[];
  /**
   * User ids known to have opened the app on their current local date. Only
   * consulted for `day_starts`.
   */
  openedApp?: readonly string[];
}): DispatchCandidate[] {
  const trigger = DISPATCH_HOURS[input.hour];
  // Twenty-one hours of the day carry nothing. The cron still fires on all of
  // them, so this is the normal path, not an error.
  if (!trigger) return [];

  const opened = new Set(input.openedApp ?? []);

  const candidates: DispatchCandidate[] = [];
  for (const user of input.users) {
    // §14: mid-morning, "only if the app hasn't been opened yet". Telling
    // someone their day started while they are looking at the screen is noise.
    if (trigger === 'day_starts' && opened.has(user.userId)) continue;

    candidates.push({
      trigger,
      userId: user.userId,
      data: {
        // At local hour 0 the user has already rolled into the new day, and the
        // result being announced belongs to the one before it.
        aboutDate: trigger === 'day_ends' ? previousDay(user.localDate) : user.localDate,
        sendDate: user.localDate,
        timeZone: user.timeZone,
      },
    });
  }

  return candidates;
}

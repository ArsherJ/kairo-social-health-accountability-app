/**
 * The decision-making half of `dispatch-notifications`, kept free of I/O so it
 * can be tested in plain Node.
 *
 * The cron fires every hour and asks the database which users are living at the
 * one hour Kairo dispatches on. This module turns that answer into candidates:
 * which trigger, and — the part that is easy to get wrong — which local dates
 * the notification is actually *about*.
 */

import { previousDay, type Candidate, type NotificationTrigger } from './core.ts';

/**
 * The one local hour the app dispatches on (roadmap deviation #52).
 *
 * **08:00, and deliberately not the finalization moment.** Days finalize
 * roughly two hours after each user's local midnight, so a digest carrying the
 * finalized result would fire at about 2am. The two are decoupled:
 * `finalize-days` writes the result when the day closes, and this sends it when
 * the recipient is awake to read it.
 *
 * The cron still fires hourly and twenty-three of those hours produce nothing.
 * That is the normal path, not an error — every hour of the day is somebody's
 * 08:00, and the same run that greets a Manila player greets a New York one
 * thirteen hours later.
 */
export const DIGEST_HOUR = 8;

/**
 * The triggers a clock can produce.
 *
 * Narrower than `NotificationTrigger` on purpose, and narrower than it used to
 * be: `event_completed` and `challenge_cleared` fire from `finalize-days` when
 * something latches, and the three retired evening triggers fire from nowhere
 * at all. Expressing that in the type is what lets the copy layer be exhaustive
 * without a throw for a case that cannot happen.
 */
export type ScheduledTrigger = Extract<NotificationTrigger, 'daily_digest'>;

/** One row of `users_needing_digest()`. */
export interface DispatchUser {
  userId: string;
  /** The date the user is currently living in. */
  localDate: string;
  timeZone: string;
}

export type DispatchData = {
  /** The date whose *result* the digest carries — yesterday. */
  resultDate: string;
  /** The date whose *standing* it carries — today, still being run. */
  standingDate: string;
  /** The local date the budget ledger records. Always today. */
  sendDate: string;
  timeZone: string;
};

export interface DispatchCandidate extends Candidate {
  trigger: ScheduledTrigger;
  data: DispatchData;
}

/**
 * Turn "these users are at local hour H" into the one thing that may be sent.
 *
 * Note there is no `now` parameter. The local date arrives from SQL, where the
 * timezone arithmetic already happened; re-deriving it here from a UTC instant
 * would be a second implementation of the thing this function is downstream of.
 *
 * **It does not enforce the once-a-day cap and must not try.** The cap is a
 * server-side ledger applied in the selection query (`users_needing_digest`),
 * because a cap applied after selection is one this function cannot see across
 * two invocations of the cron — and a client-side cap is not a cap at all, it
 * is a race between the same account's devices.
 */
export function planDigest(input: {
  hour: number;
  users: readonly DispatchUser[];
}): DispatchCandidate[] {
  if (input.hour !== DIGEST_HOUR) return [];

  return input.users.map((user) => ({
    trigger: 'daily_digest' as const,
    userId: user.userId,
    data: {
      // Yesterday's race is the one that has a result: it finalized about two
      // hours after this user's local midnight, six hours ago.
      resultDate: previousDay(user.localDate),
      standingDate: user.localDate,
      sendDate: user.localDate,
      timeZone: user.timeZone,
    },
  }));
}

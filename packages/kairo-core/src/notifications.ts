/**
 * The notification budget engine (spec §14).
 *
 * Pure, exactly like scoring: no I/O, no clock reads, no randomness. The caller
 * supplies the local time, so §14's quiet-hours and frequency rules are
 * testable in plain Node — without a device, a push certificate, or a fake
 * clock. That matters more here than elsewhere, because the failure mode of a
 * notification rule is invisible: over-sending reads as spam and under-sending
 * reads as nothing at all.
 *
 * This module answers exactly one question — *which of these may go out* — and
 * deliberately never builds copy, formats a payload, or sends anything.
 */

export type NotificationTrigger =
  | 'sabotaged'
  | 'day_ending_soon'
  | 'day_ends'
  | 'day_starts';
// V1 adds: 'podium_drop' | 'overtake_digest' | 'weekly_recap' | 'streak_at_risk'

/** §14: "max 3/day (configurable)". Configurable means this constant at MVP. */
export const MAX_NOTIFICATIONS_PER_DAY = 3;

/** §14's quiet window, in the recipient's own local hours. */
export const QUIET_HOURS = { from: 22, to: 7 } as const;

/**
 * Triggers quiet hours do not suppress.
 *
 * §14 exempts sabotage explicitly and then schedules the day-boundary pair at
 * 23:00 and 00:00 — inside the window. Those two are the core evening loop, not
 * discretionary, so they are exempt on the same footing rather than as an
 * exception to an exception (plan decision #2).
 */
export const QUIET_HOURS_EXEMPT: readonly NotificationTrigger[] = [
  'sabotaged',
  'day_ending_soon',
  'day_ends',
];

/**
 * Triggers that send regardless of the daily budget. §14 calls sabotage "the
 * emotional core".
 *
 * Kept as a separate list from QUIET_HOURS_EXEMPT on purpose: the two rules are
 * independent in §14, and collapsing them would make the day-boundary pair
 * budget-exempt as a side effect of a quiet-hours decision.
 */
export const BUDGET_EXEMPT: readonly NotificationTrigger[] = ['sabotaged'];

/**
 * Whether a *sent* notification should be counted when reading `sentToday`.
 *
 * Exported because the sender needs the same answer this module uses: every
 * successful send is logged, including sabotage, and counting the logged
 * sabotage sends would let an afternoon hit consume the budget §14 exempts it
 * from — quietly suppressing the evening loop for the busiest squads.
 */
export function countsAgainstBudget(trigger: NotificationTrigger): boolean {
  return !BUDGET_EXEMPT.includes(trigger);
}

export interface Candidate {
  trigger: NotificationTrigger;
  userId: string;
  /** Opaque to this module — it never builds copy. */
  data: Record<string, unknown>;
}

export interface LocalTime {
  hour: number;
  minute: number;
}

/**
 * True when `hour` falls inside a window that may wrap past midnight.
 *
 * The wrap is the whole point: 22 -> 7 is `hour >= 22 || hour < 7`, and the
 * naive `from <= hour && hour < to` is empty for that window — which would
 * disable quiet hours entirely while looking correct.
 */
function isWithinHours(hour: number, window: { from: number; to: number }): boolean {
  if (window.from === window.to) return false;
  return window.from > window.to
    ? hour >= window.from || hour < window.to
    : hour >= window.from && hour < window.to;
}

/**
 * Decide which candidates may be sent now.
 *
 * Rules apply in order: quiet hours first, then the daily budget, then the
 * survivors are returned in the order they arrived. Nothing is mutated.
 */
export function planNotifications<T extends Candidate>(input: {
  candidates: readonly T[];
  /** Successful sends already logged for this user's local date. */
  sentToday: number;
  localNow: LocalTime;
  quietHours?: { from: number; to: number };
  maxPerDay?: number;
}): T[] {
  const quietHours = input.quietHours ?? QUIET_HOURS;
  const maxPerDay = input.maxPerDay ?? MAX_NOTIFICATIONS_PER_DAY;
  const quiet = isWithinHours(input.localNow.hour, quietHours);

  const admitted: T[] = [];
  let spent = input.sentToday;

  for (const candidate of input.candidates) {
    if (quiet && !QUIET_HOURS_EXEMPT.includes(candidate.trigger)) continue;

    if (!countsAgainstBudget(candidate.trigger)) {
      // Exempt sends do not consume the budget either — otherwise a busy
      // sabotage day would silently cost the user their day-end notification.
      admitted.push(candidate);
      continue;
    }

    if (spent >= maxPerDay) continue;
    spent += 1;
    admitted.push(candidate);
  }

  return admitted;
}

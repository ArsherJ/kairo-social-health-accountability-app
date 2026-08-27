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
  /**
   * The one scheduled push (roadmap deviation #52). 08:00 in the recipient's
   * own timezone, carrying yesterday's final race result and today's live
   * standing.
   */
  | 'daily_digest'
  /**
   * **Historical, all three.** The §14 evening loop — 23:00, 00:00 and the
   * mid-morning nudge — was retired on 2026-08-25 when three pushes a day
   * became one. They stay in the union because `notification_log.kind` is free
   * text with no check constraint: rows already say them, `countsAgainstBudget`
   * reads them, and a historical value matching no case is a tap that goes
   * nowhere — indistinguishable from push being broken. Nothing emits them any
   * more.
   */
  | 'day_ending_soon'
  | 'day_ends'
  | 'day_starts'
  | 'event_completed'
  /**
   * **Historical.** Retired on 2026-08-25 when Goals became Events (deviation
   * #45), and kept in the union for the same reason as the three above.
   */
  | 'goal_completed'
  | 'challenge_cleared';
// V1 adds: 'podium_drop' | 'overtake_digest' | 'weekly_recap' | 'streak_at_risk'

/**
 * §14: "max 3/day (configurable)". Configurable means this constant at MVP.
 *
 * **Deviation #52 left it at 3 deliberately.** That deviation caps the
 * *scheduled* pushes at one; it does not touch the budget that bounds the
 * event-driven ones, and a digest plus an Event completion plus a Challenge
 * clear is still three. Each of the latter two fires from something the user
 * did. Collapsing the two rules would be a scheduling decision quietly
 * changing an unrelated one.
 */
export const MAX_NOTIFICATIONS_PER_DAY = 3;

/** §14's quiet window, in the recipient's own local hours. */
export const QUIET_HOURS = { from: 22, to: 7 } as const;

/**
 * Triggers quiet hours do not suppress.
 *
 * §14 forbids the 22:00–07:00 window and then schedules the day-boundary pair at
 * 23:00 and 00:00 — inside it. Those two are the core evening loop, not
 * discretionary, so they are exempt on the same footing rather than as an
 * exception to an exception (plan decision #2). Both are **historical** now,
 * and the list keeps naming them because a push sent before the deploy can be
 * counted after it.
 *
 * **`daily_digest` is deliberately absent.** The exemptions the retired pair
 * needed were for 23:00 and 00:00; 08:00 is never in quiet hours, so a digest
 * needing an exemption would mean the schedule itself was wrong — and the
 * exemption would hide that.
 */
export const QUIET_HOURS_EXEMPT: readonly NotificationTrigger[] = [
  'day_ending_soon',
  'day_ends',
];

/**
 * Triggers that send regardless of the daily budget.
 *
 * `event_completed` earns it on a better claim than `sabotaged` had: it fires
 * once per commitment, at most, and the squad set that commitment themselves. A
 * recurring nudge would not qualify — the exemption is for things the user asked
 * for, not things we want them to see. `goal_completed` held the exemption on
 * exactly the same claim and keeps it, because a push sent before the rename can
 * still be counted after it.
 *
 * **`challenge_cleared` is that disqualifying case, and is deliberately absent.**
 * A challenge clears repeatedly by design — that is the mechanic — so exempting
 * it would be exactly the recurring nudge the sentence above rules out. It is
 * not quiet-hours exempt either, for `event_completed`'s reason: finalization
 * runs about two hours after local midnight.
 *
 * Kept as a separate list from QUIET_HOURS_EXEMPT on purpose: the two rules are
 * independent in §14, and collapsing them would make the day-boundary pair
 * budget-exempt as a side effect of a quiet-hours decision. Note that
 * `event_completed` is deliberately NOT quiet-hours exempt — finalization runs
 * about two hours after local midnight, squarely inside the window, and a push
 * at 02:00 to say "well done" is worth waiting for morning.
 */
export const BUDGET_EXEMPT: readonly NotificationTrigger[] = [
  'event_completed',
  'goal_completed',
];

/**
 * Whether a *sent* notification should be counted when reading `sentToday`.
 *
 * Exported because the sender needs the same answer this module uses: every
 * successful send is logged, including exempt ones, and counting those would let
 * an exempt send consume the budget it is exempt from — quietly suppressing the
 * evening loop.
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
      // Exempt sends do not consume the budget either — otherwise a day that
      // happened to fire one would silently cost the user their day-end
      // notification.
      admitted.push(candidate);
      continue;
    }

    if (spent >= maxPerDay) continue;
    spent += 1;
    admitted.push(candidate);
  }

  return admitted;
}

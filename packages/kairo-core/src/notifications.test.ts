import { describe, expect, it } from 'vitest';
import {
  BUDGET_EXEMPT,
  MAX_NOTIFICATIONS_PER_DAY,
  QUIET_HOURS,
  countsAgainstBudget,
  planNotifications,
  type Candidate,
  type NotificationTrigger,
} from './notifications.ts';

describe('what counts against the budget', () => {
  it('exempts a completed goal and counts every scheduled trigger', () => {
    // The sender reads sentToday with this same predicate. If a logged
    // goal_completed counted, hitting a goal in the evening would silently cost
    // the user their day-end push — the cap applying to a trigger it exempts, by
    // the back door.
    expect(BUDGET_EXEMPT).toEqual(['goal_completed']);
    expect(countsAgainstBudget('goal_completed')).toBe(false);
    expect(countsAgainstBudget('day_starts')).toBe(true);
    expect(countsAgainstBudget('day_ending_soon')).toBe(true);
    expect(countsAgainstBudget('day_ends')).toBe(true);
  });
});

function candidate(
  trigger: NotificationTrigger,
  userId = 'user-1',
  data: Record<string, unknown> = {},
): Candidate {
  return { trigger, userId, data };
}

function plan(
  candidates: readonly Candidate[],
  hour: number,
  sentToday = 0,
): Candidate[] {
  return planNotifications({
    candidates,
    sentToday,
    localNow: { hour, minute: 0 },
  });
}

describe('quiet hours', () => {
  it('suppresses a non-exempt trigger at 23:00', () => {
    expect(plan([candidate('day_starts')], 23)).toEqual([]);
  });

  it('suppresses a non-exempt trigger at 03:00, on the far side of midnight', () => {
    // The window wraps. A `from <= h && h < to` predicate is empty for 22 -> 7
    // and would silently disable quiet hours entirely.
    expect(plan([candidate('day_starts')], 3)).toEqual([]);
  });

  it('does not suppress the day-boundary pair, which §14 schedules inside the window', () => {
    const ending = candidate('day_ending_soon');
    const ends = candidate('day_ends');
    expect(plan([ending], 23)).toEqual([ending]);
    expect(plan([ends], 0)).toEqual([ends]);
  });

  it('suppresses nothing at midday', () => {
    const starts = candidate('day_starts');
    expect(plan([starts], 12)).toEqual([starts]);
  });

  it('treats 22:00 as quiet and 21:59 as not', () => {
    const starts = candidate('day_starts');
    expect(
      planNotifications({
        candidates: [starts],
        sentToday: 0,
        localNow: { hour: QUIET_HOURS.from, minute: 0 },
      }),
    ).toEqual([]);
    expect(
      planNotifications({
        candidates: [starts],
        sentToday: 0,
        localNow: { hour: QUIET_HOURS.from - 1, minute: 59 },
      }),
    ).toEqual([starts]);
  });

  it('treats 06:59 as quiet and 07:00 as not', () => {
    const starts = candidate('day_starts');
    expect(
      planNotifications({
        candidates: [starts],
        sentToday: 0,
        localNow: { hour: QUIET_HOURS.to - 1, minute: 59 },
      }),
    ).toEqual([]);
    expect(
      planNotifications({
        candidates: [starts],
        sentToday: 0,
        localNow: { hour: QUIET_HOURS.to, minute: 0 },
      }),
    ).toEqual([starts]);
  });

  it('honours a caller-supplied window that does not wrap', () => {
    const starts = candidate('day_starts');
    expect(
      planNotifications({
        candidates: [starts],
        sentToday: 0,
        localNow: { hour: 13, minute: 0 },
        quietHours: { from: 12, to: 14 },
      }),
    ).toEqual([]);
    expect(
      planNotifications({
        candidates: [starts],
        sentToday: 0,
        localNow: { hour: 14, minute: 0 },
        quietHours: { from: 12, to: 14 },
      }),
    ).toEqual([starts]);
  });
});

describe('the daily budget', () => {
  it('admits exactly maxPerDay - sentToday non-exempt candidates', () => {
    const candidates = [
      candidate('day_starts'),
      candidate('day_ending_soon'),
      candidate('day_ends'),
    ];
    const admitted = plan(candidates, 12, MAX_NOTIFICATIONS_PER_DAY - 2);
    expect(admitted).toEqual(candidates.slice(0, 2));
  });

  it('admits nothing non-exempt once the budget is spent', () => {
    expect(plan([candidate('day_ending_soon')], 12, MAX_NOTIFICATIONS_PER_DAY)).toEqual(
      [],
    );
  });

  it('applies the budget to the quiet-hours-exempt pair, which is not budget-exempt', () => {
    // The two lists are separate on purpose. `day_ends` bypasses quiet hours
    // and still has to pay the budget — collapsing the lists would silently
    // make the day-boundary pair unlimited.
    expect(plan([candidate('day_ends')], 0, MAX_NOTIFICATIONS_PER_DAY)).toEqual([]);
  });

  it('sends a completed goal with the budget long gone', () => {
    const done = candidate('goal_completed');
    expect(plan([done], 12, 99)).toEqual([done]);
  });

  it('does not let a completed goal consume the budget the others share', () => {
    const done = candidate('goal_completed');
    const ends = candidate('day_ends');
    const admitted = plan([done, ends], 12, MAX_NOTIFICATIONS_PER_DAY - 1);
    expect(admitted).toEqual([done, ends]);
  });

  it('still suppresses a completed goal during quiet hours', () => {
    // Budget-exempt is not quiet-hours-exempt. Finalization runs ~2h after local
    // midnight, so an unsuppressed goal push would land at 02:00.
    expect(plan([candidate('goal_completed')], 2)).toEqual([]);
  });

  it('honours a caller-supplied maxPerDay', () => {
    const candidates = [candidate('day_ends'), candidate('day_starts')];
    expect(
      planNotifications({
        candidates,
        sentToday: 0,
        localNow: { hour: 12, minute: 0 },
        maxPerDay: 1,
      }),
    ).toEqual([candidates[0]]);
  });
});

describe('purity', () => {
  it('preserves candidate order', () => {
    const candidates = [
      candidate('day_ends', 'a'),
      candidate('day_ending_soon', 'b'),
      candidate('day_starts', 'c'),
    ];
    expect(plan(candidates, 12).map((c) => c.userId)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array or its candidates', () => {
    const candidates = [candidate('day_starts'), candidate('day_ends')];
    const snapshot = JSON.parse(JSON.stringify(candidates)) as Candidate[];
    plan(candidates, 3, 99);
    expect(candidates).toEqual(snapshot);
  });

  it('returns the same answer for the same input', () => {
    const candidates = [candidate('day_ends'), candidate('day_starts')];
    const once = plan(candidates, 23, 1);
    const twice = plan(candidates, 23, 1);
    expect(once).toEqual(twice);
  });
});

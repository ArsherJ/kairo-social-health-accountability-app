import { describe, expect, it } from 'vitest';
import { eventRowToEvent, planEventCompletions, type EventRow } from './event-plan.ts';

const row: EventRow = {
  id: 'e1',
  squad_id: 's1',
  title: 'The Carabao',
  description: null,
  kind: 'battle',
  metric: 'active_kcal',
  target: 3_000,
  starts_on: '2026-09-01',
  ends_on: '2026-09-07',
};

const roster = ['alice', 'bob'];

/** One day of the fight, as `event_progress()` returns it: a row per member. */
const pooled = (
  localDate: string,
  total: number,
  status: 'final' | 'provisional' = 'final',
) =>
  roster.map((userId) => ({
    user_id: userId,
    character_name: userId,
    species: null,
    local_date: localDate,
    // Withheld, as it is for any candidate who has not consented. Grading must
    // not depend on it.
    value: null,
    pooled_value: total,
    status,
  }));

describe('eventRowToEvent', () => {
  it('narrows the database strings', () => {
    const event = eventRowToEvent(row);
    expect(event.kind).toBe('battle');
    expect(event.metric).toBe('active_kcal');
  });

  it('degrades an unrecognised kind or metric to the shipped one', () => {
    // A function deployed ahead of its migration sees strings it does not know.
    // Degrading beats throwing, which would stop a whole finalization run — the
    // same defensive posture goal-plan.ts took with `kind`.
    const odd = eventRowToEvent({ ...row, kind: 'raid-boss', metric: 'vibes' });
    expect(odd.kind).toBe('battle');
    expect(odd.metric).toBe('active_kcal');
  });
});

describe('planEventCompletions', () => {
  it('pays every participant when the pooled bar is met, contributor or not', () => {
    // Pooled means the strong member carries (deviation #48). Paying only the
    // contributors would rebuild the per-member rule the pivot removed.
    const completions = planEventCompletions({
      localDate: '2026-09-02',
      events: [{ row, roster, rows: pooled('2026-09-02', 3_000) }],
      alreadyCompleted: new Set(),
    });
    expect(completions.map((c) => c.row.user_id).sort()).toEqual(['alice', 'bob']);
  });

  it('grades off the pooled column, which the consent gate never withholds', () => {
    // Every `value` above is null, as it is for a candidate who never
    // consented. Reading that column would pool the fight to zero and complete
    // nothing, silently, forever.
    const completions = planEventCompletions({
      localDate: '2026-09-02',
      events: [{ row, roster, rows: pooled('2026-09-02', 3_000) }],
      alreadyCompleted: new Set(),
    });
    expect(completions).toHaveLength(2);
  });

  it('counts a pooled date once, not once per member', () => {
    // event_progress() repeats the pooled figure on every participant's row.
    // Summing it naively would report this two-person squad at 3,000 and
    // complete an event that is only half done.
    expect(
      planEventCompletions({
        localDate: '2026-09-02',
        events: [{ row, roster, rows: pooled('2026-09-02', 1_500) }],
        alreadyCompleted: new Set(),
      }),
    ).toEqual([]);
  });

  it('pays nothing while the pooled bar is short', () => {
    expect(
      planEventCompletions({
        localDate: '2026-09-02',
        events: [{ row, roster, rows: pooled('2026-09-02', 2_999) }],
        alreadyCompleted: new Set(),
      }),
    ).toEqual([]);
  });

  it('ignores a day outside the window', () => {
    // A day outside the window cannot change the standing, so evaluating it can
    // only produce a wrong answer — and could latch an event on an unrelated
    // day and stamp completed_on with a date that never counted.
    expect(
      planEventCompletions({
        localDate: '2026-09-30',
        events: [{ row, roster, rows: pooled('2026-09-02', 9_000) }],
        alreadyCompleted: new Set(),
      }),
    ).toEqual([]);
  });

  it('skips a participant already paid, so cron overlap pays once', () => {
    const completions = planEventCompletions({
      localDate: '2026-09-02',
      events: [{ row, roster, rows: pooled('2026-09-02', 3_000) }],
      alreadyCompleted: new Set(['e1:alice']),
    });
    expect(completions.map((c) => c.row.user_id)).toEqual(['bob']);
  });

  it('never completes off a provisional day', () => {
    const completions = planEventCompletions({
      localDate: '2026-09-02',
      events: [{ row, roster, rows: pooled('2026-09-02', 9_000, 'provisional') }],
      alreadyCompleted: new Set(),
    });
    expect(completions).toEqual([]);
  });

  it('never completes off a date one member has not finalized yet', () => {
    // A squad spans timezones. The candidate's own day is final and the other
    // member's is not, so the pooled figure for that date is still revisable.
    const mixed = [
      { ...pooled('2026-09-02', 9_000, 'final')[0]!, user_id: 'alice' },
      { ...pooled('2026-09-02', 9_000, 'provisional')[1]!, user_id: 'bob' },
    ];
    expect(
      planEventCompletions({
        localDate: '2026-09-02',
        events: [{ row, roster, rows: mixed }],
        alreadyCompleted: new Set(),
      }),
    ).toEqual([]);
  });

  it('carries the event title, so copy needs no second read', () => {
    const [first] = planEventCompletions({
      localDate: '2026-09-02',
      events: [{ row, roster, rows: pooled('2026-09-02', 3_000) }],
      alreadyCompleted: new Set(),
    });
    expect(first!.title).toBe('The Carabao');
    expect(first!.kind).toBe('battle');
  });

  it('pays the same XP to everyone on the roster', () => {
    // The reward is a property of the commitment, so it cannot differ by how
    // much any one member contributed — that is the per-member rule again.
    const completions = planEventCompletions({
      localDate: '2026-09-02',
      events: [{ row, roster, rows: pooled('2026-09-02', 3_000) }],
      alreadyCompleted: new Set(),
    });
    expect(new Set(completions.map((c) => c.row.xp_awarded)).size).toBe(1);
  });
});

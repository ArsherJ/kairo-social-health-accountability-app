import { describe, expect, it } from 'vitest';
import { pickQuests, questTier } from './core.ts';
import { planQuestCompletions } from './quest-plan.ts';

const userId = 'user-1';
const localDate = '2026-08-25';

/** A day that clears everything, so the tests are about the *rules*. */
const generousDay = {
  steps: 99_000,
  activeKcal: 9_000,
  activeHours: 24,
  distanceM: 99_000,
  sleepMinutes: 600,
};

const emptyDay = {
  steps: 0,
  activeKcal: 0,
  activeHours: 0,
  distanceM: 0,
  sleepMinutes: null,
};

describe('planQuestCompletions', () => {
  it('latches exactly the three quests that day offered, and no others', () => {
    const tier = questTier({ trailingScoredDays: 10 });
    const expected = pickQuests({ userId, localDate, tier, hasSleep: true }).map((q) => q.id);

    const rows = planQuestCompletions({
      userId,
      localDate,
      trailingScoredDays: 10,
      tierOverride: null,
      hasSleep: true,
      day: generousDay,
      alreadyCompleted: new Set(),
    });

    expect(rows.map((r) => r.quest_id).sort()).toEqual([...expected].sort());
  });

  it('grades against the tier the OVERRIDE names, not the automatic one', () => {
    // The override lives on profiles and the handler reads it. Grading against
    // the automatic tier would pay a user for quests they were never shown —
    // the single worst failure this module can have, because a completion
    // latches and the card it belongs to does not exist.
    const rows = planQuestCompletions({
      userId,
      localDate,
      trailingScoredDays: 90,
      tierOverride: 'starter',
      hasSleep: true,
      day: generousDay,
      alreadyCompleted: new Set(),
    });
    const shown = pickQuests({ userId, localDate, tier: 'starter', hasSleep: true }).map((q) => q.id);
    expect(rows.map((r) => r.quest_id).sort()).toEqual([...shown].sort());
    // And demonstrably not the automatic tier's three, or the case above would
    // pass by coincidence on a day the two happened to agree.
    const automatic = pickQuests({ userId, localDate, tier: 'strong', hasSleep: true }).map((q) => q.id);
    expect(rows.map((r) => r.quest_id).sort()).not.toEqual([...automatic].sort());
  });

  it('pays nothing on a day that cleared nothing', () => {
    expect(
      planQuestCompletions({
        userId,
        localDate,
        trailingScoredDays: 10,
        tierOverride: null,
        hasSleep: true,
        day: emptyDay,
        alreadyCompleted: new Set(),
      }),
    ).toEqual([]);
  });

  it('never clears a sleep quest off a night with no reading', () => {
    // `sleepMinutes: null` is an unknown night — no daily_sleep row, or one
    // typed by hand and therefore scored at zero. A fabricated 0 would be
    // merely unclearable; a fabricated *target* would pay for sleep nothing
    // measured.
    const rows = planQuestCompletions({
      userId,
      localDate,
      trailingScoredDays: 10,
      tierOverride: null,
      hasSleep: true,
      day: { ...generousDay, sleepMinutes: null },
      alreadyCompleted: new Set(),
    });
    const shown = pickQuests({ userId, localDate, tier: 'steady', hasSleep: true });
    const sleepIds = shown.filter((q) => q.metric === 'sleep_minutes').map((q) => q.id);
    for (const id of sleepIds) expect(rows.map((r) => r.quest_id)).not.toContain(id);
  });

  it('skips a quest already banked, so a re-run pays once', () => {
    const tier = questTier({ trailingScoredDays: 10 });
    const [first] = pickQuests({ userId, localDate, tier, hasSleep: true });

    const rows = planQuestCompletions({
      userId,
      localDate,
      trailingScoredDays: 10,
      tierOverride: null,
      hasSleep: true,
      day: generousDay,
      alreadyCompleted: new Set([first!.id]),
    });

    expect(rows.map((r) => r.quest_id)).not.toContain(first!.id);
    expect(rows).toHaveLength(2);
  });

  it("carries the quest's own XP, never a figure the handler chose", () => {
    const tier = questTier({ trailingScoredDays: 10 });
    const shown = pickQuests({ userId, localDate, tier, hasSleep: true });
    const rows = planQuestCompletions({
      userId,
      localDate,
      trailingScoredDays: 10,
      tierOverride: null,
      hasSleep: true,
      day: generousDay,
      alreadyCompleted: new Set(),
    });
    for (const row of rows) {
      expect(row.xp_awarded).toBe(shown.find((q) => q.id === row.quest_id)!.xp);
    }
  });

  it('stamps the row with the day being graded, not with any other', () => {
    const rows = planQuestCompletions({
      userId,
      localDate,
      trailingScoredDays: 10,
      tierOverride: null,
      hasSleep: true,
      day: generousDay,
      alreadyCompleted: new Set(),
    });
    for (const row of rows) {
      expect(row.local_date).toBe(localDate);
      expect(row.user_id).toBe(userId);
    }
  });
});

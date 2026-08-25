import { describe, expect, it } from 'vitest';
import {
  QUESTS_PER_DAY,
  QUEST_CATALOGUE,
  pickQuests,
  questMet,
  questProgress,
  questTier,
  type QuestDay,
} from './index.ts';

const day: QuestDay = {
  steps: 0,
  activeKcal: 0,
  activeHours: 0,
  distanceM: 0,
  sleepMinutes: null,
};

describe('QUEST_CATALOGUE', () => {
  it('has enough at every tier that a day is a choice, not a rerun', () => {
    for (const tier of ['starter', 'steady', 'strong'] as const) {
      const forTier = QUEST_CATALOGUE.filter((q) => q.tier === tier);
      expect(forTier.length).toBeGreaterThanOrEqual(QUESTS_PER_DAY * 2);
    }
  });

  it('has unique ids, because an id is what a completion stores', () => {
    const ids = QUEST_CATALOGUE.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pays XP that cannot rival a day of real activity', () => {
    // MAX_REALISTIC_DAILY_XP is 200. Three quests must stay a garnish on the
    // day, not a substitute for it — otherwise the cheapest way to level is to
    // clear three easy bars and stop.
    const dearest = Math.max(...QUEST_CATALOGUE.map((q) => q.xp));
    expect(dearest * QUESTS_PER_DAY).toBeLessThanOrEqual(60);
  });
});

describe('questTier', () => {
  it('starts a new account on the easiest tier', () => {
    expect(questTier({ trailingScoredDays: 0 })).toBe('starter');
    // The day before the boundary, which is the half a `>` / `>=` slip moves.
    expect(questTier({ trailingScoredDays: 6 })).toBe('starter');
  });

  it('moves up with time on the app, not with how far the user walks', () => {
    expect(questTier({ trailingScoredDays: 7 })).toBe('steady');
    expect(questTier({ trailingScoredDays: 28 })).toBe('strong');
  });

  it('lets a manual override win outright', () => {
    // The override exists because the auto rule measures engagement rather
    // than capability, so it is wrong for a long-standing gentle user by
    // construction. A rule that could veto the override would make it a hint.
    expect(questTier({ trailingScoredDays: 90, override: 'starter' })).toBe('starter');
    expect(questTier({ trailingScoredDays: 0, override: 'strong' })).toBe('strong');
  });

  it('treats a NaN count as a new account rather than throwing', () => {
    expect(questTier({ trailingScoredDays: Number.NaN })).toBe('starter');
  });
});

describe('pickQuests', () => {
  it('gives the same account the same three quests all day', () => {
    const a = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady' });
    const b = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady' });
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it('gives a different set tomorrow, which is the whole reset mechanism', () => {
    const today = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady' });
    const tomorrow = pickQuests({ userId: 'u1', localDate: '2026-08-26', tier: 'steady' });
    expect(today.map((q) => q.id)).not.toEqual(tomorrow.map((q) => q.id));
  });

  it('gives two accounts different quests on the same day', () => {
    const one = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady' });
    const two = pickQuests({ userId: 'u2', localDate: '2026-08-25', tier: 'steady' });
    expect(one.map((q) => q.id)).not.toEqual(two.map((q) => q.id));
  });

  it('never repeats a quest inside one day', () => {
    const picked = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'strong' });
    expect(new Set(picked.map((q) => q.id)).size).toBe(QUESTS_PER_DAY);
  });

  it('picks only from the requested tier', () => {
    const picked = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'starter' });
    expect(picked.every((q) => q.tier === 'starter')).toBe(true);
  });

  it('returns exactly three', () => {
    expect(pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady' })).toHaveLength(
      QUESTS_PER_DAY,
    );
  });

  it('terminates and still returns three for every tier and a year of dates', () => {
    // The stride rotation only guarantees distinct slots while the pool size
    // and the stride are co-prime, which is a property of the *catalogue*, not
    // of this function — one hand-edited quest can make a tier's pool
    // composite. An unbounded rotation would then spin forever on a render
    // thread, so the sweep below is the guarantee and this is what pins it.
    for (const tier of ['starter', 'steady', 'strong'] as const) {
      for (let d = 1; d <= 365; d += 1) {
        const date = `2026-${String(Math.floor((d - 1) / 31) + 1).padStart(2, '0')}-${String(
          ((d - 1) % 28) + 1,
        ).padStart(2, '0')}`;
        const picked = pickQuests({ userId: 'u1', localDate: date, tier });
        expect(picked).toHaveLength(QUESTS_PER_DAY);
        expect(new Set(picked.map((q) => q.id)).size).toBe(QUESTS_PER_DAY);
      }
    }
  });
});

describe('questProgress', () => {
  const stepQuest = QUEST_CATALOGUE.find((q) => q.metric === 'steps')!;

  it("measures the day in the quest's own raw unit", () => {
    const state = questProgress(stepQuest, { ...day, steps: stepQuest.target / 2 });
    expect(state.value).toBe(stepQuest.target / 2);
    expect(state.fraction).toBeCloseTo(0.5);
  });

  it('clamps the bar rather than overflowing it', () => {
    const state = questProgress(stepQuest, { ...day, steps: stepQuest.target * 9 });
    expect(state.fraction).toBe(1);
  });

  it('treats a missing sleep row as unknown, never as zero', () => {
    // Null is not zero — the same rule `rawFor` in stat-detail.ts follows. A
    // fabricated 0 would render a sleep quest as "0 of 420 minutes" on a night
    // Kairo simply has no reading for, which reads as an accusation.
    const sleepQuest = QUEST_CATALOGUE.find((q) => q.metric === 'sleep_minutes')!;
    const state = questProgress(sleepQuest, { ...day, sleepMinutes: null });
    expect(state.value).toBeNull();
    expect(state.fraction).toBe(0);
    expect(state.met).toBe(false);
  });
});

describe('questMet', () => {
  const stepQuest = QUEST_CATALOGUE.find((q) => q.metric === 'steps')!;

  it('clears inclusively, at exactly the target', () => {
    expect(questMet(stepQuest, { ...day, steps: stepQuest.target })).toBe(true);
    expect(questMet(stepQuest, { ...day, steps: stepQuest.target - 1 })).toBe(false);
  });
});

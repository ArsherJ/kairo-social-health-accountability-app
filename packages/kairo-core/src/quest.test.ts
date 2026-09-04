import { describe, expect, it } from 'vitest';
import {
  QUESTS_PER_DAY,
  QUEST_CATALOGUE,
  pickQuests,
  questMet,
  questProgress,
  questTier,
  CALIBRATION_WINDOW_DAYS,
  QUEST_TIERS,
  QUEST_TIER_STEP_BANDS,
  calibrateQuestTier,
  calibrationWindow,
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
    const a = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady', hasSleep: true });
    const b = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady', hasSleep: true });
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it('gives a different set tomorrow, which is the whole reset mechanism', () => {
    const today = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady', hasSleep: true });
    const tomorrow = pickQuests({ userId: 'u1', localDate: '2026-08-26', tier: 'steady', hasSleep: true });
    expect(today.map((q) => q.id)).not.toEqual(tomorrow.map((q) => q.id));
  });

  it('gives two accounts different quests on the same day', () => {
    const one = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady', hasSleep: true });
    const two = pickQuests({ userId: 'u2', localDate: '2026-08-25', tier: 'steady', hasSleep: true });
    expect(one.map((q) => q.id)).not.toEqual(two.map((q) => q.id));
  });

  it('never repeats a quest inside one day', () => {
    const picked = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'strong', hasSleep: true });
    expect(new Set(picked.map((q) => q.id)).size).toBe(QUESTS_PER_DAY);
  });

  it('picks only from the requested tier', () => {
    const picked = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'starter', hasSleep: true });
    expect(picked.every((q) => q.tier === 'starter')).toBe(true);
  });

  it('returns exactly three', () => {
    expect(pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady', hasSleep: true })).toHaveLength(
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
        const picked = pickQuests({ userId: 'u1', localDate: date, tier, hasSleep: true });
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

describe('pickQuests — sleep capability', () => {
  const TIERS = ['starter', 'steady', 'strong'] as const;

  // The bug this closes. A phone with no sleep source produces no scoring
  // night, so a `sleep_minutes` bar cannot be met on any day by any behaviour —
  // and `pickQuests` filtered on tier alone, so it dealt them anyway.
  it('never deals a sleep quest to an account with no sleep source', () => {
    for (const tier of TIERS) {
      for (let day = 1; day <= 28; day += 1) {
        const picked = pickQuests({
          userId: 'phone-only',
          localDate: `2026-08-${String(day).padStart(2, '0')}`,
          tier,
          hasSleep: false,
        });
        expect(picked.some((q) => q.metric === 'sleep_minutes')).toBe(false);
      }
    }
  });

  it('still deals three quests without them', () => {
    for (const tier of TIERS) {
      expect(
        pickQuests({ userId: 'phone-only', localDate: '2026-08-25', tier, hasSleep: false }),
      ).toHaveLength(QUESTS_PER_DAY);
    }
  });

  it('deals sleep quests to an account that has a source', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 28; day += 1) {
      for (const quest of pickQuests({
        userId: 'wearable',
        localDate: `2026-08-${String(day).padStart(2, '0')}`,
        tier: 'steady',
        hasSleep: true,
      })) {
        seen.add(quest.metric);
      }
    }
    expect(seen.has('sleep_minutes')).toBe(true);
  });

  // The two sides must agree, or a completion latches against a quest that was
  // never on screen. This is the assertion that says the parameter changes the
  // draw, so a mismatch cannot be harmless.
  it('deals a different three when capability differs', () => {
    const withSleep = pickQuests({
      userId: 'u1', localDate: '2026-08-25', tier: 'steady', hasSleep: true,
    });
    const without = pickQuests({
      userId: 'u1', localDate: '2026-08-25', tier: 'steady', hasSleep: false,
    });
    expect(withSleep.map((q) => q.id)).not.toEqual(without.map((q) => q.id));
  });

  it('is still deterministic for one account, date and capability', () => {
    const a = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady', hasSleep: false });
    const b = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady', hasSleep: false });
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });
});

describe('calibration bands', () => {
  it('takes each tier\'s entry bar from the catalogue', () => {
    for (const tier of QUEST_TIERS) {
      const stepTargets = QUEST_CATALOGUE.filter(
        (q) => q.tier === tier && q.metric === 'steps',
      ).map((q) => q.target);
      expect(QUEST_TIER_STEP_BANDS[tier]).toBe(Math.min(...stepTargets));
    }
  });

  /*
    Pinned as well as derived, and both halves matter — the same arrangement
    `DAILY_STEP_BASELINE` has. The derivation stops a catalogue edit leaving a
    second number describing the old bars; the literals stop the derivation
    being *too* obedient, since moving a band silently re-sorts every new
    account into a different starting tier. Move a target and a human decides.
  */
  it('pins them as literals so a catalogue edit fails rather than re-sorts', () => {
    expect(QUEST_TIER_STEP_BANDS).toEqual({
      starter: 3_000,
      steady: 7_000,
      strong: 12_000,
    });
  });

  it('rises with the tier, so the highest cleared bar is the highest tier', () => {
    expect(QUEST_TIER_STEP_BANDS.starter).toBeLessThan(QUEST_TIER_STEP_BANDS.steady);
    expect(QUEST_TIER_STEP_BANDS.steady).toBeLessThan(QUEST_TIER_STEP_BANDS.strong);
  });
});

describe('calibrationWindow', () => {
  it('covers fourteen complete days ending at the day it is given', () => {
    const window = calibrationWindow('2026-09-03');
    expect(window).toHaveLength(CALIBRATION_WINDOW_DAYS);
    expect(window.at(-1)).toBe('2026-09-03');
    expect(window[0]).toBe('2026-08-21');
  });

  it('is ascending and has no gaps or repeats', () => {
    const window = calibrationWindow('2026-01-05');
    expect(new Set(window).size).toBe(window.length);
    expect([...window].sort()).toEqual(window);
    expect(window[0]).toBe('2025-12-23');
  });
});

describe('calibrateQuestTier', () => {
  const days = (...steps: number[]) => steps;

  it('proposes the highest tier whose entry bar the median clears', () => {
    expect(calibrateQuestTier(days(7_000, 7_200, 6_800, 7_100))).toEqual({
      outcome: 'proposed',
      tier: 'steady',
      medianSteps: 7_050,
    });
  });

  it('proposes Strong only once the median clears the strong bar', () => {
    expect(calibrateQuestTier(days(12_000, 13_000, 11_000, 14_000))).toMatchObject({
      tier: 'strong',
    });
    expect(calibrateQuestTier(days(11_000, 11_500, 10_000, 11_900))).toMatchObject({
      tier: 'steady',
    });
  });

  /*
    Nothing is gentler than Starter, so a genuinely quiet fortnight is a
    proposal rather than an absence — it was measured, and the measurement said
    "small". `no-history` means the opposite: we could not measure.
  */
  it('floors at Starter rather than refusing a quiet fortnight', () => {
    expect(calibrateQuestTier(days(400, 900, 1_200, 700))).toEqual({
      outcome: 'proposed',
      tier: 'starter',
      medianSteps: 800,
    });
  });

  it('takes the median, never the mean, so one hike promotes nobody', () => {
    // Mean is 8,825 — Steady. Median is 2,100 — Starter.
    expect(calibrateQuestTier(days(1_800, 2_000, 2_200, 30_300))).toMatchObject({
      tier: 'starter',
      medianSteps: 2_100,
    });
  });

  it('drops zero days rather than counting them', () => {
    // Four real days at Steady, ten days the phone spent in a drawer.
    const withZeroes = days(7_000, 7_200, 6_800, 7_100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    expect(calibrateQuestTier(withZeroes)).toMatchObject({ tier: 'steady' });
  });

  it('reads a fortnight of zeroes as no-history, not as the lowest tier', () => {
    expect(calibrateQuestTier(new Array(14).fill(0))).toEqual({ outcome: 'no-history' });
  });

  it('needs four qualifying days however high they are', () => {
    expect(calibrateQuestTier(days(20_000, 20_000, 20_000))).toEqual({
      outcome: 'no-history',
    });
    expect(calibrateQuestTier(days(20_000, 20_000, 20_000, 20_000))).toMatchObject({
      outcome: 'proposed',
    });
  });

  it('ignores a reading that is not a finite number', () => {
    expect(calibrateQuestTier([NaN, 7_000, 7_000, 7_000, 7_000])).toMatchObject({
      tier: 'steady',
      medianSteps: 7_000,
    });
    expect(calibrateQuestTier([NaN, NaN, NaN, 7_000])).toEqual({ outcome: 'no-history' });
  });

  it('takes an empty window as no-history', () => {
    expect(calibrateQuestTier([])).toEqual({ outcome: 'no-history' });
  });
});

describe('a calibrated tier is a seed, not a standing rule', () => {
  /*
    The whole point of #63: the proposal is written once into
    `quest_tier_override`, and `questTier` then returns it forever regardless
    of what the account goes on to do. Nothing re-reads the fortnight, so the
    bar cannot rise as the player improves — which is the property that made a
    trailing median wrong as a standing rule and right as a one-shot seed.
  */
  it('wins outright over the trailing-scored-days rule, at any day count', () => {
    const seeded = calibrateQuestTier([7_000, 7_000, 7_000, 7_000]);
    expect(seeded.outcome).toBe('proposed');
    if (seeded.outcome !== 'proposed') return;

    for (const trailingScoredDays of [0, 6, 7, 27, 28, 400]) {
      expect(questTier({ trailingScoredDays, override: seeded.tier })).toBe(seeded.tier);
    }
  });

  it('leaves the automatic rule in place for an account that was never seeded', () => {
    expect(questTier({ trailingScoredDays: 0, override: null })).toBe('starter');
    expect(questTier({ trailingScoredDays: 7, override: null })).toBe('steady');
    expect(questTier({ trailingScoredDays: 28, override: null })).toBe('strong');
  });
});

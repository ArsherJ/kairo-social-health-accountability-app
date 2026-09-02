import { describe, expect, it } from 'vitest';
import { DAILY_STEP_BASELINE } from '@kairo/core';
import { walkNote } from '../train/daily-walk.ts';
import { todayDetails } from './today-details.ts';

const WALK_BODY = walkNote({
  todaySteps: 4_321, baseline: DAILY_STEP_BASELINE, fraction: 0.43,
  remaining: DAILY_STEP_BASELINE - 4_321, met: false, streak: 4,
});

const base = {
  totals: { steps: 4_321, distanceM: 3_250, activeKcal: 245, activeMinutes: 30, activeHours: 3 },
  verifiedStrengthMinutes: 45,
  hasSleepSource: true,
  sleepMinutes: 450,
  dailyWalkRun: 4,
  dailyWalkNote: WALK_BODY,
  motionNote: null,
  quests: [],
  selectedQuestIndex: null,
};

describe('todayDetails', () => {
  it('separates personal Streak from the Daily Walk run and uses raw units', () => {
    const sections = todayDetails(base);
    expect(sections.find((section) => section.id === 'motion')?.rows.map((row) => row.value))
      .toEqual(['4,321 steps', '3.3 km', '4 days', WALK_BODY]);
    expect(JSON.stringify(sections)).not.toContain('Streak');
  });

  it('keeps one sentence explaining what the Daily Walk is', () => {
    // Deleting `DailyWalkCard` otherwise removes the only place in the running
    // app that says the baseline is fixed. The sentence is reused, not rewritten.
    const walk = todayDetails(base).find((s) => s.id === 'motion')?.rows.at(-1);
    expect(walk?.value).toBe(WALK_BODY);
    expect(walk?.value).toContain(DAILY_STEP_BASELINE.toLocaleString());
  });

  it('shows verified strength minutes only when positive', () => {
    expect(JSON.stringify(todayDetails(base))).toContain('45 min');
    expect(JSON.stringify(todayDetails({ ...base, verifiedStrengthMinutes: 0 }))).not.toContain('Strength session');
  });

  it('removes Mind completely without capability or a verified reading', () => {
    for (const patch of [{ hasSleepSource: false }, { sleepMinutes: null }]) {
      expect(todayDetails({ ...base, ...patch }).some((section) => section.id === 'mind')).toBe(false);
    }
  });

  it('shows a Motion explanation only when the scoring shift is relevant', () => {
    expect(JSON.stringify(todayDetails({ ...base, motionNote: 'Motion eased after three active hours.' })))
      .toContain('Motion eased after three active hours.');
    expect(JSON.stringify(todayDetails(base))).not.toContain("Today's Motion");
  });

  it('never emits score totals, tiers, XP, or engine keys', () => {
    const json = JSON.stringify(todayDetails(base));
    expect(json).not.toMatch(/bronze|silver|gold|\bXP\b|score total/i);
    // Case-sensitive and word-bounded. A loose `/str/i` matches the "Verified
    // strength session" row the test above requires, and `/agi/i` matches
    // "Dagit" — a guard that fails on real input gets loosened until it guards
    // nothing.
    expect(json).not.toMatch(/\b(AGI|STR|MND)\b/);
  });
});

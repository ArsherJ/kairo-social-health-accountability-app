import { describe, expect, it } from 'vitest';
import type { QuestDef, QuestState } from '@kairo/core';
import { bodyReading, dateHeading, mindReading, motionReading } from './today-board.ts';

const kcalQuest: QuestDef = {
  id: 'steady-kcal-300',
  tier: 'steady',
  metric: 'active_kcal',
  target: 300,
  xp: 15,
};
const sleepQuest: QuestDef = {
  id: 'steady-sleep-420',
  tier: 'steady',
  metric: 'sleep_minutes',
  target: 420,
  xp: 15,
};
const open = (value: number | null, target: number): QuestState => ({
  value,
  fraction: value === null ? 0 : Math.min(1, value / target),
  met: false,
});
const met = (value: number): QuestState => ({ value, fraction: 1, met: true });

const ENGINE_KEY = /\b(AGI|STR|MND)\b/;

describe('dateHeading', () => {
  it('names the weekday, day and month of the local date, never the device date', () => {
    expect(dateHeading('2026-09-10')).toBe('Thursday 10 September');
    expect(dateHeading('not-a-date')).toBe('');
  });
});

describe('the Motion tile', () => {
  it('speaks the remaining steps through the walk, never as a literal', () => {
    const tile = motionReading({
      steps: 3086,
      locationName: 'Treeline',
      walk: { remaining: 6914, fraction: 0.3086, met: false },
    });
    expect(tile.figure).toBe('3,086');
    expect(tile.caption).toBe('6,914 to the ridge');
    expect(tile.fraction).toBeCloseTo(0.3086);
    expect(tile.label).toContain('3,086 steps');
    expect(tile.eyebrow).toBe('Motion · Treeline');
  });

  it('names the arrival once the walk is cleared', () => {
    const tile = motionReading({
      steps: 12_400,
      locationName: 'Ridge',
      walk: { remaining: 0, fraction: 1, met: true },
    });
    expect(tile.caption).toMatch(/Ridge reached/);
    expect(tile.fraction).toBe(1);
  });

  it('carries no target while the walk history is in flight', () => {
    const tile = motionReading({ steps: 10, locationName: 'Branch', walk: null });
    expect(tile.caption).toBeNull();
    expect(tile.fraction).toBeNull();
  });
});

describe('the Body tile', () => {
  it('rounds the float HealthKit reports and reads the Body quest as its target', () => {
    const tile = bodyReading({
      activeKcal: 82.4,
      quest: { def: kcalQuest, state: open(82.4, 300) },
      verifiedStrengthMinutes: 0,
    });
    expect(tile.figure).toBe('82');
    expect(tile.caption).toBe('of 300 kcal today');
    expect(tile.fraction).toBeCloseTo(82.4 / 300);
  });

  it('appends verified strength minutes, and stands alone without a quest', () => {
    const withQuest = bodyReading({
      activeKcal: 340,
      quest: { def: kcalQuest, state: met(340) },
      verifiedStrengthMinutes: 25,
    });
    expect(withQuest.caption).toBe('Cleared 300 kcal · 25 min verified strength');

    const alone = bodyReading({ activeKcal: 12, quest: null, verifiedStrengthMinutes: 25 });
    expect(alone.caption).toBe('25 min verified strength');
    expect(alone.fraction).toBeNull();
  });
});

describe('the Mind tile', () => {
  it('never prints zero for a night it cannot see', () => {
    expect(mindReading({ hasSleepSource: true, sleepMinutes: null, quest: null }).figure).toBe('—');
    expect(mindReading({ hasSleepSource: true, sleepMinutes: null, quest: null }).caption).toBe(
      'No reading yet',
    );
    expect(mindReading({ hasSleepSource: false, sleepMinutes: 400, quest: null }).caption).toBe(
      'Needs a sleep source',
    );
  });

  it('reads the night in hours and minutes against the sleep quest', () => {
    const tile = mindReading({
      hasSleepSource: true,
      sleepMinutes: 322,
      quest: { def: sleepQuest, state: open(322, 420) },
    });
    expect(tile.figure).toBe('5h 22m');
    expect(tile.caption).toBe('of 7 hours');
    expect(tile.fraction).toBeCloseTo(322 / 420);
  });
});

describe('every tile', () => {
  it('names no engine key and no score total', () => {
    const tiles = [
      motionReading({ steps: 1, locationName: 'Branch', walk: { remaining: 9, fraction: 0.1, met: false } }),
      bodyReading({ activeKcal: 1, quest: { def: kcalQuest, state: open(1, 300) }, verifiedStrengthMinutes: 3 }),
      mindReading({ hasSleepSource: true, sleepMinutes: 400, quest: { def: sleepQuest, state: open(400, 420) } }),
    ];
    for (const tile of tiles) {
      for (const text of [tile.eyebrow, tile.figure, tile.caption ?? '', tile.label]) {
        expect(text).not.toMatch(ENGINE_KEY);
        expect(text).not.toMatch(/\bpoints?\b|\bscore\b/i);
      }
    }
  });
});

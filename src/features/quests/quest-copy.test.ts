import { describe, expect, it } from 'vitest';
import type { QuestDef, QuestState } from '@kairo/core';
import {
  countWords,
  distanceWords,
  durationWords,
  questHeadline,
  questLabel,
  questProgressLine,
} from './quest-copy.ts';

const steps: QuestDef = {
  id: 'steady-steps-7000',
  tier: 'steady',
  metric: 'steps',
  target: 7_000,
  xp: 15,
};
const sleep: QuestDef = {
  id: 'steady-sleep-420',
  tier: 'steady',
  metric: 'sleep_minutes',
  target: 420,
  xp: 15,
};
const state = (over: Partial<QuestState> = {}): QuestState => ({
  value: 0,
  fraction: 0,
  met: false,
  ...over,
});

describe('questHeadline', () => {
  it('names the thing to do, in the unit it is done in', () => {
    expect(questHeadline(steps)).toBe('Walk 7,000 steps');
  });

  it('says hours and minutes as words a person uses', () => {
    expect(questHeadline(sleep)).toBe('Sleep 7 hours');
    expect(questHeadline({ ...sleep, target: 450 })).toBe('Sleep 7h 30m');
  });

  it('says distance in kilometres, not metres', () => {
    expect(questHeadline({ ...steps, metric: 'distance_m', target: 5_000 })).toBe(
      'Cover 5 km',
    );
  });
});

describe('questProgressLine', () => {
  it('counts up to the bar', () => {
    expect(questProgressLine(steps, state({ value: 4_210, fraction: 0.6 }))).toBe(
      '4,210 of 7,000',
    );
  });

  it('says cleared once the bar is met, rather than a ratio past it', () => {
    expect(questProgressLine(steps, state({ value: 9_000, fraction: 1, met: true }))).toBe(
      'Cleared',
    );
  });

  it('says nothing has arrived rather than printing a zero it did not measure', () => {
    // A null value is an unknown night, not a bad one — see QuestDay.
    expect(questProgressLine(sleep, state({ value: null }))).toBe('No reading yet');
  });
});

describe('questLabel', () => {
  it('is one utterance: what, how far, what it pays', () => {
    expect(questLabel(steps, state({ value: 4_210, fraction: 0.6 }))).toBe(
      'Walk 7,000 steps. 4,210 of 7,000. 15 XP.',
    );
  });

  it('leads with the outcome once cleared', () => {
    expect(questLabel(steps, state({ value: 9_000, fraction: 1, met: true }))).toBe(
      'Walk 7,000 steps. Cleared. 15 XP.',
    );
  });
});

// Exported for Today's details sheet (deviation #59), which reports the same
// raw units. Pinned here so the two surfaces cannot render one figure two ways.
describe('raw-unit formatters', () => {
  it('says distances and durations the way a person does', () => {
    expect(distanceWords(5_000)).toBe('5 km');
    expect(distanceWords(7_500)).toBe('7.5 km');
    expect(durationWords(420)).toBe('7 hours');
    expect(durationWords(450)).toBe('7h 30m');
  });
});

describe('counted figures', () => {
  // HealthKit reports active energy as a float, and a sum across sources can
  // make steps one too. The raw `toLocaleString()` this replaced printed
  // "4.34 of 400" on the details sheet while the Body row one section above it
  // said "4 kcal" — one reading, rendered two ways, a scroll apart.
  it('rounds, so a float reading never reaches a surface', () => {
    expect(countWords(4.34)).toBe('4');
    expect(countWords(395.66)).toBe('396');
    expect(countWords(9_999.5)).toBe('10,000');
  });

  it('never prints a decimal point in a progress line', () => {
    const kcal: QuestDef = { ...steps, metric: 'active_kcal', target: 400 };
    expect(questProgressLine(kcal, state({ value: 4.34 }))).toBe('4 of 400');
    expect(questProgressLine(steps, state({ value: 37.2 }))).toBe('37 of 7,000');
  });
});

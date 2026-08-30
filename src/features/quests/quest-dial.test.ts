import { describe, expect, it } from 'vitest';
import type { QuestDef, QuestState } from '@kairo/core';
import { compactFigure, questDial, questUnit } from './quest-dial.ts';

const quest = (over: Partial<QuestDef> = {}): QuestDef => ({
  id: 'steady-steps-9000',
  tier: 'steady',
  metric: 'steps',
  target: 9000,
  xp: 30,
  ...over,
});

const state = (over: Partial<QuestState> = {}): QuestState => ({
  value: 8412,
  fraction: 0.93,
  met: false,
  ...over,
});

describe('compactFigure', () => {
  it('collapses thousands to one decimal', () => {
    expect(compactFigure(8412)).toBe('8.4k');
    // 1.2k, not 1.3k — see the truncation case below.
    expect(compactFigure(1250)).toBe('1.2k');
  });

  it('drops a trailing .0 rather than printing "9.0k"', () => {
    expect(compactFigure(9000)).toBe('9k');
    expect(compactFigure(14000)).toBe('14k');
  });

  it('drops the decimal entirely at and above 10k', () => {
    // "12.4k" is a wide string for a 60pt disc, and the extra digit stops
    // mattering once the figure is five characters across.
    expect(compactFigure(12400)).toBe('12k');
    expect(compactFigure(18420)).toBe('18k');
  });

  it('prints small numbers whole — "840" beats "0.8k" on both counts', () => {
    // The small-target quests live entirely down here: active hours, a starter
    // calorie bar, a sleep minute count.
    expect(compactFigure(840)).toBe('840');
    expect(compactFigure(6)).toBe('6');
    expect(compactFigure(0)).toBe('0');
  });

  it('truncates rather than rounds, so a bar never reads as met early', () => {
    // 8,999 against a 9,000 bar must not print "9k" beside a ring that is
    // visibly short of full. This is the last hundred steps of a quest, which
    // is exactly when somebody is watching the number.
    expect(compactFigure(8999)).toBe('8.9k');
    expect(compactFigure(12999)).toBe('12k');
    expect(compactFigure(999)).toBe('999');
  });

  it('is inert on a bad number rather than printing NaN', () => {
    expect(compactFigure(Number.NaN)).toBe('0');
    expect(compactFigure(-5)).toBe('0');
    expect(compactFigure(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

describe('questUnit', () => {
  it('gives steps no unit — the glyph and the magnitude already say it', () => {
    expect(questUnit('steps')).toBe('');
  });

  it('is total over the metrics, so no caption can read "undefined"', () => {
    for (const metric of [
      'steps',
      'active_kcal',
      'active_hours',
      'distance_m',
      'sleep_minutes',
    ] as const) {
      expect(typeof questUnit(metric)).toBe('string');
    }
  });
});

describe('questDial', () => {
  it('reads the figure so far against a compact target', () => {
    expect(questDial(quest(), state())).toEqual({
      figure: '8.4k',
      caption: 'of 9k',
      fraction: 0.93,
      cleared: false,
    });
  });

  it('appends the unit where there is one', () => {
    const d = questDial(
      quest({ metric: 'active_hours', target: 8 }),
      state({ value: 6, fraction: 0.75 }),
    );
    expect(d.caption).toBe('of 8 hrs');
    expect(d.figure).toBe('6');
  });

  it('prints no figure once cleared — the tick is the readout', () => {
    // Restating "9k of 9k" beside a check mark is exactly the readout the
    // rings replace.
    const d = questDial(quest(), state({ met: true, fraction: 1 }));
    expect(d).toEqual({ figure: '', caption: 'cleared', fraction: 1, cleared: true });
  });

  it('fills the arc on a cleared quest even if the fraction lags', () => {
    // `met` is the engine's answer; a fraction that has not caught up must not
    // leave a gap in a ring the app is calling cleared.
    expect(questDial(quest(), state({ met: true, fraction: 0.4 })).fraction).toBe(1);
  });

  it('prints an em dash for a metric with no reading, never a zero', () => {
    // The `kairo-voice.ts` rule, one surface over: a null night is unmeasured,
    // and a "0" accuses the player of having slept none.
    const d = questDial(
      quest({ metric: 'sleep_minutes', target: 420 }),
      state({ value: null, fraction: 0, met: false }),
    );
    expect(d.figure).toBe('—');
    expect(d.caption).toBe('of 420 min');
  });

  it('prints a real zero for a metric that read zero', () => {
    // The other side of the same distinction — a day with no steps yet has a
    // reading, and it is 0.
    expect(questDial(quest(), state({ value: 0, fraction: 0 })).figure).toBe('0');
  });
});

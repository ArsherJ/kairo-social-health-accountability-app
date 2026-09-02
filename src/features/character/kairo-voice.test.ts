import { describe, expect, it } from 'vitest';
import { ceilingLine, spreadLine } from './kairo-voice.ts';

const AEON = 'Aeon';

/**
 * `heroSentence`, `sleepLine` and `laneLine` were tested here until deviation
 * #59 retired all three with Today's dashboard. Their cases did not vanish: the
 * ridge line moved to `living-reaction.test.ts` with the sentence itself, and
 * the "no score total" rule below still covers everything this module says.
 */
describe('the voice never says a number the surface does not show', () => {
  it('prints no score total anywhere', () => {
    // Deviation #34 is still in force: daily_scores.total ranks the board and
    // feeds XP, and no ambient surface prints it. The bird speaks in raw units
    // — steps, hours — and in nothing else.
    const all = [
      spreadLine({ activeHours: 8, goldSteps: 7_500, baseSteps: 10_000 }) ?? '',
      ceilingLine(AEON),
    ].join(' ');

    expect(all).not.toMatch(/points?|score|pts/i);
  });
});

describe('spreadLine', () => {
  const base = { activeHours: 8, goldSteps: 7_500, baseSteps: 10_000 };

  it('names the day it saw and what that did to the bar', () => {
    expect(spreadLine(base)).toBe(
      'Movement in eight hours so far — Motion tops out 2,500 steps sooner today.',
    );
  });

  // A line that says "you earned nothing" on a quiet morning is a reprimand on
  // the screen someone opens first.
  it('says nothing when the day has earned no shift', () => {
    expect(spreadLine({ ...base, goldSteps: 10_000 })).toBeNull();
    expect(spreadLine({ ...base, activeHours: 0, goldSteps: 10_000 })).toBeNull();
  });

  it('says nothing before the day has started', () => {
    expect(spreadLine({ ...base, activeHours: 0 })).toBeNull();
  });

  it('agrees with itself about singular hours', () => {
    expect(spreadLine({ ...base, activeHours: 1, goldSteps: 9_500 })).toContain('one hour so far');
  });

  // "Ridge" is the race's finish line and the Daily Walk is that same flat
  // figure, deliberately unshifted. A shifted number wearing either noun would
  // put two values behind one word on one screen.
  it('never calls the shifted band a ridge or a target', () => {
    expect(spreadLine(base)).not.toMatch(/ridge|target|goal/i);
  });

  // The rule the whole voice module is tested against: real units only, never a
  // score total and never an engine key.
  it('speaks steps, never a score or an engine key', () => {
    const line = spreadLine(base)!;
    expect(line).not.toMatch(/\b(AGI|STR|MND)\b/);
    expect(line).not.toMatch(/points?|score/i);
    expect(line).toContain('steps');
  });
});

describe('ceilingLine', () => {
  it('speaks in the bird\'s name', () => {
    expect(ceilingLine('Dagit')).toContain('Dagit');
  });

  // The one line in this module with no figure in it, and deliberately: the
  // ceiling is a score total, and a score total is exactly what no ambient
  // surface may print.
  // Engine keys are matched **case-sensitively and on word boundaries**. A
  // loose /agi/i finds "Dagit", which is a perfectly good name for a Philippine
  // eagle — a guard that fails on real input gets loosened until it guards
  // nothing.
  it('names no score, no total and no engine key', () => {
    const line = ceilingLine('Dagit');
    expect(line).not.toMatch(/\b(AGI|STR|MND)\b/);
    expect(line).not.toMatch(/points?|score|4,?400/i);
  });
});

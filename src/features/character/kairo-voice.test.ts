import { describe, expect, it } from 'vitest';
import { ceilingLine, restedLine, spreadLine } from './kairo-voice.ts';

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
      restedLine({ sleepMinutes: 480, goldKcal: 350, baseKcal: 400 }) ?? '',
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


describe('restedLine', () => {
  // Eight hours is the peak of the ramp, so Body's 400 kcal band sits at 350.
  const base = { sleepMinutes: 480, goldKcal: 350, baseKcal: 400 };

  it('names the night it saw and what that did to the bar', () => {
    expect(restedLine(base)).toBe('Slept 8 hours — Body tops out 50 kcal sooner today.');
  });

  // Wearable-gated, and the gate is the value itself: a phone-only account has
  // no night, so it has no shift and meets no sentence. One condition, not two.
  it('says nothing when there is no night to read', () => {
    expect(restedLine({ ...base, sleepMinutes: null })).toBeNull();
    expect(restedLine({ ...base, sleepMinutes: 0 })).toBeNull();
  });

  // "Your sleep earned you nothing" is a reprimand, exactly as it is on the
  // spread line. A short night gets silence, not a verdict.
  it('says nothing when the night earned no shift', () => {
    expect(restedLine({ ...base, sleepMinutes: 360, goldKcal: 400 })).toBeNull();
  });

  it('reads a partial night in the same words the details sheet does', () => {
    expect(restedLine({ ...base, sleepMinutes: 450 })).toContain('Slept 7h 30m');
  });

  // The rule the whole voice module is tested against, and the ticket's own
  // acceptance criterion: real units only, never a score total, never an
  // engine key. Matched case-sensitively and on word boundaries — a loose
  // /str/i finds "Slept" and a guard that fails on real input gets loosened
  // until it guards nothing.
  it('speaks calories, never a score or an engine key', () => {
    const line = restedLine(base)!;
    expect(line).not.toMatch(/\b(AGI|STR|MND)\b/);
    expect(line).not.toMatch(/points?|score|total|XP/i);
    expect(line).toContain('kcal');
  });

  // Same reason `spreadLine` refuses these words: they already name flat,
  // published figures elsewhere in the app, and a shifted number wearing one
  // of them puts two values behind one noun.
  it('never calls the shifted band a ridge or a target', () => {
    expect(restedLine(base)).not.toMatch(/ridge|target|goal/i);
  });

  it('says it in the observation, em dash, consequence form', () => {
    expect(restedLine(base)).toMatch(/^Slept .+ — .+ sooner today\.$/);
  });
});

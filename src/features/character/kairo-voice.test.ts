import { describe, expect, it } from 'vitest';
import { heroSentence, laneLine, sleepLine,
  spreadLine,
  ceilingLine,
} from './kairo-voice.ts';

const AEON = 'Aeon';

describe('heroSentence', () => {
  it('says nothing has happened yet, without accusing anyone', () => {
    // A day with no steps in it is usually a phone on a table, not a person who
    // did nothing. The bird is waiting; the reader is not being told off.
    expect(heroSentence({ characterName: AEON, progress: 0, rival: null })).toBe(
      'Aeon has not left the branch yet.',
    );
  });

  it('climbs through four bands as the day fills', () => {
    const at = (progress: number) =>
      heroSentence({ characterName: AEON, progress, rival: null });

    expect(at(0.2)).toBe('Aeon is stretching its wings.');
    expect(at(0.5)).toBe('Enough to lift Aeon over the treeline.');
    expect(at(0.9)).toBe('Aeon has the whole valley under it.');
    expect(at(1)).toBe('Aeon cleared the ridge. The day is done.');
  });

  it('names the gap to the bird directly ahead', () => {
    // The design's line, and the reason the race card leaves the Today tab:
    // the sentence carries the race, and the Sky tab carries the picture.
    expect(
      heroSentence({
        characterName: AEON,
        progress: 0.48,
        rival: { name: 'Ramon', stepsAhead: 1240 },
      }),
    ).toBe("Enough to lift Aeon over the treeline. Ramon's is still 1,240 ahead of you.");
  });

  it('says level rather than a gap of zero', () => {
    expect(
      heroSentence({
        characterName: AEON,
        progress: 0.48,
        rival: { name: 'Ramon', stepsAhead: 0 },
      }),
    ).toBe('Enough to lift Aeon over the treeline. You are level with Ramon.');
  });

  it('drops the rival clause once the day is done', () => {
    // Past the flag the gap stops meaning anything — `cappedSteps` stops at
    // the line, so extra steps buy nothing and a gap would imply they do.
    expect(
      heroSentence({
        characterName: AEON,
        progress: 1,
        rival: { name: 'Ramon', stepsAhead: 900 },
      }),
    ).toBe('Aeon cleared the ridge. The day is done.');
  });

  it('clamps a progress value from outside 0 to 1', () => {
    expect(heroSentence({ characterName: AEON, progress: 4, rival: null })).toBe(
      'Aeon cleared the ridge. The day is done.',
    );
    expect(heroSentence({ characterName: AEON, progress: -1, rival: null })).toBe(
      'Aeon has not left the branch yet.',
    );
  });
});

describe('sleepLine', () => {
  it('says there is no reading rather than inventing a bad night', () => {
    // null is not zero. A hand-typed night scores no Mind at all, and
    // `finalize-days` grades by the same rule — a card claiming someone did
    // not sleep is the accusation this branch exists to avoid.
    expect(sleepLine({ characterName: AEON, sleepMinutes: null })).toEqual({
      eyebrow: 'Aeon is waiting on last night',
      body: 'No reading yet.',
    });
  });

  it('reads a full night as hours and minutes, in the bird’s voice', () => {
    expect(sleepLine({ characterName: AEON, sleepMinutes: 440 })).toEqual({
      eyebrow: 'Aeon slept when you did',
      body: 'Seven hours twenty. It has energy to burn all afternoon.',
    });
  });

  it('reads a short night without scolding', () => {
    expect(sleepLine({ characterName: AEON, sleepMinutes: 250 })).toEqual({
      eyebrow: 'Aeon slept when you did',
      body: 'Four hours ten. It will be gliding more than flapping today.',
    });
  });

  it('says a whole number of hours without a stray zero', () => {
    expect(sleepLine({ characterName: AEON, sleepMinutes: 420 }).body).toBe(
      'Seven hours. It has energy to burn all afternoon.',
    );
  });
});

describe('laneLine', () => {
  it('is silent when no lane has emerged', () => {
    // Naming a build for someone who has done nothing cheapens the one visual
    // §6 says must be earned. Silence, not a guess.
    expect(laneLine({ characterName: AEON, lane: null })).toBeNull();
  });

  it('names the lane in the player’s vocabulary, never the engine key', () => {
    const line = laneLine({ characterName: AEON, lane: 'AGI' });
    expect(line).toEqual({
      eyebrow: 'Your lane · Motion',
      body: "One more loop of the block and Aeon's Motion tops out for the day.",
    });
    // The rule, stated so it cannot regress by editing the string above.
    expect(JSON.stringify(line)).not.toMatch(/AGI|STR|MND/);
  });

  it('has a line for each of the three lanes', () => {
    expect(laneLine({ characterName: AEON, lane: 'STR' })?.eyebrow).toBe('Your lane · Body');
    expect(laneLine({ characterName: AEON, lane: 'MND' })?.eyebrow).toBe('Your lane · Mind');
  });
});

describe('the voice never says a number the surface does not show', () => {
  it('prints no score total anywhere', () => {
    // Deviation #34 is still in force: daily_scores.total ranks the board and
    // feeds XP, and no ambient surface prints it. The bird speaks in raw units
    // — steps, hours — and in nothing else.
    const all = [
      heroSentence({ characterName: AEON, progress: 0.5, rival: { name: 'R', stepsAhead: 12 } }),
      sleepLine({ characterName: AEON, sleepMinutes: 440 }).body,
      laneLine({ characterName: AEON, lane: 'AGI' })?.body ?? '',
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

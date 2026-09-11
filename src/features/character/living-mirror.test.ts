import { describe, expect, it } from 'vitest';
import { DAILY_STEP_BASELINE } from '@kairo/core';
import {
  MOTION_LOCATIONS,
  livingCharacterLabel,
  locationName,
  motionLocationForSteps,
  dayPose,
  resolveLivingMirror,
  staticFigureSelection,
  type LivingReaction,
} from './living-mirror.ts';

describe('motionLocationForSteps', () => {
  const at = (fraction: number) => Math.ceil(DAILY_STEP_BASELINE * fraction);
  it.each([
    [0, 'branch'],
    [at(0.25) - 1, 'branch'],
    [at(0.25), 'treeline'],
    [at(0.5), 'valley'],
    [at(0.75), 'climb'],
    [DAILY_STEP_BASELINE - 1, 'climb'],
    [DAILY_STEP_BASELINE, 'ridge'],
    [DAILY_STEP_BASELINE * 2, 'ridge'],
  ] as const)('maps %s steps to %s', (steps, location) => {
    expect(motionLocationForSteps(steps)).toBe(location);
  });

  // "Ridge" is the finish everywhere else in the app — `RACE_FINISH_LINE`, the
  // Sky tab's `10k · ridge` marker, the trivia card, and `kairo-voice.ts`'s
  // "cleared the ridge". The top band must be that same threshold and no other.
  it('reaches the ridge at exactly the Daily Walk baseline', () => {
    expect(motionLocationForSteps(DAILY_STEP_BASELINE)).toBe('ridge');
    expect(motionLocationForSteps(DAILY_STEP_BASELINE - 1)).not.toBe('ridge');
  });

  it('uses a neutral fallback for invalid input', () => {
    expect(motionLocationForSteps(Number.NaN)).toBe('branch');
    expect(motionLocationForSteps(-1)).toBe('branch');
  });
});

describe('staticFigureSelection', () => {
  const reaction: LivingReaction = {
    kind: 'level', occurrence: 'level:2->3', pose: 'race_victory', animation: 'level_up',
    sentence: 'Level 3.', priority: 50,
  };

  it('uses reaction, non-neutral Mind, Motion, then base priority', () => {
    expect(staticFigureSelection({ reaction, mind: { visible: true, state: 'sleepy' }, motionPose: 'walk' }))
      .toEqual({ kind: 'pose', pose: 'race_victory' });
    expect(staticFigureSelection({ reaction: null, mind: { visible: true, state: 'sleepy' }, motionPose: 'walk' }))
      .toEqual({ kind: 'state', state: 'sleepy' });
    expect(staticFigureSelection({ reaction: null, mind: { visible: true, state: 'normal' }, motionPose: 'walk' }))
      .toEqual({ kind: 'pose', pose: 'walk' });
    expect(staticFigureSelection({ reaction: null, mind: { visible: false, state: 'normal' }, motionPose: null }))
      .toEqual({ kind: 'base' });
  });

  // A reaction draws its own pose, whatever the Motion pose underneath it was.
  // There is no stage branch to fall back through any more (deviation #73): one
  // body means `race_victory` and `workout` are reachable at every level, so the
  // pre-adult substitution this function used to make has nothing left to do.
  it('draws the reaction pose whatever the day was doing', () => {
    for (const motionPose of ['idle', 'walk', 'run', 'summit', null] as const) {
      expect(staticFigureSelection({ reaction, mind: { visible: false, state: 'normal' }, motionPose }))
        .toEqual({ kind: 'pose', pose: 'race_victory' });
    }
    expect(staticFigureSelection({
      reaction: { ...reaction, kind: 'workout', pose: 'workout', animation: 'excited' },
      mind: { visible: false, state: 'normal' },
      motionPose: null,
    })).toEqual({ kind: 'pose', pose: 'workout' });
  });

  // An account that cannot earn Mind at all reads `visible: false`, and falls
  // through to its Motion pose rather than to a state it could never reach.
  it('withholds the Mind state from an account that cannot earn it', () => {
    expect(staticFigureSelection({ reaction: null, mind: { visible: false, state: 'sleepy' }, motionPose: 'run' }))
      .toEqual({ kind: 'pose', pose: 'run' });
    expect(staticFigureSelection({ reaction: null, mind: { visible: true, state: 'well_rested' }, motionPose: 'walk' }))
      .toEqual({ kind: 'state', state: 'well_rested' });
  });
});

describe('resolveLivingMirror', () => {
  it('hides an unavailable or unknown Mind reading instead of showing zero', () => {
    for (const hasSleepSource of [false, true]) {
      const model = resolveLivingMirror({
        steps: 2_500,
        verifiedStrengthMinutes: 0,
        hasSleepSource,
        sleepMinutes: null,
        lifetimeBodyPoints: 0,
        nextStep: { kind: 'rest' },
        reaction: null,
      });
      expect(model.mind).toEqual({ visible: false, state: 'normal', minutes: null });
      expect(JSON.stringify(model)).not.toContain('0h');
    }
  });

  it('maps verified sleep and lifetime Body independently', () => {
    const model = resolveLivingMirror({
      steps: DAILY_STEP_BASELINE,
      verifiedStrengthMinutes: 0,
      hasSleepSource: true,
      sleepMinutes: 480,
      lifetimeBodyPoints: 50_000,
      nextStep: { kind: 'rest' },
      reaction: null,
    });
    expect(model.motion.location).toBe('ridge');
    expect(model.mind).toMatchObject({ visible: true, state: 'well_rested', minutes: 480 });
    expect(model.body.tier).toBe('strong');
  });

  // The Motion ladder's five bands resolve to four poses, and the top band is
  // the one that earns its own. `ridge` drawing the same `run` as `climb` threw
  // away the day's finish; `summit` is what it draws now, and it is persistent
  // rather than a celebration — the `daily_walk` reaction still outranks it
  // while it is unseen.
  it('draws summit at the ridge and run below it', () => {
    const at = (steps: number) => resolveLivingMirror({
      steps,
      verifiedStrengthMinutes: 0,
      hasSleepSource: false,
      sleepMinutes: null,
      lifetimeBodyPoints: 0,
      nextStep: { kind: 'rest' },
      reaction: null,
    });
    expect(at(500).figure).toEqual({ kind: 'pose', pose: 'idle' });
    expect(at(3_000).figure).toEqual({ kind: 'pose', pose: 'walk' });
    expect(at(6_000).figure).toEqual({ kind: 'pose', pose: 'walk' });
    expect(at(8_000).figure).toEqual({ kind: 'pose', pose: 'run' });
    expect(at(10_000).figure).toEqual({ kind: 'pose', pose: 'summit' });
    expect(at(25_000).figure).toEqual({ kind: 'pose', pose: 'summit' });
    // `summit` is the drawing, never a sixth band: the ladder still ends at the
    // ridge and `locationName` still says "Ridge".
    expect(at(10_000).motion.location).toBe('ridge');
  });
});

describe('dayPose', () => {
  // Two axes want the same drawing and only one can have it, so the order is
  // asserted rather than left to the shape of the branches.
  it('gives the ridge to summit even on a training day', () => {
    expect(dayPose({ location: 'ridge', verifiedStrengthMinutes: 0 })).toBe('summit');
    expect(dayPose({ location: 'ridge', verifiedStrengthMinutes: 45 })).toBe('summit');
  });

  // Below the ridge a verified session takes the figure for the rest of the day
  // — that is the whole point of it, and it costs that day's Motion pose
  // knowingly: Motion still reads in the tile, the meter and the location word.
  it('gives every band below the ridge to a verified session', () => {
    for (const location of ['branch', 'treeline', 'valley', 'climb'] as const) {
      expect(dayPose({ location, verifiedStrengthMinutes: 30 }), location).toBe('workout');
    }
  });

  it('falls back to the Motion ladder with no session', () => {
    expect(dayPose({ location: 'branch', verifiedStrengthMinutes: 0 })).toBe('idle');
    expect(dayPose({ location: 'treeline', verifiedStrengthMinutes: 0 })).toBe('walk');
    expect(dayPose({ location: 'valley', verifiedStrengthMinutes: 0 })).toBe('walk');
    expect(dayPose({ location: 'climb', verifiedStrengthMinutes: 0 })).toBe('run');
  });

  // Zero is "did not train", and a non-finite reading is not a training day
  // either — it is a missing answer, and a missing answer must never invent one.
  it('treats a missing or zero reading as no session', () => {
    expect(dayPose({ location: 'climb', verifiedStrengthMinutes: 0 })).toBe('run');
    expect(dayPose({ location: 'climb', verifiedStrengthMinutes: Number.NaN })).toBe('run');
  });
});

it('composes one useful image label without naming a physique tier', () => {
  const label = livingCharacterLabel({
    characterName: 'Dagit', level: 7, location: 'climb', mind: { visible: true, state: 'well_rested' },
  });
  expect(label).toBe('Dagit, level 7, at the Climb, looking well rested');
  // Case-sensitive and word-bounded: `/str/i` matches "strength" and `/agi/i`
  // matches "Dagit", which is a perfectly good name for a Philippine eagle.
  expect(label).not.toMatch(/\bslim\b|\bfit\b|\bstrong\b/);
  expect(label).not.toMatch(/\b(AGI|STR|MND)\b/);
});

it('capitalises the location from the enum rather than a parallel table', () => {
  for (const location of MOTION_LOCATIONS) {
    expect(locationName(location)).toBe(location[0]!.toUpperCase() + location.slice(1));
  }
});

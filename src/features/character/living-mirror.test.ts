import { describe, expect, it } from 'vitest';
import { DAILY_STEP_BASELINE } from '@kairo/core';
import {
  MOTION_LOCATIONS,
  livingCharacterLabel,
  locationName,
  motionLocationForSteps,
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
});

describe('resolveLivingMirror', () => {
  it('hides an unavailable or unknown Mind reading instead of showing zero', () => {
    for (const hasSleepSource of [false, true]) {
      const model = resolveLivingMirror({
        steps: 2_500,
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

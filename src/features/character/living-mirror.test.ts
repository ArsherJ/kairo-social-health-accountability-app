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

// The literals, not `GROWTH_STAGES`: a test that derives its own input from the
// table under test agrees with it by construction.
const stages = [1, 2, 3, 4] as const;
const preAdult = [1, 2, 3] as const;
const ADULT = 4 as const;

describe('staticFigureSelection', () => {
  const reaction: LivingReaction = {
    kind: 'level', occurrence: 'level:2->3', pose: 'race_victory', animation: 'level_up',
    sentence: 'Level 3.', priority: 50,
  };
  const adult = ADULT;

  it('uses reaction, non-neutral Mind, Motion, then base priority', () => {
    expect(staticFigureSelection({ stage: adult, reaction, mind: { visible: true, state: 'sleepy' }, motionPose: 'walk' }))
      .toEqual({ kind: 'pose', pose: 'race_victory' });
    expect(staticFigureSelection({ stage: adult, reaction: null, mind: { visible: true, state: 'sleepy' }, motionPose: 'walk' }))
      .toEqual({ kind: 'state', state: 'sleepy' });
    expect(staticFigureSelection({ stage: adult, reaction: null, mind: { visible: true, state: 'normal' }, motionPose: 'walk' }))
      .toEqual({ kind: 'stage', stage: adult, pose: 'walk' });
    expect(staticFigureSelection({ stage: adult, reaction: null, mind: { visible: false, state: 'normal' }, motionPose: null }))
      .toEqual({ kind: 'base' });
  });

  // The whole ticket. The three poses that actually draw are the three that
  // carry the growth stage, so a level-up changes the picture on the screen the
  // player opens first.
  it('carries the growth stage on every pose that draws', () => {
    for (const stage of stages) {
      for (const pose of ['idle', 'walk', 'run'] as const) {
        expect(staticFigureSelection({ stage, reaction: null, mind: { visible: false, state: 'normal' }, motionPose: pose }))
          .toEqual({ kind: 'stage', stage, pose });
      }
    }
  });

  // A young bird must not turn into an adult for three seconds every time it
  // celebrates — least of all on the level-up this change exists to serve.
  // `race_victory` and `workout` exist as adult art only, so a pre-adult
  // reaction keeps the body it was already standing in and lets the animation
  // carry the celebration.
  it('keeps a pre-adult reaction in its own stage art', () => {
    for (const stage of preAdult) {
      expect(staticFigureSelection({ stage, reaction, mind: { visible: false, state: 'normal' }, motionPose: 'run' }))
        .toEqual({ kind: 'stage', stage, pose: 'run' });
      expect(staticFigureSelection({
        stage,
        reaction: { ...reaction, kind: 'workout', pose: 'workout', animation: 'excited' },
        mind: { visible: false, state: 'normal' },
        motionPose: null,
      })).toEqual({ kind: 'stage', stage, pose: 'idle' });
    }
    expect(staticFigureSelection({ stage: adult, reaction, mind: { visible: false, state: 'normal' }, motionPose: 'run' }))
      .toEqual({ kind: 'pose', pose: 'race_victory' });
  });

  // A reaction whose own pose is one of the three draws that pose at its stage
  // rather than falling back to where the body was standing — the Treeline
  // reaction is a walk, and a walking bird is a picture every stage has.
  it('draws a reaction pose that the stage art already covers', () => {
    expect(staticFigureSelection({
      stage: 2,
      reaction: { ...reaction, kind: 'motion_location', pose: 'walk', animation: 'happy' },
      mind: { visible: false, state: 'normal' },
      motionPose: 'run',
    })).toEqual({ kind: 'stage', stage: 2, pose: 'walk' });
  });

  // Mind-state art is adult-only for now and that is a deliberate, smaller lie
  // than a celebrating adult: the state images are wearable-gated, so most
  // accounts never reach them, and it is revisited at the animation handoff.
  it('keeps the Mind state on the adult art at every stage', () => {
    for (const stage of stages) {
      expect(staticFigureSelection({ stage, reaction: null, mind: { visible: true, state: 'well_rested' }, motionPose: 'walk' }))
        .toEqual({ kind: 'state', state: 'well_rested' });
    }
  });
});

describe('resolveLivingMirror', () => {
  it('hides an unavailable or unknown Mind reading instead of showing zero', () => {
    for (const hasSleepSource of [false, true]) {
      const model = resolveLivingMirror({
        stage: 4,
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
      stage: 4,
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

  // One derivation of the stage reaches the figure. The screen reads it once
  // from the level and hands it here; nothing in this module re-derives it,
  // because a second reading is a second thing that can disagree.
  it('carries the growth stage it was given into the figure', () => {
    for (const stage of stages) {
      const model = resolveLivingMirror({
        stage,
        steps: 2_500,
        hasSleepSource: false,
        sleepMinutes: null,
        lifetimeBodyPoints: 0,
        nextStep: { kind: 'rest' },
        reaction: null,
      });
      expect(model.figure).toEqual({ kind: 'stage', stage, pose: 'walk' });
    }
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

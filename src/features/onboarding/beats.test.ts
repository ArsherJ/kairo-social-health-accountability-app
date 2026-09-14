import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_BEATS,
  RAIL_STEPS,
  beatCta,
  beatRoute,
  onboardingBeat,
  onboardingSkipTarget,
  railStepLabel,
  resolveBeats,
  valueCardPosition,
} from './beats.ts';

describe('the onboarding beat registry', () => {
  it('holds the run in the order it is walked', () => {
    expect(ONBOARDING_BEATS.map((b) => b.name)).toEqual([
      'welcome',
      'one-sky',
      'mirror',
      'connect',
      'hatching',
      'difficulty',
      'privacy',
      'name',
    ]);
  });

  it('walks the rail one step per beat, in order, none skipped', () => {
    const steps = ONBOARDING_BEATS.map((b) => b.step);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    for (let step = 0; step < RAIL_STEPS; step += 1) {
      expect(steps).toContain(step);
    }
    // Seven routed beats, seven steps: the hatch shares the Health ask's.
    expect(RAIL_STEPS).toBe(7);
    expect(Math.max(...steps)).toBe(6);
  });

  it('gives every beat with a button its own words', () => {
    const labels = ONBOARDING_BEATS.map((b) => b.cta).filter((l) => l !== null);
    expect(new Set(labels).size).toBe(labels.length);
  });

  // One segment per screen (deviation #75). The rail drew four phases for
  // seven beats and testers read a half-filled segment as no progress and the
  // run as stalled. Every tap now visibly moves the bar; the hatch — a wait
  // the player cannot act on — is the one thing that stays on the same step,
  // filling the Health ask's segment rather than opening one of its own.
  // Pinned in full because a derivation one step off anywhere redraws a rail
  // nobody asked to redraw, and the error is invisible until somebody watches
  // the bar move on a device.
  it('fills one segment per beat, with the hatch closing out the Health ask', () => {
    const rail = Object.fromEntries(
      ONBOARDING_BEATS.map((b) => [b.name, [b.filled, b.partial]]),
    );
    expect(rail).toEqual({
      welcome: [0, 1],
      'one-sky': [1, 1],
      mirror: [2, 1],
      connect: [3, 0.5],
      hatching: [3, 1],
      difficulty: [4, 1],
      privacy: [5, 1],
      name: [6, 1],
    });
  });

  // The dots under the opening value cards promise three cards. They promised
  // three while two existed; the mirror beat is the third, and the count is
  // honest now — and derived from the pitch, so it stays honest.
  it('opens with exactly the three beats the paged dots promise', () => {
    expect(ONBOARDING_BEATS.filter((b) => b.pitch).map((b) => b.name)).toEqual([
      'welcome',
      'one-sky',
      'mirror',
    ]);
  });

  it('closes every step out before the next one opens', () => {
    for (let step = 0; step < RAIL_STEPS; step += 1) {
      const onStep = ONBOARDING_BEATS.filter((b) => b.step === step);
      expect(onStep.at(-1)?.partial).toBe(1);
      expect(onStep.every((b) => b.filled === step)).toBe(true);
    }
  });

  it('finds a beat by name and refuses one it does not have', () => {
    expect(onboardingBeat('privacy').cta).toBe('Good to know');
    // @ts-expect-error — the point of the throw is the call the types forbid.
    expect(() => onboardingBeat('notify')).toThrow(/notify/);
  });

  it('names every beat that is its own route after that route', () => {
    for (const beat of ONBOARDING_BEATS) {
      if (beat.route !== null) expect(beat.route).toBe(`/${beat.name}`);
    }
    // The hatch is a stage of `/connect`, not a route of its own — it shares
    // the ask's rail step and will report no beat impression.
    expect(onboardingBeat('hatching').route).toBeNull();
  });
});

describe('resolveBeats', () => {
  it('spreads a step evenly however many beats share it', () => {
    const resolved = resolveBeats([
      { name: 'a', route: null, step: 0, pitch: true, cta: null },
      { name: 'b', route: null, step: 0, pitch: true, cta: null },
      { name: 'c', route: null, step: 0, pitch: true, cta: null },
      { name: 'd', route: null, step: 1, pitch: false, cta: null },
    ] as never);

    expect(resolved.map((b) => [b.filled, b.partial])).toEqual([
      [0, 1 / 3],
      [0, 2 / 3],
      [0, 1],
      [1, 1],
    ]);
  });
});

describe('railStepLabel', () => {
  it('counts the step you are on, never past the end of the rail', () => {
    expect(railStepLabel(0)).toBe('Step 1 of 7');
    expect(railStepLabel(3)).toBe('Step 4 of 7');
    expect(railStepLabel(6)).toBe('Step 7 of 7');
    // Clamped: the last beat closes the rail out and there is no eighth step
    // to announce.
    expect(railStepLabel(7)).toBe('Step 7 of 7');
  });
});

describe('beatCta', () => {
  it('hands back the words, and refuses to invent them', () => {
    expect(beatCta(onboardingBeat('welcome'))).toBe("Let's fly");
    expect(beatCta(onboardingBeat('mirror'))).toBe('Show me');
    expect(() => beatCta(onboardingBeat('hatching'))).toThrow(/hatching/);
  });
});

describe('beatRoute', () => {
  it('hands back the route, and refuses to invent one', () => {
    expect(beatRoute(onboardingBeat('mirror'))).toBe('/mirror');
    expect(() => beatRoute(onboardingBeat('hatching'))).toThrow(/hatching/);
  });
});

describe('valueCardPosition', () => {
  it('numbers each value card against the run rather than against a literal', () => {
    expect(valueCardPosition(onboardingBeat('welcome'))).toEqual({ index: 0, count: 3 });
    expect(valueCardPosition(onboardingBeat('one-sky'))).toEqual({ index: 1, count: 3 });
    expect(valueCardPosition(onboardingBeat('mirror'))).toEqual({ index: 2, count: 3 });
  });

  it('refuses a beat that is not a value card', () => {
    expect(() => valueCardPosition(onboardingBeat('privacy'))).toThrow(/privacy/);
  });
});

describe('onboardingSkipTarget', () => {
  // The whole point of the mirror beat: it sits directly above the one dialog
  // whose refusal cannot be undone from inside the app, and a skip that landed
  // past it would route the people most likely to decline around the argument
  // aimed at them.
  it('lands on the last beat of the pitch, not past it', () => {
    expect(onboardingSkipTarget()).toBe('/mirror');
  });

  it('is a beat that carries no skip of its own', () => {
    const target = ONBOARDING_BEATS.find((b) => b.route === onboardingSkipTarget());
    expect(target?.pitch).toBe(true);
    expect(ONBOARDING_BEATS.filter((b) => b.pitch).at(-1)).toBe(target);
  });
});

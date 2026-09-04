import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_BEATS,
  RAIL_PHASES,
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

  it('groups the run into exactly the rail phases, in order, none empty', () => {
    const phases = ONBOARDING_BEATS.map((b) => b.phase);
    expect([...phases].sort((a, b) => a - b)).toEqual(phases);
    for (let phase = 0; phase < RAIL_PHASES; phase += 1) {
      expect(phases).toContain(phase);
    }
    expect(Math.max(...phases)).toBe(RAIL_PHASES - 1);
  });

  it('gives every beat with a button its own words', () => {
    const labels = ONBOARDING_BEATS.map((b) => b.cta).filter((l) => l !== null);
    expect(new Set(labels).size).toBe(labels.length);
  });

  // The rail still measures four phases; the mirror beat moves only the fills
  // and partials inside the phase it joined, which is what adding a beat is
  // supposed to cost. Pinned in full because a derivation one step off
  // anywhere redraws a rail nobody asked to redraw, and the error is invisible
  // until somebody watches the bar move on a device.
  it('spreads the opening phase across three beats and leaves the rest alone', () => {
    const rail = Object.fromEntries(
      ONBOARDING_BEATS.map((b) => [b.name, [b.filled, b.partial]]),
    );
    expect(rail).toEqual({
      welcome: [0, 1 / 3],
      'one-sky': [0, 2 / 3],
      mirror: [0, 1],
      connect: [1, 0.5],
      hatching: [1, 1],
      difficulty: [2, 0.5],
      privacy: [2, 1],
      // The name beat hand-wrote `filled={4}`, which fills four of four
      // segments. Phase 3 filled to 1 fills the same four: three whole, the
      // fourth at 100% width.
      name: [3, 1],
    });
  });

  // The dots under the opening value cards promise three cards. They promised
  // three while two existed; the mirror beat is the third, and the count is
  // honest now — and derived, so it stays honest.
  it('opens with exactly the three beats the paged dots promise', () => {
    expect(ONBOARDING_BEATS.filter((b) => b.phase === 0).map((b) => b.name)).toEqual([
      'welcome',
      'one-sky',
      'mirror',
    ]);
  });

  it('closes every phase out before the next one opens', () => {
    for (let phase = 0; phase < RAIL_PHASES; phase += 1) {
      const inPhase = ONBOARDING_BEATS.filter((b) => b.phase === phase);
      expect(inPhase.at(-1)?.partial).toBe(1);
      expect(inPhase.every((b) => b.filled === phase)).toBe(true);
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
    // The hatch is a phase of `/connect`, not a route of its own — it draws a
    // rail step and will report no beat impression.
    expect(onboardingBeat('hatching').route).toBeNull();
  });
});

describe('resolveBeats', () => {
  it('spreads a phase evenly however many beats it holds', () => {
    const resolved = resolveBeats([
      { name: 'a', route: null, phase: 0, cta: null },
      { name: 'b', route: null, phase: 0, cta: null },
      { name: 'c', route: null, phase: 0, cta: null },
      { name: 'd', route: null, phase: 1, cta: null },
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
  it('counts the phase you are in, never past the end of the rail', () => {
    expect(railStepLabel(0)).toBe('Step 1 of 4');
    expect(railStepLabel(3)).toBe('Step 4 of 4');
    // The value the name beat used to pass. It read "Step 4 of 4" then and
    // must still, or a rail that renders identically speaks differently.
    expect(railStepLabel(4)).toBe('Step 4 of 4');
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
    expect(target?.phase).toBe(0);
    expect(ONBOARDING_BEATS.filter((b) => b.phase === 0).at(-1)).toBe(target);
  });
});

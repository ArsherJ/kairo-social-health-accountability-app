import { describe, expect, it } from 'vitest';
import type { Challenge } from '@kairo/core';
import { challengeHeadline, challengeHint, challengeLabel } from './challenge-copy.ts';

const RUN_ESTABLISH: Challenge = { area: 'run', kind: 'establish', minDistanceM: 1_000 };
const RUN_TARGET: Challenge = {
  area: 'run',
  kind: 'target',
  minDistanceM: 5_000,
  paceSecPerKm: 291,
};
const LIFT_ESTABLISH: Challenge = { area: 'strength', kind: 'establish' };
const LIFT_TARGET: Challenge = { area: 'strength', kind: 'target', activeKcal: 1_410 };

const ALL = [RUN_ESTABLISH, RUN_TARGET, LIFT_ESTABLISH, LIFT_TARGET];

describe('challengeHeadline', () => {
  it('asks for one qualifying run at the cold start', () => {
    expect(challengeHeadline(RUN_ESTABLISH)).toBe('Log one run of 1 km or more');
  });

  it('names the distance and the pace on a run target', () => {
    expect(challengeHeadline(RUN_TARGET)).toBe('5 km under 4:51/km');
  });

  it('asks for one session at the strength cold start', () => {
    expect(challengeHeadline(LIFT_ESTABLISH)).toBe('Log one strength session');
  });

  it('names the calories on a strength target, with a thousands separator', () => {
    expect(challengeHeadline(LIFT_TARGET)).toBe('1,410 kcal in one session');
  });

  it('never states a point total', () => {
    // Points are spoken nowhere ambient, and a challenge target is a pace or
    // a calorie count in the first place.
    for (const challenge of ALL) {
      expect(challengeHeadline(challenge)).not.toMatch(/\bpoints?\b/i);
    }
  });
});

describe('challengeHint', () => {
  it('teaches the habit at the cold start, for both areas', () => {
    // The thing standing between a user and their first clear is starting the
    // workout so Kairo can see it — a behaviour gap, not a capability gap.
    expect(challengeHint(RUN_ESTABLISH)).toContain('watch or phone');
    expect(challengeHint(LIFT_ESTABLISH)).toContain('watch or phone');
  });

  it('promises the first one cannot be failed', () => {
    expect(challengeHint(RUN_ESTABLISH)).toContain('can’t be failed');
  });

  it('says bodyweight counts, which is the point that mattered', () => {
    expect(challengeHint(LIFT_ESTABLISH)).toContain('push-ups');
  });

  it('explains that a real target moves both ways', () => {
    // Ease is not a hidden mechanic: a quiet stretch lowers the median, which
    // lowers the target, and the copy has to say so or it reads as a ratchet.
    for (const challenge of [RUN_TARGET, LIFT_TARGET]) {
      expect(challengeHint(challenge)).toContain('back down');
    }
  });
});

describe('challengeLabel', () => {
  it('composes one sentence naming the area, the target and the state', () => {
    expect(challengeLabel(RUN_TARGET, false)).toBe(
      'Run challenge. 5 km under 4:51/km. Not cleared yet.',
    );
    expect(challengeLabel(LIFT_TARGET, true)).toBe(
      'Strength challenge. 1,410 kcal in one session. Cleared today.',
    );
  });

  it('names the area first, which is what tells the two cards apart', () => {
    for (const challenge of ALL) {
      expect(challengeLabel(challenge, false)).toMatch(/^(Run|Strength) challenge\./);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { animationDuration, shouldRecount } from './motion-policy.ts';

describe('animationDuration', () => {
  it('passes the duration through when motion is allowed', () => {
    expect(animationDuration(600, false)).toBe(600);
  });

  // Reduce Motion is an accessibility setting, not a preference to soften.
  it('collapses to zero when Reduce Motion is on', () => {
    expect(animationDuration(600, true)).toBe(0);
  });
});

describe('shouldRecount', () => {
  it('counts up on the first value it sees', () => {
    expect(shouldRecount(undefined, 4_820)).toBe(true);
  });

  it('counts up when the value changes', () => {
    expect(shouldRecount(4_820, 5_020)).toBe(true);
  });

  // Realtime broadcasts invalidate boards constantly and most refetches return
  // the same number. Re-counting an unchanged value reads as a glitch.
  it('stays still when a refetch returns the same value', () => {
    expect(shouldRecount(4_820, 4_820)).toBe(false);
  });

  it('counts down as readily as up — Apple can revise a day downward', () => {
    expect(shouldRecount(4_820, 4_400)).toBe(true);
  });

  it('counts up from zero, which is a real starting total', () => {
    expect(shouldRecount(0, 200)).toBe(true);
  });
});

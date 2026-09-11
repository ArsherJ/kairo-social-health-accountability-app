import { describe, expect, it, vi } from 'vitest';
import { statPointsForRating } from '@kairo/core';
import {
  resolveKairoSelection,
  sleepStateFor,
  strengthTierFor,
} from './character-resolver.ts';

describe('sleepStateFor', () => {
  it.each([
    [undefined, 'normal'],
    [null, 'normal'],
    [0, 'sleepy'],
    [299, 'sleepy'],
    [300, 'sleepy'],
    [360, 'normal'],
    [420, 'well_rested'],
    [540, 'well_rested'],
    // Nine hours and a minute. It read 'sleepy' until 2026-08-29, when Mind's
    // oversleep cliff became a taper — a long night is no longer scored as a
    // bad one, and the bird should not look like it was.
    [541, 'normal'],
    [720, 'normal'],
  ])('maps %s scored minutes to %s', (minutes, expected) => {
    expect(sleepStateFor(minutes)).toBe(expected);
  });
});

describe('strengthTierFor', () => {
  it('uses neutral fit while lifetime STR is unresolved', () => {
    expect(strengthTierFor(undefined)).toBe('fit');
    expect(strengthTierFor(null)).toBe('fit');
  });

  it('maps rating boundaries rather than treating points as ratings', () => {
    expect(strengthTierFor(0)).toBe('slim');
    expect(strengthTierFor(statPointsForRating(6) - 1)).toBe('slim');
    expect(strengthTierFor(statPointsForRating(6))).toBe('fit');
    expect(strengthTierFor(statPointsForRating(21) - 1)).toBe('fit');
    expect(strengthTierFor(statPointsForRating(21))).toBe('strong');
  });
});

describe('resolveKairoSelection', () => {
  it('defaults missing and invalid inputs to a neutral selection', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      resolveKairoSelection({
        sleepMinutes: 'invalid',
        strengthPoints: 'invalid',
        pose: 'flying',
        reaction: null,
      }),
    ).toEqual({
      sleepState: 'normal',
      strengthTier: 'fit',
      pose: 'idle',
    });
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it('accepts an unresolved whole input as the neutral selection', () => {
    expect(resolveKairoSelection(null)).toEqual({
      sleepState: 'normal',
      strengthTier: 'fit',
      pose: 'idle',
    });
  });

  it('resolves product values and carries a reaction occurrence unchanged', () => {
    const reaction = { id: 'level_up' as const, occurrence: 'level:8->9' };
    expect(
      resolveKairoSelection({
        sleepMinutes: 420,
        strengthPoints: statPointsForRating(21),
        pose: 'run',
        reaction,
      }),
    ).toEqual({
      sleepState: 'well_rested',
      strengthTier: 'strong',
      pose: 'run',
      reaction,
    });
  });
});

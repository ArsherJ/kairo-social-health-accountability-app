import { describe, expect, it, vi } from 'vitest';
import { statPointsForRating } from '@kairo/core';
import {
  resolveKairoSelection,
  sanitizeCosmetics,
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

describe('sanitizeCosmetics', () => {
  it('keeps at most one known cosmetic in each selected slot', () => {
    expect(
      sanitizeCosmetics({
        body: 'trail_vest',
        feet: 'rain_boots',
        face: 'round_glasses',
        head: 'runner_cap',
      }),
    ).toEqual({
      body: 'trail_vest',
      feet: 'rain_boots',
      face: 'round_glasses',
      head: 'runner_cap',
    });
  });

  it('drops unknown IDs and cosmetics declared in the wrong slot', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      sanitizeCosmetics({
        body: 'not_a_cosmetic',
        head: 'trail_vest',
        face: 'round_glasses',
      }),
    ).toEqual({ face: 'round_glasses' });
    expect(warning).toHaveBeenCalledTimes(2);
    warning.mockRestore();
  });

  it('keeps the first valid cosmetic when array input repeats a slot', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(
      sanitizeCosmetics([
        { slot: 'head', id: 'runner_cap' },
        { slot: 'head', id: 'woven_salakot' },
      ]),
    ).toEqual({ head: 'runner_cap' });
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith('[character] dropped duplicate cosmetic in head');
    warning.mockRestore();
  });

  it('emits diagnostics only for invalid product data in development', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    sanitizeCosmetics({ head: 'not_a_cosmetic' });
    if (process.env.NODE_ENV !== 'production') expect(warning).toHaveBeenCalled();
    warning.mockRestore();
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
        cosmetics: { head: 'not_a_cosmetic' },
        reaction: null,
      }),
    ).toEqual({
      sleepState: 'normal',
      strengthTier: 'fit',
      pose: 'idle',
      cosmetics: {},
    });
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it('accepts an unresolved whole input as the neutral selection', () => {
    expect(resolveKairoSelection(null)).toEqual({
      sleepState: 'normal',
      strengthTier: 'fit',
      pose: 'idle',
      cosmetics: {},
    });
  });

  it('resolves product values and carries a reaction occurrence unchanged', () => {
    const reaction = { id: 'level_up' as const, occurrence: 'level:8->9' };
    expect(
      resolveKairoSelection({
        sleepMinutes: 420,
        strengthPoints: statPointsForRating(21),
        pose: 'run',
        cosmetics: { head: 'runner_cap', feet: 'rain_boots' },
        reaction,
      }),
    ).toEqual({
      sleepState: 'well_rested',
      strengthTier: 'strong',
      pose: 'run',
      cosmetics: { head: 'runner_cap', feet: 'rain_boots' },
      reaction,
    });
  });
});

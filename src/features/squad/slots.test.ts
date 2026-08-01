import { describe, expect, it } from 'vitest';
import { FREE_SQUAD_MAX_MEMBERS, LEGENDARY_SQUAD_MAX_MEMBERS } from '@kairo/core';
import { resolveSlots, shouldRevealUnlock } from './slots.ts';

describe('resolveSlots', () => {
  it('gives a solo player five locked slots on a free squad', () => {
    expect(resolveSlots({ memberCount: 1, maxMembers: FREE_SQUAD_MAX_MEMBERS })).toEqual({
      filled: 1,
      locked: 5,
    });
  });

  it('shrinks the locked slots as the squad fills', () => {
    expect(resolveSlots({ memberCount: 4, maxMembers: FREE_SQUAD_MAX_MEMBERS })).toEqual({
      filled: 4,
      locked: 2,
    });
  });

  it('leaves no locked slot on a full squad', () => {
    expect(resolveSlots({ memberCount: 6, maxMembers: FREE_SQUAD_MAX_MEMBERS })).toEqual({
      filled: 6,
      locked: 0,
    });
  });

  it('counts against a Legendary squad’s larger cap', () => {
    expect(
      resolveSlots({ memberCount: 3, maxMembers: LEGENDARY_SQUAD_MAX_MEMBERS }),
    ).toEqual({ filled: 3, locked: 12 });
  });

  // The cap can shrink under a squad — a Legendary subscription lapsing is the
  // realistic path — and a negative slot count would crash the render.
  it('never returns negative locked slots when the squad is over capacity', () => {
    expect(resolveSlots({ memberCount: 8, maxMembers: FREE_SQUAD_MAX_MEMBERS })).toEqual({
      filled: 8,
      locked: 0,
    });
  });

  // useSquadMemberCount is undefined on its first render, and the board must
  // not flash six locked slots before the count lands.
  it('locks nothing while the member count is still unknown', () => {
    expect(
      resolveSlots({ memberCount: undefined, maxMembers: FREE_SQUAD_MAX_MEMBERS }),
    ).toEqual({ filled: 0, locked: 0 });
  });
});

describe('shouldRevealUnlock', () => {
  it('fires when a member joins between refetches', () => {
    expect(shouldRevealUnlock(1, 2)).toBe(true);
  });

  // Opening the app to a squad you already had is not a joining moment.
  it('stays silent on the first observed count', () => {
    expect(shouldRevealUnlock(undefined, 3)).toBe(false);
  });

  it('stays silent while the count is unchanged', () => {
    expect(shouldRevealUnlock(3, 3)).toBe(false);
  });

  // Someone leaving is not a celebration, and must not animate a slot in.
  it('stays silent when the count drops', () => {
    expect(shouldRevealUnlock(3, 2)).toBe(false);
  });

  it('stays silent while a refetch is in flight and the count is unknown', () => {
    expect(shouldRevealUnlock(3, undefined)).toBe(false);
  });
});

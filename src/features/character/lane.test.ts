import { describe, expect, it } from 'vitest';
import { CORE_STATS, USER_FOCUSES } from '@kairo/core';
import { laneEmptyCopy, laneStat } from './lane.ts';

describe('laneStat', () => {
  it('points each focus at the stat it fills', () => {
    expect(laneStat('running')).toBe('AGI');
    expect(laneStat('gym')).toBe('STR');
    expect(laneStat('walking')).toBe('VIT');
  });

  it('highlights nothing for someone who trains a bit of everything', () => {
    expect(laneStat('general')).toBeNull();
  });

  it('highlights nothing when focus was skipped', () => {
    // Null focus is a normal value, not a missing one.
    expect(laneStat(null)).toBeNull();
  });

  it('never highlights a stat the four-stat list does not contain', () => {
    for (const focus of USER_FOCUSES) {
      const stat = laneStat(focus);
      if (stat !== null) expect(CORE_STATS).toContain(stat);
    }
  });
});

describe('laneEmptyCopy', () => {
  it('speaks the focus’s own language on an empty bar', () => {
    expect(laneEmptyCopy('running')).toBe('Your next run fills this bar.');
    expect(laneEmptyCopy('gym')).toBe('Your next session fills this bar.');
    expect(laneEmptyCopy('walking')).toBe('Your next walk fills this bar.');
  });

  it('says nothing when there is no lane to speak for', () => {
    expect(laneEmptyCopy('general')).toBeNull();
    expect(laneEmptyCopy(null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { CORE_STATS } from '@kairo/core';
import { laneEmptyCopy, laneStat } from './lane.ts';

describe('laneStat', () => {
  it('is the stat the user has actually been grinding', () => {
    expect(laneStat('AGI')).toBe('AGI');
    expect(laneStat('STR')).toBe('STR');
    expect(laneStat('END')).toBe('END');
    expect(laneStat('VIT')).toBe('VIT');
  });

  it('highlights nothing for someone whose four stats are level', () => {
    // 'balanced' is the answer "a bit of everything". Picking a stat to speak
    // for that user would be inventing a preference they have not shown.
    expect(laneStat('balanced')).toBeNull();
  });

  it('highlights nothing before there is any history to read', () => {
    // Null is "nobody has moved yet"; undefined is "the query has not landed".
    // Both mean the same thing here, and neither is an error.
    expect(laneStat(null)).toBeNull();
    expect(laneStat(undefined)).toBeNull();
  });

  it('never highlights a stat the four-stat list does not contain', () => {
    for (const stat of CORE_STATS) {
      expect(CORE_STATS).toContain(laneStat(stat));
    }
  });
});

describe('laneEmptyCopy', () => {
  it('speaks the lane’s own language, in activities rather than stat names', () => {
    // "Your next run" is something a person can go and do. "Your next AGI" is not.
    expect(laneEmptyCopy('AGI')).toBe('Your next walk or run fills this bar.');
    expect(laneEmptyCopy('STR')).toBe('Your next session fills this bar.');
    expect(laneEmptyCopy('END')).toBe('Your next workout fills this bar.');
    expect(laneEmptyCopy('VIT')).toBe('Moving on the hour fills this bar.');
  });

  it('has copy for every core stat, so a lane can never render blank', () => {
    for (const stat of CORE_STATS) {
      expect(laneEmptyCopy(stat)).toBeTruthy();
    }
  });

  it('says nothing when there is no lane to speak for', () => {
    expect(laneEmptyCopy('balanced')).toBeNull();
    expect(laneEmptyCopy(null)).toBeNull();
    expect(laneEmptyCopy(undefined)).toBeNull();
  });
});

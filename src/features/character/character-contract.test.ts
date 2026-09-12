import { describe, expect, it } from 'vitest';
import { KAIRO_POSES, KAIRO_REACTIONS, SLEEP_STATES } from './character-contract.ts';

describe('KAIRO character contract', () => {
  it('has the approved semantic surface', () => {
    expect(SLEEP_STATES).toEqual(['sleepy', 'normal', 'well_rested']);
    expect(KAIRO_POSES).toEqual([
      'idle',
      'sleep',
      'walk',
      'run',
      'workout',
      'race_victory',
      'summit',
    ]);
    expect(KAIRO_REACTIONS).toEqual(['happy', 'excited', 'tired', 'victory', 'level_up']);
    expect(KAIRO_POSES).not.toContain('level_up');
  });
});

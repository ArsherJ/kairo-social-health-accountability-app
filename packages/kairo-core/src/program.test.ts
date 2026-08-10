import { describe, expect, it } from 'vitest';
import {
  PROGRAM_BOOST_MULTIPLIER,
  PROGRAM_WEIGHTS,
  SQUAD_PROGRAMS,
  boostedStatFor,
  isSquadProgram,
  programWeight,
  weightedBoardTotal,
} from './program.ts';
import { CORE_STATS, type CoreStat } from './types.ts';

const NO_POINTS: Record<CoreStat, number> = { AGI: 0, STR: 0, END: 0, VIT: 0 };

describe('PROGRAM_WEIGHTS', () => {
  it('boosts exactly one stat per focused program', () => {
    expect(boostedStatFor('running')).toBe('AGI');
    expect(boostedStatFor('gym')).toBe('STR');
    expect(boostedStatFor('walking')).toBe('VIT');
  });

  it('boosts nothing for all_around', () => {
    expect(boostedStatFor('all_around')).toBeNull();
    for (const stat of CORE_STATS) {
      expect(programWeight('all_around', stat)).toBe(1);
    }
  });

  it('never boosts END on any program', () => {
    // END rides AppleExerciseTime, which may be Watch-only (Phase 3). Boosting
    // a stat most beta users cannot earn would make a program unwinnable.
    for (const program of SQUAD_PROGRAMS) {
      expect(programWeight(program, 'END')).toBe(1);
    }
  });

  it('weights the boosted stat by exactly the boost multiplier', () => {
    expect(programWeight('running', 'AGI')).toBe(PROGRAM_BOOST_MULTIPLIER);
    expect(programWeight('gym', 'STR')).toBe(PROGRAM_BOOST_MULTIPLIER);
    expect(programWeight('walking', 'VIT')).toBe(PROGRAM_BOOST_MULTIPLIER);
  });

  it('leaves every unboosted stat at 1', () => {
    for (const program of SQUAD_PROGRAMS) {
      const boosted = boostedStatFor(program);
      for (const stat of CORE_STATS) {
        if (stat === boosted) continue;
        expect(programWeight(program, stat)).toBe(1);
      }
    }
  });

  it('has a complete weight row for every program', () => {
    for (const program of SQUAD_PROGRAMS) {
      expect(Object.keys(PROGRAM_WEIGHTS[program]).sort()).toEqual(
        [...CORE_STATS].sort(),
      );
    }
  });
});

describe('isSquadProgram', () => {
  it('accepts every declared program', () => {
    for (const program of SQUAD_PROGRAMS) {
      expect(isSquadProgram(program)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isSquadProgram('cycling')).toBe(false);
    expect(isSquadProgram('')).toBe(false);
    expect(isSquadProgram(null)).toBe(false);
  });
});

describe('weightedBoardTotal', () => {
  it('equals the raw total on an all_around board', () => {
    const total = weightedBoardTotal({
      program: 'all_around',
      statPoints: { AGI: 900, STR: 500, END: 0, VIT: 900 },
      consistencyBonus: 400,
      recBonus: 500,
    });
    expect(total).toBe(3_200);
  });

  it('boosts only the program stat, leaving the others alone', () => {
    // Same day as above, scored on a running board: AGI 900 -> 1350.
    const total = weightedBoardTotal({
      program: 'running',
      statPoints: { AGI: 900, STR: 500, END: 0, VIT: 900 },
      consistencyBonus: 400,
      recBonus: 500,
    });
    expect(total).toBe(3_650);
  });

  it('leaves the consistency and REC bonuses unweighted', () => {
    // The bonuses are universal (§5): a program tilts stats, never the reward
    // for showing up on all four or for sleeping.
    const total = weightedBoardTotal({
      program: 'walking',
      statPoints: NO_POINTS,
      consistencyBonus: 800,
      recBonus: 500,
    });
    expect(total).toBe(1_300);
  });

  it('weights only the boosted stat when it is the only one scored', () => {
    const total = weightedBoardTotal({
      program: 'gym',
      statPoints: { AGI: 0, STR: 900, END: 0, VIT: 0 },
      consistencyBonus: 0,
      recBonus: 0,
    });
    expect(total).toBe(1_350);
  });

  it('rounds the weighted stat sum to an integer', () => {
    // 125 * 1.5 = 187.5. The board total is an integer column, so the .5 must
    // resolve here and identically in SQL — round-half-up, away from zero.
    const total = weightedBoardTotal({
      program: 'running',
      statPoints: { AGI: 125, STR: 0, END: 0, VIT: 0 },
      consistencyBonus: 0,
      recBonus: 0,
    });
    expect(total).toBe(188);
  });

  it('is zero for a day with nothing on it', () => {
    expect(
      weightedBoardTotal({
        program: 'gym',
        statPoints: NO_POINTS,
        consistencyBonus: 0,
        recBonus: 0,
      }),
    ).toBe(0);
  });
});

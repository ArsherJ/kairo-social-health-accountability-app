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

const NO_POINTS: Record<CoreStat, number> = { AGI: 0, STR: 0, MND: 0 };

describe('PROGRAM_WEIGHTS', () => {
  it('boosts exactly one stat per focused program', () => {
    expect(boostedStatFor('running')).toBe('AGI');
    expect(boostedStatFor('strength')).toBe('STR');
    // Walking boosted VIT until deviation #41 retired it. VIT's signal now
    // lives in AGI's spread shift, so walking boosts the stat it always
    // actually measured.
    expect(boostedStatFor('walking')).toBe('AGI');
    expect(boostedStatFor('recovery')).toBe('MND');
  });

  it('lets two programs boost the same stat', () => {
    // Running and walking are different games people mean different things by.
    // Collapsing them because they now name one stat would be a product
    // decision, not a refactor.
    expect(boostedStatFor('running')).toBe(boostedStatFor('walking'));
    expect(SQUAD_PROGRAMS).toContain('running');
    expect(SQUAD_PROGRAMS).toContain('walking');
  });

  it('boosts nothing for all_around', () => {
    expect(boostedStatFor('all_around')).toBeNull();
    for (const stat of CORE_STATS) {
      expect(programWeight('all_around', stat)).toBe(1);
    }
  });

  it('boosts at most one stat per program', () => {
    // A second boosted stat would need its own balance argument, and the SQL
    // mirror expresses exactly one CASE per stat.
    for (const program of SQUAD_PROGRAMS) {
      const boosted = CORE_STATS.filter(
        (stat) => programWeight(program, stat) !== 1,
      );
      expect(boosted.length).toBeLessThanOrEqual(1);
    }
  });

  it('weights the boosted stat by exactly the boost multiplier', () => {
    expect(programWeight('running', 'AGI')).toBe(PROGRAM_BOOST_MULTIPLIER);
    expect(programWeight('strength', 'STR')).toBe(PROGRAM_BOOST_MULTIPLIER);
    expect(programWeight('walking', 'AGI')).toBe(PROGRAM_BOOST_MULTIPLIER);
    expect(programWeight('recovery', 'MND')).toBe(PROGRAM_BOOST_MULTIPLIER);
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
      statPoints: { AGI: 1_200, STR: 650, MND: 250 },
      consistencyBonus: 800,
      recBonus: 0,
      normalizationFactor: 1,
    });
    expect(total).toBe(2_900);
  });

  it('boosts only the program stat, leaving the others alone', () => {
    // Same day as above, scored on a running board: AGI 1,200 -> 1,800.
    const total = weightedBoardTotal({
      program: 'running',
      statPoints: { AGI: 1_200, STR: 650, MND: 250 },
      consistencyBonus: 800,
      recBonus: 0,
      normalizationFactor: 1,
    });
    expect(total).toBe(3_500);
  });

  it('leaves the consistency bonus unweighted', () => {
    // Universal (§5): a program tilts stats, never the reward for showing up
    // on every stat available to you. `recBonus` is still summed because the
    // stored column outlives the bonus — see WeightedBoardInput.
    const total = weightedBoardTotal({
      program: 'walking',
      statPoints: NO_POINTS,
      consistencyBonus: 800,
      recBonus: 500,
      normalizationFactor: 1,
    });
    expect(total).toBe(1_300);
  });

  it('boosts MND on a recovery board', () => {
    const total = weightedBoardTotal({
      program: 'recovery',
      statPoints: { AGI: 0, STR: 0, MND: 1_200 },
      consistencyBonus: 0,
      recBonus: 0,
      normalizationFactor: 1,
    });
    expect(total).toBe(1_800);
  });

  it('weights only the boosted stat when it is the only one scored', () => {
    const total = weightedBoardTotal({
      program: 'strength',
      statPoints: { AGI: 0, STR: 900, MND: 0 },
      consistencyBonus: 0,
      recBonus: 0,
      normalizationFactor: 1,
    });
    expect(total).toBe(1_350);
  });

  it('rounds the weighted stat sum to an integer', () => {
    // 125 * 1.5 = 187.5. The board total is an integer column, so the .5 must
    // resolve here and identically in SQL — round-half-up, away from zero.
    const total = weightedBoardTotal({
      program: 'running',
      statPoints: { AGI: 125, STR: 0, MND: 0 },
      consistencyBonus: 0,
      recBonus: 0,
      normalizationFactor: 1,
    });
    expect(total).toBe(188);
  });

  it('counts MND on every program, not only recovery', () => {
    // The board is the surface §2's normalization exists for. A stat the
    // ranking number cannot see is a stat that does not exist competitively.
    const withSleep = weightedBoardTotal({
      program: 'running',
      statPoints: { AGI: 1_200, STR: 1_200, MND: 1_200 },
      consistencyBonus: 800,
      recBonus: 0,
      normalizationFactor: 1,
    });
    const withoutSleep = weightedBoardTotal({
      program: 'running',
      statPoints: { AGI: 1_200, STR: 1_200, MND: 0 },
      consistencyBonus: 800,
      recBonus: 0,
      normalizationFactor: 1,
    });

    expect(withSleep - withoutSleep).toBe(1_200);
  });

  it('applies normalization, so a phone-only day ranks at its real total', () => {
    // Two Gold stats at factor 1.5 must rank level with three Gold stats at
    // factor 1 — the gradient §2 removes, on the surface §2 names.
    const phoneOnly = weightedBoardTotal({
      program: 'all_around',
      statPoints: { AGI: 1_200, STR: 1_200, MND: 0 },
      consistencyBonus: 800,
      recBonus: 0,
      normalizationFactor: 1.5,
    });
    const wearable = weightedBoardTotal({
      program: 'all_around',
      statPoints: { AGI: 1_200, STR: 1_200, MND: 1_200 },
      consistencyBonus: 800,
      recBonus: 0,
      normalizationFactor: 1,
    });

    expect(phoneOnly).toBe(4_400);
    expect(wearable).toBe(4_400);
  });

  it('is zero for a day with nothing on it', () => {
    expect(
      weightedBoardTotal({
        program: 'strength',
        statPoints: NO_POINTS,
        consistencyBonus: 0,
        recBonus: 0,
        normalizationFactor: 1,
      }),
    ).toBe(0);
  });
});

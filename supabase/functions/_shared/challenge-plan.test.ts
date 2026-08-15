import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_COMPLETION_XP,
  RUN_ACTIVITY_TYPE,
  STRENGTH_ACTIVITY_TYPES,
} from './core.ts';
import {
  planChallengeCompletions,
  type ChallengeArea,
  type WorkoutSession,
} from './challenge-plan.ts';

const USER = '11111111-1111-1111-1111-111111111111';
const DAY = '2026-08-15';

function run(localDate: string, distanceM: number, durationS: number): WorkoutSession {
  return { localDate, activityType: RUN_ACTIVITY_TYPE, durationS, distanceM, activeKcal: 0 };
}

function lift(localDate: string, activeKcal: number): WorkoutSession {
  return {
    localDate,
    activityType: STRENGTH_ACTIVITY_TYPES[0],
    durationS: 1_800,
    distanceM: 0,
    activeKcal,
  };
}

function plan(
  overrides: {
    optIn?: { run: boolean; strength: boolean };
    sessions?: WorkoutSession[];
    alreadyCleared?: ChallengeArea[];
  } = {},
) {
  return planChallengeCompletions({
    userId: USER,
    localDate: DAY,
    optIn: overrides.optIn ?? { run: true, strength: true },
    sessions: overrides.sessions ?? [],
    alreadyCleared: new Set(overrides.alreadyCleared ?? []),
  });
}

describe('planChallengeCompletions', () => {
  it('emits nothing when the user logged no sessions', () => {
    expect(plan()).toEqual([]);
  });

  it('clears an establish challenge on the first qualifying session', () => {
    // The cold start is impossible to fail on fitness: its job is to establish
    // a baseline, not to test the user.
    const completions = plan({ sessions: [run(DAY, 2_000, 700)] });
    expect(completions).toHaveLength(1);
    expect(completions[0]!.row).toEqual({
      user_id: USER,
      area: 'run',
      local_date: DAY,
      target: { area: 'run', kind: 'establish', minDistanceM: 1_000 },
      xp_awarded: CHALLENGE_COMPLETION_XP,
    });
  });

  it('skips an area the user has not opted into', () => {
    // A non-runner has no Run challenge to fail — the whole point of the opt-in.
    const completions = plan({
      optIn: { run: false, strength: true },
      sessions: [run(DAY, 5_000, 1_500), lift(DAY, 400)],
    });
    expect(completions.map((c) => c.row.area)).toEqual(['strength']);
  });

  it('emits nothing at all when both areas are off', () => {
    expect(
      plan({
        optIn: { run: false, strength: false },
        sessions: [run(DAY, 5_000, 1_500), lift(DAY, 400)],
      }),
    ).toEqual([]);
  });

  it('can clear both areas on one day', () => {
    const completions = plan({ sessions: [run(DAY, 5_000, 1_500), lift(DAY, 400)] });
    expect(completions.map((c) => c.row.area).sort()).toEqual(['run', 'strength']);
  });

  it('emits nothing for an area already latched today', () => {
    // The cheap half of the guard. The primary key is the correct half.
    const completions = plan({
      sessions: [run(DAY, 5_000, 1_500)],
      alreadyCleared: ['run'],
    });
    expect(completions).toEqual([]);
  });

  it('does not clear when the day’s session misses the target', () => {
    // A real target from a prior run, and today's run is slower than it.
    const completions = plan({
      optIn: { run: true, strength: false },
      sessions: [run('2026-08-14', 5_000, 1_500), run(DAY, 5_000, 1_800)],
    });
    expect(completions).toEqual([]);
  });

  it('clears when the day’s session beats the target', () => {
    const completions = plan({
      optIn: { run: true, strength: false },
      sessions: [run('2026-08-14', 5_000, 1_500), run(DAY, 5_000, 1_400)],
    });
    expect(completions).toHaveLength(1);
    expect(completions[0]!.row.target).toMatchObject({ area: 'run', kind: 'target' });
  });

  it('never lets today’s session move the bar it is judged against', () => {
    // The strictly-before rule, at the level the planner sees it. A blistering
    // run today must not raise the median that decides whether it cleared.
    const withHistory = plan({
      optIn: { run: true, strength: false },
      sessions: [run('2026-08-14', 5_000, 1_500), run(DAY, 5_000, 1_400)],
    });
    const target = withHistory[0]!.row.target;
    if (target.kind !== 'target' || target.area !== 'run') throw new Error('shape');
    // 300 s/km median, less the 3% step.
    expect(target.paceSecPerKm).toBeCloseTo(291, 6);
  });

  it('snapshots the target that was actually cleared', () => {
    // The trailing median moves, so it can no longer answer "what did I clear
    // in March" after the fact. This row is the only record.
    const completions = plan({
      optIn: { run: false, strength: true },
      sessions: [lift('2026-08-14', 400), lift(DAY, 500)],
    });
    expect(completions[0]!.row.target).toEqual({
      area: 'strength',
      kind: 'target',
      activeKcal: 410,
    });
  });

  it('pays the flat challenge XP, from the one constant', () => {
    const completions = plan({ sessions: [lift(DAY, 300)] });
    expect(completions[0]!.row.xp_awarded).toBe(CHALLENGE_COMPLETION_XP);
    expect(CHALLENGE_COMPLETION_XP).toBe(40);
  });

  it('pays once for two qualifying sessions on the same day', () => {
    // The latch is one clear per area per local day. Correct rather than
    // stingy: both sessions have already moved tomorrow's median.
    const completions = plan({
      optIn: { run: false, strength: true },
      sessions: [lift(DAY, 400), lift(DAY, 600)],
    });
    expect(completions).toHaveLength(1);
  });

  it('ignores a clearing session from another day', () => {
    const completions = plan({
      optIn: { run: false, strength: true },
      sessions: [lift('2026-08-14', 400)],
    });
    expect(completions).toEqual([]);
  });

  it('is stable on a re-run, given the latch the handler passes back', () => {
    // The idempotency the hourly cron depends on: plan, latch, plan again.
    const sessions = [run(DAY, 5_000, 1_500), lift(DAY, 400)];
    const first = plan({ sessions });
    const areas = first.map((c) => c.row.area);
    const second = plan({ sessions, alreadyCleared: areas });
    expect(second).toEqual([]);
  });
});

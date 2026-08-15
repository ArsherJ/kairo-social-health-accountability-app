import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_BASELINE_SESSIONS,
  CHALLENGE_STEP,
  CHALLENGE_WINDOW_DAYS,
  RUN_ACTIVITY_TYPE,
  RUN_MIN_DISTANCE_M,
  STRENGTH_ACTIVITY_TYPES,
  challengeMet,
  clearingSession,
  distanceLabel,
  paceLabel,
  resolveChallenge,
  type WorkoutSession,
} from './challenge.ts';

const TODAY = '2026-08-15';

/** A run of `distanceM` metres in `durationS` seconds. */
function run(
  localDate: string,
  distanceM: number,
  durationS: number,
): WorkoutSession {
  return { localDate, activityType: RUN_ACTIVITY_TYPE, durationS, distanceM, activeKcal: 0 };
}

/** A strength session burning `activeKcal`. */
function lift(localDate: string, activeKcal: number): WorkoutSession {
  return {
    localDate,
    activityType: STRENGTH_ACTIVITY_TYPES[0],
    durationS: 1_800,
    distanceM: 0,
    activeKcal,
  };
}

/** A 5 km run at exactly 5:00/km. */
function fiveK(localDate: string, paceSecPerKm = 300): WorkoutSession {
  return run(localDate, 5_000, paceSecPerKm * 5);
}

describe('resolveChallenge — cold start', () => {
  it('asks a runner to establish a baseline, with no pace bar at all', () => {
    // The first challenge's job is to *establish* a baseline, not to test the
    // user, so it must be impossible to fail on fitness.
    expect(resolveChallenge('run', [], TODAY)).toEqual({
      area: 'run',
      kind: 'establish',
      minDistanceM: RUN_MIN_DISTANCE_M,
    });
  });

  it('asks a lifter to log one session', () => {
    expect(resolveChallenge('strength', [], TODAY)).toEqual({
      area: 'strength',
      kind: 'establish',
    });
  });

  it('stays at establish when the only sessions do not qualify', () => {
    const tooShort = run('2026-08-14', 800, 300);
    const noEnergy = lift('2026-08-14', 0);
    expect(resolveChallenge('run', [tooShort], TODAY).kind).toBe('establish');
    expect(resolveChallenge('strength', [noEnergy], TODAY).kind).toBe('establish');
  });

  it('ignores the other area’s sessions entirely', () => {
    expect(resolveChallenge('run', [lift('2026-08-14', 400)], TODAY).kind).toBe('establish');
    expect(resolveChallenge('strength', [fiveK('2026-08-14')], TODAY).kind).toBe('establish');
  });
});

describe('resolveChallenge — the strictly-before rule', () => {
  it('never lets a session move its own bar', () => {
    // Without this, a great run raises the median that decides whether that
    // same run cleared anything.
    const today = fiveK(TODAY, 240);
    const before = fiveK('2026-08-14', 300);

    const withToday = resolveChallenge('run', [before, today], TODAY);
    const withoutToday = resolveChallenge('run', [before], TODAY);
    expect(withToday).toEqual(withoutToday);
  });

  it('excludes sessions after the day being judged', () => {
    const future = fiveK('2026-08-20', 200);
    expect(resolveChallenge('run', [future], TODAY).kind).toBe('establish');
  });

  it('includes the day immediately before', () => {
    expect(resolveChallenge('run', [fiveK('2026-08-14')], TODAY).kind).toBe('target');
  });
});

describe('resolveChallenge — the window', () => {
  it('ignores a session older than the window', () => {
    // 91 days before today, with a 90-day window.
    const ancient = fiveK('2026-05-16');
    expect(ancient.localDate < TODAY).toBe(true);
    expect(resolveChallenge('run', [ancient], TODAY).kind).toBe('establish');
  });

  it('includes a session on the window’s first day', () => {
    // The boundary is inclusive at the far end: exactly CHALLENGE_WINDOW_DAYS
    // before today still counts.
    const edge = '2026-05-17';
    expect(CHALLENGE_WINDOW_DAYS).toBe(90);
    expect(resolveChallenge('run', [fiveK(edge)], TODAY).kind).toBe('target');
  });
});

describe('resolveChallenge — run targets', () => {
  it('sets a pace 3% faster than the median', () => {
    const challenge = resolveChallenge('run', [fiveK('2026-08-14', 300)], TODAY);
    expect(challenge).toMatchObject({ area: 'run', kind: 'target' });
    if (challenge.kind !== 'target' || challenge.area !== 'run') throw new Error('shape');
    expect(challenge.paceSecPerKm).toBeCloseTo(300 * (1 - CHALLENGE_STEP), 6);
  });

  it('takes the median, not the mean, so one exceptional run cannot ratchet', () => {
    // Three easy runs and one blistering one. A mean would chase the outlier
    // and make the app permanently harder; the median ignores it.
    const sessions = [
      fiveK('2026-08-10', 300),
      fiveK('2026-08-11', 300),
      fiveK('2026-08-12', 300),
      fiveK('2026-08-13', 120),
    ];
    const challenge = resolveChallenge('run', sessions, TODAY);
    if (challenge.kind !== 'target' || challenge.area !== 'run') throw new Error('shape');
    // Median of [120, 300, 300, 300] is 300 — the mean of the two middle values.
    expect(challenge.paceSecPerKm).toBeCloseTo(300 * (1 - CHALLENGE_STEP), 6);
  });

  it('averages the two middle values on an even count', () => {
    const sessions = [fiveK('2026-08-13', 300), fiveK('2026-08-14', 200)];
    const challenge = resolveChallenge('run', sessions, TODAY);
    if (challenge.kind !== 'target' || challenge.area !== 'run') throw new Error('shape');
    expect(challenge.paceSecPerKm).toBeCloseTo(250 * (1 - CHALLENGE_STEP), 6);
  });

  it('uses only the most recent baseline-sized slice', () => {
    // Six sessions: five recent slow ones and one ancient fast one. Only the
    // five most recent count, so the old one cannot drag the target.
    const sessions = [
      fiveK('2026-08-01', 120),
      fiveK('2026-08-10', 300),
      fiveK('2026-08-11', 300),
      fiveK('2026-08-12', 300),
      fiveK('2026-08-13', 300),
      fiveK('2026-08-14', 300),
    ];
    expect(CHALLENGE_BASELINE_SESSIONS).toBe(5);
    const challenge = resolveChallenge('run', sessions, TODAY);
    if (challenge.kind !== 'target' || challenge.area !== 'run') throw new Error('shape');
    expect(challenge.paceSecPerKm).toBeCloseTo(300 * (1 - CHALLENGE_STEP), 6);
  });

  it('gives a real target on the second run rather than a second prompt', () => {
    // "Up to" five, deliberately: a user who has run once gets a target next
    // time, not four more establish-a-baseline prompts.
    const challenge = resolveChallenge('run', [fiveK('2026-08-14', 330)], TODAY);
    expect(challenge.kind).toBe('target');
  });

  it('eases when the recent window slows down', () => {
    // No ratchet to guard against, because there is no ratchet: a quiet stretch
    // lowers the trailing median, which lowers the target.
    const fast = resolveChallenge('run', [fiveK('2026-08-13', 260)], TODAY);
    const slow = resolveChallenge('run', [fiveK('2026-08-13', 400)], TODAY);
    if (fast.kind !== 'target' || fast.area !== 'run') throw new Error('shape');
    if (slow.kind !== 'target' || slow.area !== 'run') throw new Error('shape');
    expect(slow.paceSecPerKm).toBeGreaterThan(fast.paceSecPerKm);
  });

  it('floors the distance at the median rounded down to 500 m', () => {
    const challenge = resolveChallenge('run', [run('2026-08-14', 7_400, 2_220)], TODAY);
    if (challenge.kind !== 'target' || challenge.area !== 'run') throw new Error('shape');
    expect(challenge.minDistanceM).toBe(7_000);
  });

  it('never floors below the minimum qualifying distance', () => {
    // A 1.2 km median rounds down to 1,000, not to 1,000-and-something odd —
    // and never below the distance that qualifies a run at all.
    const challenge = resolveChallenge('run', [run('2026-08-14', 1_200, 400)], TODAY);
    if (challenge.kind !== 'target' || challenge.area !== 'run') throw new Error('shape');
    expect(challenge.minDistanceM).toBe(RUN_MIN_DISTANCE_M);
  });

  it('raises the floor as the user goes further, so it stays meaningful', () => {
    const challenge = resolveChallenge('run', [run('2026-08-14', 10_200, 3_060)], TODAY);
    if (challenge.kind !== 'target' || challenge.area !== 'run') throw new Error('shape');
    expect(challenge.minDistanceM).toBe(10_000);
  });

  it('ignores a run under the qualifying distance when taking the median', () => {
    const sessions = [run('2026-08-13', 500, 600), fiveK('2026-08-14', 300)];
    const challenge = resolveChallenge('run', sessions, TODAY);
    if (challenge.kind !== 'target' || challenge.area !== 'run') throw new Error('shape');
    // The 500 m jog paces at 1,200 s/km and would wreck the median if counted.
    expect(challenge.paceSecPerKm).toBeCloseTo(300 * (1 - CHALLENGE_STEP), 6);
  });
});

describe('resolveChallenge — strength targets', () => {
  it('sets calories 3% above the median, rounded to 5', () => {
    const challenge = resolveChallenge('strength', [lift('2026-08-14', 400)], TODAY);
    expect(challenge).toMatchObject({ area: 'strength', kind: 'target' });
    if (challenge.kind !== 'target' || challenge.area !== 'strength') throw new Error('shape');
    // 400 * 1.03 = 412 → 410 at the nearest 5.
    expect(challenge.activeKcal).toBe(410);
  });

  it('takes the median, not the mean', () => {
    const sessions = [
      lift('2026-08-10', 300),
      lift('2026-08-11', 300),
      lift('2026-08-12', 300),
      lift('2026-08-13', 1_500),
    ];
    const challenge = resolveChallenge('strength', sessions, TODAY);
    if (challenge.kind !== 'target' || challenge.area !== 'strength') throw new Error('shape');
    // Median 300 → 309 → 310.
    expect(challenge.activeKcal).toBe(310);
  });

  it('counts every strength activity type', () => {
    for (const activityType of STRENGTH_ACTIVITY_TYPES) {
      const session = { ...lift('2026-08-14', 400), activityType };
      expect(resolveChallenge('strength', [session], TODAY).kind).toBe('target');
    }
  });

  it('eases when the recent window gets lighter', () => {
    const heavy = resolveChallenge('strength', [lift('2026-08-13', 600)], TODAY);
    const light = resolveChallenge('strength', [lift('2026-08-13', 200)], TODAY);
    if (heavy.kind !== 'target' || heavy.area !== 'strength') throw new Error('shape');
    if (light.kind !== 'target' || light.area !== 'strength') throw new Error('shape');
    expect(light.activeKcal).toBeLessThan(heavy.activeKcal);
  });
});

describe('challengeMet', () => {
  it('clears an establish run with any qualifying run', () => {
    const challenge = resolveChallenge('run', [], TODAY);
    expect(challengeMet(challenge, run(TODAY, 1_000, 600))).toBe(true);
    expect(challengeMet(challenge, run(TODAY, 999, 300))).toBe(false);
  });

  it('clears an establish strength session with any qualifying session', () => {
    const challenge = resolveChallenge('strength', [], TODAY);
    expect(challengeMet(challenge, lift(TODAY, 1))).toBe(true);
    expect(challengeMet(challenge, lift(TODAY, 0))).toBe(false);
  });

  it('needs both the distance floor and the pace on a run target', () => {
    const challenge = resolveChallenge('run', [fiveK('2026-08-14', 300)], TODAY);
    if (challenge.kind !== 'target' || challenge.area !== 'run') throw new Error('shape');

    // Fast enough and far enough.
    expect(challengeMet(challenge, run(TODAY, 5_000, 1_400))).toBe(true);
    // Fast enough but short of the floor.
    expect(challengeMet(challenge, run(TODAY, 2_000, 560))).toBe(false);
    // Far enough but too slow.
    expect(challengeMet(challenge, run(TODAY, 5_000, 1_600))).toBe(false);
  });

  it('treats a pace exactly on target as met', () => {
    const challenge = resolveChallenge('run', [fiveK('2026-08-14', 300)], TODAY);
    if (challenge.kind !== 'target' || challenge.area !== 'run') throw new Error('shape');
    const exact = run(TODAY, 5_000, challenge.paceSecPerKm * 5);
    expect(challengeMet(challenge, exact)).toBe(true);
  });

  it('treats calories exactly on target as met', () => {
    const challenge = resolveChallenge('strength', [lift('2026-08-14', 400)], TODAY);
    if (challenge.kind !== 'target' || challenge.area !== 'strength') throw new Error('shape');
    expect(challengeMet(challenge, lift(TODAY, challenge.activeKcal))).toBe(true);
    expect(challengeMet(challenge, lift(TODAY, challenge.activeKcal - 1))).toBe(false);
  });

  it('never clears an area with the other area’s session', () => {
    const runChallenge = resolveChallenge('run', [], TODAY);
    const liftChallenge = resolveChallenge('strength', [], TODAY);
    expect(challengeMet(runChallenge, lift(TODAY, 500))).toBe(false);
    expect(challengeMet(liftChallenge, fiveK(TODAY))).toBe(false);
  });
});

describe('clearingSession', () => {
  it('finds the session on the day that cleared the challenge', () => {
    const challenge = resolveChallenge('run', [fiveK('2026-08-14', 300)], TODAY);
    const winner = run(TODAY, 5_000, 1_400);
    const sessions = [fiveK('2026-08-14', 300), run(TODAY, 5_000, 1_800), winner];
    expect(clearingSession(challenge, sessions, TODAY)).toEqual(winner);
  });

  it('returns null when nothing that day cleared it', () => {
    const challenge = resolveChallenge('run', [fiveK('2026-08-14', 240)], TODAY);
    const sessions = [run(TODAY, 5_000, 1_800)];
    expect(clearingSession(challenge, sessions, TODAY)).toBeNull();
  });

  it('ignores a clearing session on a different day', () => {
    const challenge = resolveChallenge('run', [], TODAY);
    expect(clearingSession(challenge, [run('2026-08-14', 5_000, 1_500)], TODAY)).toBeNull();
  });

  it('returns null on an empty day', () => {
    const challenge = resolveChallenge('strength', [], TODAY);
    expect(clearingSession(challenge, [], TODAY)).toBeNull();
  });
});

describe('the curve', () => {
  it('gets harder each time it is cleared, with no stored level counter', () => {
    // Clearing moves the median, which is the entire progression mechanism.
    const first = resolveChallenge('strength', [lift('2026-08-12', 400)], '2026-08-13');
    if (first.kind !== 'target' || first.area !== 'strength') throw new Error('shape');

    const cleared = lift('2026-08-13', first.activeKcal);
    const second = resolveChallenge(
      'strength',
      [lift('2026-08-12', 400), cleared],
      '2026-08-14',
    );
    if (second.kind !== 'target' || second.area !== 'strength') throw new Error('shape');
    expect(second.activeKcal).toBeGreaterThan(first.activeKcal);
  });
});

describe('paceLabel', () => {
  it('formats minutes and seconds with a padded second', () => {
    expect(paceLabel(291)).toBe('4:51');
    expect(paceLabel(305)).toBe('5:05');
  });

  it('carries rather than printing a sixtieth second', () => {
    // 4:59.6 is 5:00, never 4:60.
    expect(paceLabel(299.6)).toBe('5:00');
  });

  it('handles a whole number of minutes', () => {
    expect(paceLabel(300)).toBe('5:00');
  });

  it('handles a pace over ten minutes', () => {
    expect(paceLabel(632)).toBe('10:32');
  });
});

describe('distanceLabel', () => {
  it('trims a trailing zero', () => {
    expect(distanceLabel(7_000)).toBe('7 km');
    expect(distanceLabel(1_000)).toBe('1 km');
  });

  it('keeps a half kilometre', () => {
    expect(distanceLabel(7_500)).toBe('7.5 km');
  });
});

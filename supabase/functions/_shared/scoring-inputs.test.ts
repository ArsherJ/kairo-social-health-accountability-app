import { describe, expect, it } from 'vitest';
import {
  DAILY_SLEEP_SELECT,
  SLEEP_CAPABILITY_WINDOW_DAYS,
  WORKOUT_SESSION_SELECT,
  WORKOUT_SOURCE_ALLOWLIST,
  capabilityWindowStart,
  earnableStatsFor,
  scoringSleepDates,
  scoringSleepMinutes,
  verifiedStrengthMinutesFrom,
  type DailySleepRow,
  type WorkoutSessionRow,
} from './scoring-inputs.ts';
import { planDay, type DayPlanInput } from './sync-plan.ts';
import { RUN_ACTIVITY_TYPE, STRENGTH_ACTIVITY_TYPES } from './core.ts';

const DAY = '2026-07-27';

function session(overrides: Record<string, unknown> = {}) {
  return {
    activity_type: STRENGTH_ACTIVITY_TYPES[0]!,
    duration_s: 3_600,
    source_bundle_id: WORKOUT_SOURCE_ALLOWLIST[0]!,
    was_user_entered: false,
    has_heart_rate_evidence: true,
    ...overrides,
  };
}

describe('capabilityWindowStart', () => {
  it('opens the window SLEEP_CAPABILITY_WINDOW_DAYS back, inclusive of the scored day', () => {
    // The window is a fortnight *counting the scored date itself*, so the
    // start is 13 days back and not 14. Off by one here and the query either
    // reads a night that no longer counts or misses the one that does.
    expect(capabilityWindowStart(DAY)).toBe('2026-07-14');
    expect(SLEEP_CAPABILITY_WINDOW_DAYS).toBe(14);
  });

  it('crosses a month boundary', () => {
    expect(capabilityWindowStart('2026-03-05')).toBe('2026-02-20');
  });
});

describe('earnableStatsFor', () => {
  it('counts three stats when scoring sleep landed inside the window', () => {
    expect(earnableStatsFor(['2026-07-20'], DAY)).toBe(3);
  });

  it('counts two when the window is empty', () => {
    expect(earnableStatsFor([], DAY)).toBe(2);
  });

  it('measures the window from the date being scored, never from wall-clock today', () => {
    // A backfill is the only place these differ, and it is the whole reason
    // this wrapper exists: sleep from July still makes MND *score* on a July
    // date, so it must also make MND *earnable* on that date. Judged against
    // an August "today" the window is empty, the day is normalized as
    // two-stat, and it pays 6,200 against a 4,400 ceiling with
    // contributing_stats at 3 — which the check constraint waves through.
    expect(earnableStatsFor(['2026-07-20'], '2026-07-27')).toBe(3);
    expect(earnableStatsFor(['2026-07-20'], '2026-08-19')).toBe(2);
  });
});

describe('verifiedStrengthMinutesFrom', () => {
  it('converts SECONDS to minutes', () => {
    // `workout_sessions.duration_s` is seconds; the shift is priced in
    // minutes. Reading the column as minutes hands a one-hour session a 60x
    // shift, which the 25% cap silently absorbs into "always maxed" — a
    // scoring error with no symptom.
    expect(verifiedStrengthMinutesFrom([session({ duration_s: 3_600 })])).toBe(60);
    expect(verifiedStrengthMinutesFrom([session({ duration_s: 1_800 })])).toBe(30);
  });

  it('sums every verified session on the date', () => {
    expect(
      verifiedStrengthMinutesFrom([
        session({ duration_s: 1_200 }),
        session({ duration_s: 600 }),
      ]),
    ).toBe(30);
  });

  it('ignores a session with no heart-rate evidence', () => {
    // §3: a workout needs its source allowlisted AND heart-rate evidence.
    // The shift is worth up to 25% of a band, which is too much to hand to an
    // unverified claim.
    expect(
      verifiedStrengthMinutesFrom([session({ has_heart_rate_evidence: false })]),
    ).toBe(0);
  });

  it('ignores a hand-typed session', () => {
    expect(verifiedStrengthMinutesFrom([session({ was_user_entered: true })])).toBe(0);
  });

  it('ignores a session from an unrecognised source', () => {
    // Inert, never inflationary: an unknown source is `flagged`, which is not
    // `trusted`, so it shifts nothing. That is what makes seeding the
    // allowlist conservatively safe.
    expect(
      verifiedStrengthMinutesFrom([session({ source_bundle_id: 'com.example.faker' })]),
    ).toBe(0);
    expect(verifiedStrengthMinutesFrom([session({ source_bundle_id: null })])).toBe(0);
  });

  it('treats the columns the expand migration added as unverified when NULL', () => {
    // Every row written before that migration has all three NULL, and every
    // row written before the client learns to send them does too. Null must
    // read as "no evidence", never as "no objection".
    expect(
      verifiedStrengthMinutesFrom([
        session({
          source_bundle_id: null,
          was_user_entered: null,
          has_heart_rate_evidence: null,
        }),
      ]),
    ).toBe(0);
  });

  it('never allowlists the Health app, which is where hand entry comes from', () => {
    expect(WORKOUT_SOURCE_ALLOWLIST).not.toContain('com.apple.Health');
  });
});

describe('scoringSleepDates and scoringSleepMinutes', () => {
  function night(overrides: Partial<DailySleepRow> = {}): DailySleepRow {
    return { local_date: DAY, minutes: 480, was_user_entered: false, ...overrides };
  }

  it('counts a measured night, both as capability and as minutes', () => {
    expect(scoringSleepDates([night()])).toEqual([DAY]);
    expect(scoringSleepMinutes([night()], DAY)).toBe(480);
  });

  it('discards a hand-typed night from BOTH answers at once', () => {
    // The pair is the point. Excluding a night from capability while still
    // scoring it — or the reverse — is the 6,200-against-4,400 breach.
    const typed = [night({ was_user_entered: true })];
    expect(scoringSleepDates(typed)).toEqual([]);
    expect(scoringSleepMinutes(typed, DAY)).toBeNull();
  });

  it('keeps a NULL flag eligible, which is every row written before the switch', () => {
    // The expand migration adds the column nullable and the existing cohort's
    // client does not send it. Reading NULL as hand-typed would silently
    // un-score a fortnight of real nights for everyone already using Kairo.
    const legacy = [night({ was_user_entered: null })];
    expect(scoringSleepDates(legacy)).toEqual([DAY]);
    expect(scoringSleepMinutes(legacy, DAY)).toBe(480);
  });

  it('treats zero minutes as no data on both sides', () => {
    const empty = [night({ minutes: 0 })];
    expect(scoringSleepDates(empty)).toEqual([]);
    expect(scoringSleepMinutes(empty, DAY)).toBeNull();
  });

  it('reads minutes PostgREST widened to a string', () => {
    expect(scoringSleepMinutes([night({ minutes: '480' })], DAY)).toBe(480);
  });

  it('returns null when the scored date has no row in the window', () => {
    // The query spans a fortnight, so rows for other dates are the normal
    // case. Picking any of them would score last Tuesday's sleep today.
    expect(scoringSleepMinutes([night({ local_date: '2026-07-20' })], DAY)).toBeNull();
    expect(scoringSleepDates([night({ local_date: '2026-07-20' })])).toEqual([
      '2026-07-20',
    ]);
  });
});

describe('the hand-typed night lands on 4,400, never 6,200', () => {
  // Both halves of the gate, driven end to end through the same functions the
  // Edge Function calls — the capability window and the scored day's minutes
  // both derived from one stored row, then handed to planDay.
  //
  // A gold AGI + gold STR day, with a hand-typed eight hours on top:
  //   gated:   (1,200 x 2) x 1.5 + 800 = 4,400   <- the stated ceiling
  //   ungated: (1,200 x 3) x 1.5 + 800 = 6,200   <- the breach, and
  //            contributing_stats is 3, so the check constraint passes it.

  const WINDOW: DailySleepRow[] = [
    { local_date: DAY, minutes: 480, was_user_entered: true },
  ];

  function goldDay(overrides: Partial<DayPlanInput>): DayPlanInput {
    return {
      userId: 'me',
      localDate: DAY,
      timeZone: 'Asia/Manila',
      now: new Date('2026-07-27T12:00:00Z'),
      // 12 hours x 900 steps clears AGI gold; 400 kcal clears STR gold.
      buckets: Array.from({ length: 12 }, (_, hour) => ({
        hour: hour + 8,
        steps: 900,
        distanceM: 650,
        activeKcal: hour === 0 ? 400 : 0,
        activeMinutes: hour === 0 ? 45 : 0,
      })),
      hadWorkoutHours: new Set<number>(),
      elevatedHeartRateHours: new Set<number>(),
      sleepMinutes: null,
      earnableStats: 3,
      verifiedStrengthMinutes: 0,
      existingStatus: null,
      ...overrides,
    };
  }

  it('scores two stats at factor 1.5 and lands on the ceiling', () => {
    const { row } = planDay(
      goldDay({
        sleepMinutes: scoringSleepMinutes(WINDOW, DAY),
        earnableStats: earnableStatsFor(scoringSleepDates(WINDOW), DAY),
      }),
    );

    expect(scoringSleepMinutes(WINDOW, DAY)).toBeNull();
    expect(scoringSleepDates(WINDOW)).toEqual([]);
    expect(row.tiers.AGI).toBe('gold');
    expect(row.tiers.STR).toBe('gold');
    expect(row.tiers.MND).toBe('none');
    expect(row.mind_points).toBe(0);
    expect(row.contributing_stats).toBe(2);
    expect(row.normalization_factor).toBeCloseTo(1.5, 5);
    expect(row.total).toBe(4_400);
  });

  it('would pay 6,200 if the night scored while the window still excluded it', () => {
    // The negative control, spelled out so the assertion above cannot be
    // satisfied by a day that was never near the ceiling. This is the exact
    // arithmetic the gate exists to prevent, not a hypothetical.
    const { row } = planDay(
      goldDay({
        sleepMinutes: 480,
        earnableStats: earnableStatsFor(scoringSleepDates(WINDOW), DAY),
      }),
    );
    expect(row.contributing_stats).toBe(3);
    expect(row.total).toBe(6_200);
  });
});

describe('the PostgREST select lists cannot drift from the row types', () => {
  // M1: `readScoringInputs` casts PostgREST output to these row types and a
  // cast checks nothing. A renamed column yields undefined on every field,
  // `Number(undefined ?? 0)` is 0 and `Boolean(undefined)` is false — a
  // silently zero shift and a silently unscored night, with no error.
  //
  // Each fixture below is built by **parsing the select string**, so a column
  // that drifts out of it drops out of the fixture and the assertion fails.
  // The reverse direction — a field on the row type that nobody selects — is
  // a compile-time error in scoring-inputs.ts.

  function rowFrom<T>(select: string, values: Record<string, unknown>): T {
    const columns = select.split(',').map((c) => c.trim());
    return Object.fromEntries(columns.map((c) => [c, values[c]])) as T;
  }

  it('selects every column verifiedStrengthMinutesFrom actually reads', () => {
    const verified = rowFrom<WorkoutSessionRow>(WORKOUT_SESSION_SELECT, {
      activity_type: STRENGTH_ACTIVITY_TYPES[0]!,
      duration_s: 3_600,
      source_bundle_id: WORKOUT_SOURCE_ALLOWLIST[0]!,
      was_user_entered: false,
      has_heart_rate_evidence: true,
    });
    expect(verifiedStrengthMinutesFrom([verified])).toBe(60);
  });

  it('selects was_user_entered, which a positive fixture alone would not prove', () => {
    // Drop that column from the select and the fixture loses the key, so
    // `Boolean(undefined)` reads false and the hand-typed session verifies.
    // The test above would still pass; this one is why it cannot.
    const typed = rowFrom<WorkoutSessionRow>(WORKOUT_SESSION_SELECT, {
      activity_type: STRENGTH_ACTIVITY_TYPES[0]!,
      duration_s: 3_600,
      source_bundle_id: WORKOUT_SOURCE_ALLOWLIST[0]!,
      was_user_entered: true,
      has_heart_rate_evidence: true,
    });
    expect(verifiedStrengthMinutesFrom([typed])).toBe(0);
  });

  it('selects every column the sleep gate reads', () => {
    const measured = rowFrom<DailySleepRow>(DAILY_SLEEP_SELECT, {
      local_date: DAY,
      minutes: 480,
      was_user_entered: false,
    });
    expect(scoringSleepDates([measured])).toEqual([DAY]);
    expect(scoringSleepMinutes([measured], DAY)).toBe(480);

    const typed = rowFrom<DailySleepRow>(DAILY_SLEEP_SELECT, {
      local_date: DAY,
      minutes: 480,
      was_user_entered: true,
    });
    expect(scoringSleepDates([typed])).toEqual([]);
    expect(scoringSleepMinutes([typed], DAY)).toBeNull();
  });
});

describe('a stored workout session now moves STR, and only when verified', () => {
  // Step 5's proof that the transport is actually closed. Task 3 wired the
  // read and nothing wrote it, so `workoutVerified` was false for every
  // session forever and the shift was structurally zero — a §3 mechanism dead
  // on arrival. This drives a `workout_sessions` row of the shape the client
  // now sends all the way to a tier, so the shift cannot go back to inert
  // without a red test.

  /** 300 kcal: STR silver on the plain ladder, gold with the full shift. */
  function at300(): DayPlanInput {
    return {
      userId: 'me',
      localDate: DAY,
      timeZone: 'Asia/Manila',
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: [
        { hour: 9, steps: 400, distanceM: 300, activeKcal: 300, activeMinutes: 45 },
      ],
      hadWorkoutHours: new Set<number>(),
      elevatedHeartRateHours: new Set<number>(),
      sleepMinutes: null,
      earnableStats: 3,
      verifiedStrengthMinutes: 0,
      existingStatus: null,
    };
  }

  function tierFromSessions(rows: WorkoutSessionRow[]): string {
    return planDay({
      ...at300(),
      verifiedStrengthMinutes: verifiedStrengthMinutesFrom(rows),
    }).row.tiers.STR;
  }

  // A run reports its calories honestly through `active_kcal`, so crediting
  // its minutes as well would pay twice for one effort. This is the assertion
  // that keeps the type filter in place.
  it('credits nothing for a verified run, however long', () => {
    expect(
      verifiedStrengthMinutesFrom([
        session({ activity_type: RUN_ACTIVITY_TYPE, duration_s: 7_200 }) as WorkoutSessionRow,
      ]),
    ).toBe(0);
  });

  it('moves STR silver to gold for an allowlisted session with heart-rate evidence', () => {
    expect(tierFromSessions([session() as WorkoutSessionRow])).toBe('gold');
  });

  it('leaves STR at silver for the same hour recorded without heart rate', () => {
    expect(
      tierFromSessions([session({ has_heart_rate_evidence: false }) as WorkoutSessionRow]),
    ).toBe('silver');
  });

  it('leaves STR at silver for a hand-typed hour', () => {
    expect(
      tierFromSessions([session({ was_user_entered: true }) as WorkoutSessionRow]),
    ).toBe('silver');
  });

  it('leaves STR at silver for an unrecognised source', () => {
    expect(
      tierFromSessions([session({ source_bundle_id: 'com.example.faker' }) as WorkoutSessionRow]),
    ).toBe('silver');
  });

  it('leaves STR at silver for the pre-migration NULLs', () => {
    // Which is what every existing row reads, and what an un-updated client
    // keeps writing. Inert, never inflationary.
    expect(
      tierFromSessions([
        session({
          source_bundle_id: null,
          was_user_entered: null,
          has_heart_rate_evidence: null,
        }) as WorkoutSessionRow,
      ]),
    ).toBe('silver');
  });
});

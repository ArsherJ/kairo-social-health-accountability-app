import { describe, expect, it } from 'vitest';
import {
  MAX_BUCKETS_PER_SYNC,
  MAX_SESSIONS_PER_SYNC,
  affectedDates,
  isDayFlagged,
  observesWearable,
  planDay,
  validateSyncRequest,
  type DayPlanInput,
  type IncomingBucket,
} from './sync-plan.ts';
import type { SyncRequest } from './sync-plan.ts';
import type { HourBucket } from './core.ts';

const MANILA = 'Asia/Manila';
const DAY = '2026-07-27';

function bucket(overrides: Partial<IncomingBucket> = {}): IncomingBucket {
  return {
    localDate: DAY,
    hour: 9,
    steps: 500,
    distanceM: 350,
    activeKcal: 20,
    activeMinutes: 5,
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return { timezone: MANILA, buckets: [bucket()], ...overrides };
}

describe('validateSyncRequest', () => {
  it('accepts a well-formed payload', () => {
    const result = validateSyncRequest(body());
    expect(result.ok).toBe(true);
  });

  it('rejects a non-object body', () => {
    expect(validateSyncRequest(null).ok).toBe(false);
    expect(validateSyncRequest('nope').ok).toBe(false);
  });

  it('requires a timezone', () => {
    const result = validateSyncRequest({ buckets: [] });
    expect(result).toEqual({ ok: false, error: 'timezone is required' });
  });

  it('rejects a bogus timezone rather than silently defaulting to UTC', () => {
    // Falling back to UTC would shift every day boundary for this user by
    // eight hours and quietly corrupt their scores.
    const result = validateSyncRequest(body({ timezone: 'Mars/Olympus_Mons' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown timezone/);
  });

  it('accepts the zones an OFW squad spans', () => {
    for (const tz of ['Asia/Manila', 'Asia/Dubai', 'America/New_York']) {
      expect(validateSyncRequest(body({ timezone: tz })).ok).toBe(true);
    }
  });

  it('rejects a malformed date', () => {
    const result = validateSyncRequest(body({ buckets: [bucket({ localDate: '27-07-2026' })] }));
    expect(result.ok).toBe(false);
  });

  it('rejects an out-of-range hour', () => {
    for (const hour of [-1, 24, 9.5]) {
      expect(validateSyncRequest(body({ buckets: [bucket({ hour })] })).ok).toBe(false);
    }
  });

  it('rejects negative metrics', () => {
    expect(validateSyncRequest(body({ buckets: [bucket({ steps: -10 })] })).ok).toBe(false);
    expect(validateSyncRequest(body({ buckets: [bucket({ activeKcal: -1 })] })).ok).toBe(false);
  });

  it('rejects NaN and Infinity', () => {
    expect(validateSyncRequest(body({ buckets: [bucket({ steps: NaN })] })).ok).toBe(false);
    expect(
      validateSyncRequest(body({ buckets: [bucket({ steps: Infinity })] })).ok,
    ).toBe(false);
  });

  it('caps payload size', () => {
    const many = Array.from({ length: MAX_BUCKETS_PER_SYNC + 1 }, () => bucket());
    const result = validateSyncRequest(body({ buckets: many }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too many buckets/);
  });

  it('clamps active minutes to the hour rather than failing the sync', () => {
    // HealthKit aggregation can round to 60.0000001; a hard reject would drop
    // the whole payload over a rounding artefact.
    const result = validateSyncRequest(body({ buckets: [bucket({ activeMinutes: 75 })] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.buckets[0]!.activeMinutes).toBe(60);
  });

  it('rounds fractional steps', () => {
    const result = validateSyncRequest(body({ buckets: [bucket({ steps: 500.7 })] }));
    if (result.ok) expect(result.value.buckets[0]!.steps).toBe(501);
  });

  it('defaults the corroborating flags to false', () => {
    const result = validateSyncRequest(body());
    if (result.ok) {
      expect(result.value.buckets[0]!.hadWorkout).toBe(false);
      expect(result.value.buckets[0]!.elevatedHeartRate).toBe(false);
    }
  });

  it('accepts sleep and rejects impossible durations', () => {
    expect(
      validateSyncRequest(body({ sleep: [{ localDate: DAY, minutes: 430 }] })).ok,
    ).toBe(true);
    expect(
      validateSyncRequest(body({ sleep: [{ localDate: DAY, minutes: 1441 }] })).ok,
    ).toBe(false);
  });

  it('treats absent sleep as absent, not zero', () => {
    const result = validateSyncRequest(body());
    if (result.ok) expect(result.value.sleep).toEqual([]);
  });
});

describe('affectedDates', () => {
  it('collects distinct dates from buckets and sleep, sorted', () => {
    const result = validateSyncRequest({
      timezone: MANILA,
      buckets: [
        bucket({ localDate: '2026-07-27' }),
        bucket({ localDate: '2026-07-25', hour: 3 }),
        bucket({ localDate: '2026-07-27', hour: 4 }),
      ],
      sleep: [{ localDate: '2026-07-26', minutes: 400 }],
    });
    if (!result.ok) throw new Error(result.error);
    expect(affectedDates(result.value)).toEqual([
      '2026-07-25',
      '2026-07-26',
      '2026-07-27',
    ]);
  });
});

describe('isDayFlagged', () => {
  const none = new Set<number>();
  const hours = (specs: Array<Partial<HourBucket> & { hour: number }>): HourBucket[] =>
    specs.map((s) => ({
      steps: 0,
      distanceM: 0,
      activeKcal: 0,
      activeMinutes: 0,
      ...s,
    }));

  it('ignores an ordinary heavy walking day', () => {
    // 15,000 steps spread across the day: gold AGI, nothing suspicious.
    const buckets = hours(
      Array.from({ length: 12 }, (_, hour) => ({ hour, steps: 1_250, distanceM: 900 })),
    );
    expect(isDayFlagged(buckets, { hadWorkout: none, elevatedHeartRate: none })).toBe(
      false,
    );
  });

  it('ignores an intense hour of real running', () => {
    // A hard hour: ~10,000 steps WITH matching GPS distance.
    const buckets = hours([{ hour: 6, steps: 10_000, distanceM: 8_000 }]);
    expect(isDayFlagged(buckets, { hadWorkout: none, elevatedHeartRate: none })).toBe(
      false,
    );
  });

  it('ignores a treadmill hour, which reports no GPS distance', () => {
    const buckets = hours([{ hour: 6, steps: 10_000, distanceM: 0 }]);
    expect(
      isDayFlagged(buckets, {
        hadWorkout: new Set([6]),
        elevatedHeartRate: none,
      }),
    ).toBe(false);
  });

  it('flags an hour of shaken phone: many steps, no distance, no workout', () => {
    const buckets = hours([{ hour: 22, steps: 12_000, distanceM: 0 }]);
    expect(isDayFlagged(buckets, { hadWorkout: none, elevatedHeartRate: none })).toBe(
      true,
    );
  });

  it('applies suppression per hour, not across the day', () => {
    // A genuine workout at 06:00 must not launder a fake spike at 22:00.
    const buckets = hours([
      { hour: 6, steps: 10_000, distanceM: 8_000 },
      { hour: 22, steps: 12_000, distanceM: 0 },
    ]);
    expect(
      isDayFlagged(buckets, { hadWorkout: new Set([6]), elevatedHeartRate: none }),
    ).toBe(true);
  });

  it('does not flag an empty day', () => {
    expect(isDayFlagged([], { hadWorkout: none, elevatedHeartRate: none })).toBe(false);
  });
});

describe('planDay', () => {
  function input(overrides: Partial<DayPlanInput> = {}): DayPlanInput {
    return {
      userId: 'me',
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: Array.from({ length: 6 }, (_, hour) => ({
        hour,
        steps: hour === 5 ? 750 : 250,
        distanceM: 200,
        activeKcal: hour === 0 ? 450 : 0,
        activeMinutes: hour === 0 ? 45 : 0,
      })),
      hadWorkoutHours: new Set<number>(),
      elevatedHeartRateHours: new Set<number>(),
      sleepMinutes: null,
      existingStatus: null,
      ...overrides,
    };
  }

  it('produces a complete score row', () => {
    const { row } = planDay(input());
    expect(row.user_id).toBe('me');
    expect(row.local_date).toBe(DAY);
    expect(row.contributing_stats).toBe(4);
    expect(row.tiers).toEqual({
      AGI: 'bronze',
      STR: 'gold',
      END: 'silver',
      VIT: 'silver',
      // input() carries no sleepMinutes — MND is 'none' rather than absent.
      MND: 'none',
    });
    expect(row.total).toBeGreaterThan(0);
  });

  it('never finalizes, even past the grace window', () => {
    // Only the finalize-days cron may award coins and close a day.
    const late = planDay(input({ now: new Date('2026-07-29T00:00:00Z') }));
    expect(late.row.status).toBe('provisional');
    expect(late.row.finalized_at).toBeNull();
    expect(late.frozen).toBe(false);
  });

  it('marks an already-final day as frozen', () => {
    const plan = planDay(input({ existingStatus: 'final' }));
    expect(plan.frozen).toBe(true);
    expect(plan.row.status).toBe('final');
  });

  it('still computes XP for a frozen day', () => {
    // §19: backfilled data cannot change a settled ranking, but it must still
    // earn XP — a user whose phone died is not punished by sync luck.
    const plan = planDay(input({ existingStatus: 'final' }));
    expect(plan.row.xp_awarded).toBeGreaterThan(0);
  });

  it('is idempotent', () => {
    expect(planDay(input())).toEqual(planDay(input()));
  });

  it('carries the anti-cheat verdict onto the row', () => {
    const cheating = planDay(
      input({
        buckets: [
          { hour: 23, steps: 15_000, distanceM: 0, activeKcal: 0, activeMinutes: 0 },
        ],
      }),
    );
    expect(cheating.row.flagged).toBe(true);
    expect(planDay(input()).row.flagged).toBe(false);
  });

  it('records REC only when sleep data exists', () => {
    expect(planDay(input()).row.has_rec).toBe(false);
    const withSleep = planDay(input({ sleepMinutes: 8 * 60 }));
    expect(withSleep.row.has_rec).toBe(true);
    expect(withSleep.row.rec_points).toBe(500);
  });

  it('writes mind_points from MND, dual-written alongside rec_points (deviation #41)', () => {
    // Expand phase: MND and REC both read sleepMinutes and both pay. Task 4
    // retires rec_points once every consumer reads mind_points instead.
    expect(planDay(input()).row.mind_points).toBe(0);
    const withSleep = planDay(input({ sleepMinutes: 8 * 60 }));
    expect(withSleep.row.mind_points).toBe(900); // 8h clears MND gold.
    expect(withSleep.row.rec_points).toBe(500);
  });

  it('stores pre-multiplier points and no featured stat (deviation #11)', () => {
    // All weighting is read-time in squad_leaderboard(), so stored scores stay
    // canonical and program-independent.
    const { row } = planDay(input());
    expect(row.featured_stat).toBeNull();
    expect(row.end_points).toBe(500);
  });
});

describe('observesWearable', () => {
  // Wearable capability is observed from synced data, never asked (decision #5
  // in the onboarding assessment). Sleep is the signal: an iPhone alone does
  // not record it.
  it('is true when the payload carries sleep', () => {
    expect(
      observesWearable({
        timezone: MANILA,
        buckets: [],
        sleep: [{ localDate: DAY, minutes: 7 * 60 }],
      }),
    ).toBe(true);
  });

  it('is false for a phone-only payload', () => {
    expect(observesWearable({ timezone: MANILA, buckets: [bucket()] })).toBe(false);
  });

  it('is false for an empty sleep array', () => {
    expect(
      observesWearable({ timezone: MANILA, buckets: [bucket()], sleep: [] }),
    ).toBe(false);
  });

  it('does not count a zero-minute night as a wearable', () => {
    // Zero minutes is indistinguishable from no data, and the flag is sticky —
    // a false positive is permanent.
    expect(
      observesWearable({
        timezone: MANILA,
        buckets: [],
        sleep: [{ localDate: DAY, minutes: 0 }],
      }),
    ).toBe(false);
  });

  it('is true when any night in a multi-day payload has sleep', () => {
    expect(
      observesWearable({
        timezone: MANILA,
        buckets: [],
        sleep: [
          { localDate: '2026-07-26', minutes: 0 },
          { localDate: DAY, minutes: 400 },
        ],
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Heart rate — the strain inputs
// ---------------------------------------------------------------------------
//
// Display only. Nothing validated here reaches `daily_scores`, which is why the
// hourly average degrades to null on bad input rather than failing the sync:
// the same payload carries the steps that decide the user's standing, and a
// cosmetic field must never be able to take those down with it.

describe('validateSyncRequest — avgHeartRate', () => {
  function bucketWith(avgHeartRate: unknown) {
    return {
      timezone: 'Asia/Manila',
      buckets: [
        {
          localDate: '2026-08-01',
          hour: 9,
          steps: 100,
          distanceM: 80,
          activeKcal: 5,
          activeMinutes: 2,
          avgHeartRate,
        },
      ],
    };
  }

  it('accepts a plausible bpm', () => {
    const result = validateSyncRequest(bucketWith(118.4));
    expect(result.ok).toBe(true);
    expect((result as { value: SyncRequest }).value.buckets[0]!.avgHeartRate).toBe(118.4);
  });

  it('defaults to null when the field is absent', () => {
    const body = bucketWith(undefined);
    delete (body.buckets[0] as Record<string, unknown>)['avgHeartRate'];
    const result = validateSyncRequest(body);
    expect(result.ok).toBe(true);
    expect((result as { value: SyncRequest }).value.buckets[0]!.avgHeartRate).toBeNull();
  });

  it('drops an implausible bpm rather than failing the whole sync', () => {
    // The steps in this same payload decide a standing. A cosmetic field must
    // not be able to reject them.
    for (const bad of [0, -5, 19, 251, 'fast', null, Number.NaN]) {
      const result = validateSyncRequest(bucketWith(bad));
      expect(result.ok).toBe(true);
      expect((result as { value: SyncRequest }).value.buckets[0]!.avgHeartRate).toBeNull();
    }
  });

  it('rounds to the stored precision', () => {
    const result = validateSyncRequest(bucketWith(118.46));
    expect((result as { value: SyncRequest }).value.buckets[0]!.avgHeartRate).toBe(118.5);
  });
});

describe('validateSyncRequest — restingHeartRate', () => {
  function bodyWith(restingHeartRate: unknown) {
    return { timezone: 'Asia/Manila', buckets: [], restingHeartRate };
  }

  it('accepts a per-day entry', () => {
    const result = validateSyncRequest(
      bodyWith([{ localDate: '2026-08-01', bpm: 58 }]),
    );
    expect(result.ok).toBe(true);
    expect((result as { value: SyncRequest }).value.restingHeartRate).toEqual([
      { localDate: '2026-08-01', bpm: 58 },
    ]);
  });

  it('is optional — a phone-only client sends none', () => {
    const result = validateSyncRequest({ timezone: 'Asia/Manila', buckets: [] });
    expect(result.ok).toBe(true);
    expect((result as { value: SyncRequest }).value.restingHeartRate).toEqual([]);
  });

  it('rejects a malformed entry, unlike the hourly average', () => {
    // A whole entry with a nonsense bpm has nothing else on it to salvage, so
    // there is no partial value worth keeping — the asymmetry is deliberate.
    expect(validateSyncRequest(bodyWith([{ localDate: '2026-08-01', bpm: 300 }])).ok)
      .toBe(false);
    expect(validateSyncRequest(bodyWith([{ localDate: 'yesterday', bpm: 58 }])).ok)
      .toBe(false);
    expect(validateSyncRequest(bodyWith([{ localDate: '2026-08-01' }])).ok).toBe(false);
    expect(validateSyncRequest(bodyWith('58')).ok).toBe(false);
  });
});

describe('validateSyncRequest — workout sessions', () => {
  function session(overrides: Record<string, unknown> = {}) {
    return {
      hkUuid: 'A1B2-C3D4',
      localDate: DAY,
      startedAt: '2026-07-27T09:00:00.000Z',
      endedAt: '2026-07-27T09:45:00.000Z',
      activityType: 37,
      durationS: 2_700,
      distanceM: 7_400.5,
      activeKcal: 512.25,
      ...overrides,
    };
  }

  it('accepts a payload with no sessions at all', () => {
    // The field is optional: a client that has not been updated, or a user who
    // logs no workouts, must keep syncing steps exactly as before.
    const result = validateSyncRequest(body());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sessions).toEqual([]);
  });

  it('accepts a well-formed session', () => {
    const result = validateSyncRequest(body({ sessions: [session()] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sessions).toEqual([
        {
          hkUuid: 'A1B2-C3D4',
          localDate: DAY,
          startedAt: '2026-07-27T09:00:00.000Z',
          endedAt: '2026-07-27T09:45:00.000Z',
          activityType: 37,
          durationS: 2_700,
          distanceM: 7_400.5,
          activeKcal: 512.25,
        },
      ]);
    }
  });

  it('rejects a non-array sessions field', () => {
    expect(validateSyncRequest(body({ sessions: 'nope' })).ok).toBe(false);
  });

  it('bounds how many sessions one request may carry', () => {
    const many = Array.from({ length: MAX_SESSIONS_PER_SYNC + 1 }, () => session());
    const result = validateSyncRequest(body({ sessions: many }));
    expect(result).toEqual({
      ok: false,
      error: `too many sessions (max ${MAX_SESSIONS_PER_SYNC})`,
    });
  });

  it('accepts exactly the limit', () => {
    const many = Array.from({ length: MAX_SESSIONS_PER_SYNC }, (_, i) =>
      session({ hkUuid: `uuid-${i}` }),
    );
    expect(validateSyncRequest(body({ sessions: many })).ok).toBe(true);
  });

  it('requires the HealthKit uuid, which is the primary key', () => {
    expect(validateSyncRequest(body({ sessions: [session({ hkUuid: '' })] }))).toEqual({
      ok: false,
      error: 'session.hkUuid is required',
    });
    expect(validateSyncRequest(body({ sessions: [session({ hkUuid: 7 })] })).ok).toBe(false);
  });

  it('requires a YYYY-MM-DD local date', () => {
    expect(
      validateSyncRequest(body({ sessions: [session({ localDate: '27/07/2026' })] })),
    ).toEqual({ ok: false, error: 'session.localDate must be YYYY-MM-DD' });
  });

  it('requires parseable timestamps on both ends', () => {
    expect(validateSyncRequest(body({ sessions: [session({ startedAt: 'soon' })] }))).toEqual({
      ok: false,
      error: 'session.startedAt must be an ISO timestamp',
    });
    expect(validateSyncRequest(body({ sessions: [session({ endedAt: 42 })] }))).toEqual({
      ok: false,
      error: 'session.endedAt must be an ISO timestamp',
    });
  });

  it('rejects an activity type the smallint column could not hold', () => {
    // Caught here rather than at the insert: a failed insert would take down
    // the whole sync, and this request also carries the day's steps.
    for (const activityType of [-1, 40_000, 3.5, '37']) {
      expect(validateSyncRequest(body({ sessions: [session({ activityType })] })).ok).toBe(
        false,
      );
    }
  });

  it('rejects negative measurements', () => {
    for (const field of ['durationS', 'distanceM', 'activeKcal']) {
      const result = validateSyncRequest(body({ sessions: [session({ [field]: -1 })] }));
      expect(result).toEqual({
        ok: false,
        error: `session.${field} must be a non-negative number`,
      });
    }
  });

  it('accepts a strength session with no distance', () => {
    // `totalDistance` is absent on a lifting session, and `read.ts` sends 0.
    const result = validateSyncRequest(body({ sessions: [session({ distanceM: 0 })] }));
    expect(result.ok).toBe(true);
  });

  it('rounds to what the columns can store', () => {
    // duration_s is an integer; the other two are numeric(10, 2). Rounding here
    // means the stored value is the value that was sent, rather than one
    // Postgres silently rounded on the way in.
    const result = validateSyncRequest(
      body({
        sessions: [session({ durationS: 2_700.6, distanceM: 7_400.567, activeKcal: 512.254 })],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sessions![0]).toMatchObject({
        durationS: 2_701,
        distanceM: 7_400.57,
        activeKcal: 512.25,
      });
    }
  });
});

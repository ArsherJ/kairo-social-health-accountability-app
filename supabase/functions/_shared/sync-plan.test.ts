import { describe, expect, it } from 'vitest';
import {
  MAX_BUCKETS_PER_SYNC,
  affectedDates,
  isDayFlagged,
  observesWearable,
  planDay,
  validateSyncRequest,
  type DayPlanInput,
  type IncomingBucket,
} from './sync-plan.ts';
import type { HourBucket, SabotageEvent } from './core.ts';

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
      sabotageEvents: [],
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
    });
    expect(row.total).toBeGreaterThan(0);
  });

  it('subtracts sabotage from the total', () => {
    const hit: SabotageEvent = {
      id: 'e1',
      actorId: 'rival',
      targetId: 'me',
      squadId: 's',
      item: 'banana',
      createdAt: '2026-07-27T10:00:00Z',
      targetLocalDate: DAY,
    };
    const clean = planDay(input()).row;
    const hitRow = planDay(input({ sabotageEvents: [hit] })).row;
    expect(hitRow.sabotage_delta).toBe(-500);
    expect(hitRow.total).toBe(clean.total - 500);
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

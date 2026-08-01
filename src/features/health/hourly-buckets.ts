import { currentLocalDate, localHourFor } from '@kairo/core';

/**
 * HealthKit readings -> the hourly buckets `sync-health` accepts.
 *
 * This module deliberately does not import the healthkit package. `read.ts`
 * flattens HealthKit's responses into the plain `HourlyReading` shape below,
 * and everything that makes a decision operates on that — which is what lets
 * the whole bucketing layer be tested in plain Node. It is the same boundary
 * `supabase/functions/_shared/*-plan.ts` draws around the Edge Functions, for
 * the same reason: what cannot be tested in Node is effectively untested.
 */

export type HealthMetric =
  | 'steps'
  | 'distanceM'
  | 'activeKcal'
  | 'activeMinutes'
  | 'hadWorkout'
  | 'elevatedHeartRate';

export interface HourlyReading {
  metric: HealthMetric;
  /** The instant the hourly interval opened. */
  startDate: Date;
  /** For the two flag metrics, anything above zero means true. */
  value: number;
}

/**
 * One hour as `sync-health` expects it. The authority on this shape is
 * `validateSyncRequest` in `supabase/functions/_shared/sync-plan.ts`; it is
 * restated here rather than imported so this file stays free of anything the
 * Edge Function runtime drags in.
 */
export interface SyncBucket {
  localDate: string;
  hour: number;
  steps: number;
  distanceM: number;
  activeKcal: number;
  activeMinutes: number;
  hadWorkout: boolean;
  elevatedHeartRate: boolean;
}

/** `active_minutes` is `check (active_minutes between 0 and 60)` in SQL. */
const MAX_ACTIVE_MINUTES = 60;

/** `distance_m` and `active_kcal` are both `numeric(10, 2)`. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function key(localDate: string, hour: number): string {
  return `${localDate}#${hour}`;
}

/**
 * Every hour of every requested date, including the empty ones.
 *
 * Whole days, not just the hours with data: if Apple revises an hour downward
 * to zero, omitting it would leave the previous nonzero bucket in place and the
 * day would score high forever. 31 days x 24 hours is 744, which is what sizes
 * the window against the server's 750-bucket cap.
 */
export function toBuckets(
  readings: readonly HourlyReading[],
  dates: readonly string[],
  timeZone: string,
): SyncBucket[] {
  const wanted = new Set(dates);
  const buckets = new Map<string, SyncBucket>();

  for (const localDate of [...dates].sort()) {
    for (let hour = 0; hour < 24; hour += 1) {
      buckets.set(key(localDate, hour), {
        localDate,
        hour,
        steps: 0,
        distanceM: 0,
        activeKcal: 0,
        activeMinutes: 0,
        hadWorkout: false,
        elevatedHeartRate: false,
      });
    }
  }

  for (const r of readings) {
    // Never derive the hour by counting intervals. A local day is 23 or 25
    // hours across a DST transition, so only the zone-aware mapping is right —
    // and it is already the tested one (§2, `packages/kairo-core/src/day.ts`).
    const localDate = currentLocalDate(r.startDate, timeZone);
    if (!wanted.has(localDate)) continue;

    const bucket = buckets.get(key(localDate, localHourFor(r.startDate, timeZone)));
    if (!bucket) continue;

    switch (r.metric) {
      case 'hadWorkout':
        bucket.hadWorkout ||= r.value > 0;
        break;
      case 'elevatedHeartRate':
        bucket.elevatedHeartRate ||= r.value > 0;
        break;
      default:
        // Accumulated, not assigned. On a fall-back day two intervals land on
        // the same wall-clock hour and both really happened.
        bucket[r.metric] += r.value;
    }
  }

  return [...buckets.values()]
    .map((b) => ({
      ...b,
      steps: Math.max(0, Math.round(b.steps)),
      distanceM: Math.max(0, round2(b.distanceM)),
      activeKcal: Math.max(0, round2(b.activeKcal)),
      activeMinutes: Math.min(
        MAX_ACTIVE_MINUTES,
        Math.max(0, round2(b.activeMinutes)),
      ),
    }))
    .sort((a, b) =>
      a.localDate === b.localDate
        ? a.hour - b.hour
        : a.localDate < b.localDate
          ? -1
          : 1,
    );
}

import {
  queryCategorySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
} from '@kingstinct/react-native-healthkit';
import { currentLocalDate } from '@kairo/core';
import { hourlySampleInstants } from './intervals.ts';
import { sleepMinutesByDate, type SleepSegment } from './sleep-attribution.ts';
import { kcalFrom, metresFrom, secondsFrom } from './workout-units.ts';
import type { HealthMetric, HourlyReading } from './hourly-buckets.ts';
import type { SyncWindow } from './sync-window.ts';

/**
 * One logged workout, flattened. Apple's own sample UUID is the idempotency
 * key — a re-synced window upserts rather than duplicating, and a workout Apple
 * later revises flows through the same way retroactive step revisions do.
 */
export interface WorkoutSessionReading {
  hkUuid: string;
  localDate: string;
  startedAt: Date;
  endedAt: Date;
  /** HKWorkoutActivityType raw value, untranslated. */
  activityType: number;
  durationS: number;
  distanceM: number;
  activeKcal: number;
}

/**
 * The only new module that talks to HealthKit.
 *
 * Everything here is flattened into plain objects before it leaves, so that
 * every decision downstream can be tested in plain Node. Nothing in this file
 * decides anything.
 */

/**
 * Hourly sums, not raw samples.
 *
 * `HKStatisticsCollectionQuery` with `cumulativeSum` applies Apple's own
 * cross-source deduplication, which is what stops an iPhone and a paired Watch
 * both counting the same steps. Summing raw samples would double-count exactly
 * the users most likely to be competitive (roadmap deviation #8).
 */
const HOURLY: { hour: number } = { hour: 1 };

/** Resting heart rate is one figure per day, not per hour. */
const DAILY: { day: number } = { day: 1 };

/**
 * Units are always explicit.
 *
 * `unit` is optional, and when omitted HealthKit returns the user's *preferred*
 * unit, which is locale-dependent — on a US-locale device
 * `distanceWalkingRunning` comes back in miles and lands in a column called
 * `distance_m`. That silently breaks the anti-cheat stride check in the
 * direction that flags honest runners, which §5 calls the expensive mistake.
 */
/** Paired positionally with the four queries in `readHealthWindow`. */
const QUANTITY_METRICS: readonly HealthMetric[] = [
  'steps',
  'distanceM',
  'activeKcal',
  'activeMinutes',
];

/**
 * Sustained elevation over the hour. Deliberately a low bar: this signal only
 * ever *suppresses* an anti-cheat flag, so a false negative accuses an honest
 * runner in front of their squad, which §5 weighs as the costlier error.
 */
const ELEVATED_HEART_RATE_BPM = 100;

/** A night can start well before the window opens and still end inside it. */
const SLEEP_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function finite(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

export interface HealthReadResult {
  readings: HourlyReading[];
  /**
   * Logged workouts, kept whole. Separate from `readings` because these are
   * sessions rather than hourly samples — the per-hour `hadWorkout` reading
   * anti-cheat uses is still in `readings` and is unaffected.
   */
  sessions: WorkoutSessionReading[];
  sleep: Array<{ localDate: string; minutes: number }>;
  /** One per local day that had a reading. Wearable users only. */
  restingHeartRate: Array<{ localDate: string; bpm: number }>;
}

export async function readHealthWindow(
  window: SyncWindow,
  timeZone: string,
): Promise<HealthReadResult> {
  // Without a date predicate the native side returns the entire statistics
  // collection — every hour since the user's first ever sample. On someone
  // with years of Health history that is tens of thousands of objects.
  const filter = {
    date: { startDate: window.fromUtc, endDate: window.toUtc },
  };

  const readings: HourlyReading[] = [];

  // Written out rather than looped so each identifier's unit is checked
  // against that identifier's own unit type. A loop would widen `unit` to
  // `string` and lose exactly the guarantee this is here for.
  const collections = await Promise.all([
    queryStatisticsCollectionForQuantity(
      'HKQuantityTypeIdentifierStepCount',
      ['cumulativeSum'],
      window.fromUtc,
      HOURLY,
      { filter, unit: 'count' },
    ),
    queryStatisticsCollectionForQuantity(
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      ['cumulativeSum'],
      window.fromUtc,
      HOURLY,
      { filter, unit: 'm' },
    ),
    queryStatisticsCollectionForQuantity(
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      ['cumulativeSum'],
      window.fromUtc,
      HOURLY,
      { filter, unit: 'kcal' },
    ),
    queryStatisticsCollectionForQuantity(
      'HKQuantityTypeIdentifierAppleExerciseTime',
      ['cumulativeSum'],
      window.fromUtc,
      HOURLY,
      { filter, unit: 'min' },
    ),
  ]);

  collections.forEach((intervals, i) => {
    const metric = QUANTITY_METRICS[i] as HealthMetric;
    for (const interval of intervals) {
      if (!interval.startDate) continue;
      readings.push({
        metric,
        startDate: interval.startDate,
        value: finite(interval.sumQuantity?.quantity),
      });
    }
  });

  // Heart rate is a discrete type, so the hourly *average* is the right
  // statistic — "elevated over this hour", not "spiked once".
  const heartRate = await queryStatisticsCollectionForQuantity(
    'HKQuantityTypeIdentifierHeartRate',
    ['discreteAverage'],
    window.fromUtc,
    HOURLY,
    { filter, unit: 'count/min' },
  );

  for (const interval of heartRate) {
    if (!interval.startDate) continue;
    const bpm = finite(interval.averageQuantity?.quantity);

    readings.push({
      metric: 'elevatedHeartRate',
      startDate: interval.startDate,
      value: bpm >= ELEVATED_HEART_RATE_BPM ? 1 : 0,
    });

    // The same number, kept rather than discarded. It used to be reduced to
    // the boolean above and thrown away; `computeStrain()` needs the magnitude,
    // and re-querying HealthKit for a value already in hand would be a second
    // round trip for data this loop is already holding.
    //
    // Zero means "no reading this hour", which `toBuckets` maps to null — an
    // hour with the watch off is unmeasured, not an hour at rest.
    readings.push({
      metric: 'avgHeartRate',
      startDate: interval.startDate,
      value: bpm,
    });
  }

  // `limit` is required, and a non-positive value means "all".
  const workouts = await queryWorkoutSamples({ filter, limit: 0 });

  const sessions: WorkoutSessionReading[] = [];

  for (const workout of workouts) {
    // A workout spans hours. Marking one instant per hour it touches lets the
    // bucketer resolve the local hour, which matters in half-hour-offset zones
    // where UTC and local hour boundaries do not line up.
    //
    // Unchanged by the session ingest below: anti-cheat keeps reading exactly
    // the per-hour boolean it always has.
    for (const at of hourlySampleInstants(
      workout.startDate.getTime(),
      workout.endDate.getTime(),
    )) {
      readings.push({
        metric: 'hadWorkout',
        startDate: new Date(at),
        value: 1,
      });
    }

    // The rest of the sample, kept rather than discarded — the same waste
    // deviation #24 found with heart rate. Every field is already in hand;
    // this costs no extra HealthKit round trip.
    //
    // The activity type is stored as Apple's **raw number**, untranslated:
    // this module decides nothing, and a translation table would silently drop
    // every activity it had not been taught, in a table whose whole purpose is
    // telling activities apart. Meaning is assigned in `@kairo/core`'s
    // `challenge.ts`.
    //
    // Units are converted from what the sample reports rather than assumed —
    // see `workout-units.ts`. An unconvertible unit becomes 0, which makes the
    // session non-qualifying for a Challenge instead of feeding it a distance
    // in the wrong unit.
    sessions.push({
      hkUuid: workout.uuid,
      localDate: currentLocalDate(workout.startDate, timeZone),
      startedAt: workout.startDate,
      endedAt: workout.endDate,
      activityType: workout.workoutActivityType as unknown as number,
      durationS: Math.round(secondsFrom(workout.duration) ?? 0),
      distanceM: metresFrom(workout.totalDistance) ?? 0,
      activeKcal: kcalFrom(workout.totalEnergyBurned) ?? 0,
    });
  }

  const sleepSamples = await queryCategorySamples(
    'HKCategoryTypeIdentifierSleepAnalysis',
    {
      filter: {
        date: {
          startDate: new Date(window.fromUtc.getTime() - SLEEP_LOOKBACK_MS),
          endDate: window.toUtc,
        },
      },
      limit: 0,
    },
  );

  const segments: SleepSegment[] = sleepSamples.map((s) => ({
    startMs: s.startDate.getTime(),
    endMs: s.endDate.getTime(),
    value: s.value as unknown as number,
  }));

  // Resting heart rate is a per-day figure Apple derives itself from overnight
  // readings, so it is a daily statistic rather than an hourly one — the same
  // shape as sleep, and it lands in its own table for the same reason.
  const resting = await queryStatisticsCollectionForQuantity(
    'HKQuantityTypeIdentifierRestingHeartRate',
    ['discreteAverage'],
    window.fromUtc,
    DAILY,
    { filter, unit: 'count/min' },
  );

  const restingByDate = new Map<string, number>();
  for (const interval of resting) {
    if (!interval.startDate) continue;
    const bpm = finite(interval.averageQuantity?.quantity);
    if (bpm <= 0) continue;
    // Keyed by the user's local date (§2), like everything else — a UTC day
    // boundary would file a Manila morning's reading under the day before.
    restingByDate.set(currentLocalDate(interval.startDate, timeZone), bpm);
  }

  return {
    readings,
    sessions,
    sleep: sleepMinutesByDate(segments, window.dates, timeZone),
    restingHeartRate: window.dates
      .filter((localDate) => restingByDate.has(localDate))
      .map((localDate) => ({
        localDate,
        bpm: Math.round(restingByDate.get(localDate)!),
      })),
  };
}

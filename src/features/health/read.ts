import {
  queryCategorySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
} from '@kingstinct/react-native-healthkit';
import { hourlySampleInstants } from './intervals.ts';
import { sleepMinutesByDate, type SleepSegment } from './sleep-attribution.ts';
import type { HealthMetric, HourlyReading } from './hourly-buckets.ts';
import type { SyncWindow } from './sync-window.ts';

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
  sleep: Array<{ localDate: string; minutes: number }>;
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
    readings.push({
      metric: 'elevatedHeartRate',
      startDate: interval.startDate,
      value:
        finite(interval.averageQuantity?.quantity) >= ELEVATED_HEART_RATE_BPM
          ? 1
          : 0,
    });
  }

  // `limit` is required, and a non-positive value means "all".
  const workouts = await queryWorkoutSamples({ filter, limit: 0 });

  for (const workout of workouts) {
    // A workout spans hours. Marking one instant per hour it touches lets the
    // bucketer resolve the local hour, which matters in half-hour-offset zones
    // where UTC and local hour boundaries do not line up.
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

  return {
    readings,
    sleep: sleepMinutesByDate(segments, window.dates, timeZone),
  };
}

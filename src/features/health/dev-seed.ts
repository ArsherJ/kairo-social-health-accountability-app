import {
  requestAuthorization,
  saveCategorySample,
  saveQuantitySample,
} from '@kingstinct/react-native-healthkit';
import { currentLocalDate, localHourFor, localZonedTimeUtc } from '@kairo/core';
import { KAIRO_READ_TYPES } from './permission.ts';

/**
 * Writes sample activity into HealthKit so the ingest pipeline can be exercised
 * on a simulator. **Development builds only.**
 *
 * This is not `seed-health`. That function fabricates buckets server-side and
 * deliberately bypasses ingest; this writes real HealthKit samples so the whole
 * client path — statistics-collection reads, bucketing, sleep attribution, the
 * sync and the invalidation — runs exactly as it will on a device. A fresh
 * simulator's Health app is empty, so without this a working pipeline and a
 * broken one both render zero.
 *
 * Guard every call site with `__DEV__`. Nothing here should reach TestFlight —
 * §15's beta measures real behaviour.
 */

/**
 * END cannot be seeded. `HKQuantityTypeIdentifierAppleExerciseTime` is absent
 * from HealthKit's writeable list — it is Apple-derived, never third-party
 * written — so active minutes read zero on a simulator no matter what.
 *
 * That is expected here, not a bug: it caps `contributing_stats` at 3 and makes
 * the 4-stat consistency bonus unreachable. It is also why roadmap risk R7
 * (is END populated at all on a phone-only device?) still needs real hardware.
 */
const DEV_SHARE_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKCategoryTypeIdentifierSleepAnalysis',
] as const;

/** Hours of activity to write, ending at the current local hour. */
const SEED_HOURS = 10;

/**
 * Per active hour. ~1,100 steps spread across a full hour is 183 per 10
 * minutes, far under the 1,500-per-10-minutes anti-cheat threshold, so seeded
 * data must never trip the flag.
 */
const STEPS_PER_HOUR = 1_100;

/** A believable stride, comfortably above MIN_PLAUSIBLE_STRIDE_M (0.4). */
const METRES_PER_STEP = 0.75;

const KCAL_PER_HOUR = 26;

/** asleepCore. Seven hours lands in REC's healthy band, under the 9h penalty. */
const SLEEP_VALUE_CORE = 3;
const SLEEP_HOURS = 7;

const HOUR_MS = 3_600_000;

export interface SeedResult {
  localDate: string;
  hoursSeeded: number;
  steps: number;
}

/**
 * Seeds the elapsed part of today.
 *
 * Ten active hours at 1,100 steps is ~11,000 steps and 10 hours over the
 * 250-step VIT floor, so AGI and VIT both land Gold and STR lands Silver —
 * a predictable total to check the stored score against.
 */
export async function seedTodayHealthData(
  now: Date,
  timeZone: string,
): Promise<SeedResult> {
  // Read access alone cannot write. Asked here rather than in permission.ts so
  // the production ask stays read-only.
  await requestAuthorization({
    toShare: DEV_SHARE_TYPES,
    toRead: KAIRO_READ_TYPES,
  });

  const localDate = currentLocalDate(now, timeZone);
  const currentHour = localHourFor(now, timeZone);
  const firstHour = Math.max(0, currentHour - (SEED_HOURS - 1));

  let hoursSeeded = 0;

  for (let hour = firstHour; hour <= currentHour; hour += 1) {
    const from = localZonedTimeUtc(localDate, timeZone, hour);
    // The current hour is still running; never write a sample into the future,
    // which HealthKit rejects and which no real device would produce.
    const to = new Date(Math.min(from.getTime() + HOUR_MS, now.getTime()));
    if (to.getTime() <= from.getTime()) continue;

    await saveQuantitySample(
      'HKQuantityTypeIdentifierStepCount',
      'count',
      STEPS_PER_HOUR,
      from,
      to,
    );
    await saveQuantitySample(
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
      'm',
      Math.round(STEPS_PER_HOUR * METRES_PER_STEP),
      from,
      to,
    );
    await saveQuantitySample(
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      'kcal',
      KCAL_PER_HOUR,
      from,
      to,
    );

    hoursSeeded += 1;
  }

  // Last night's sleep, attributed to today by wake time.
  const wokeAt = localZonedTimeUtc(localDate, timeZone, 7);
  await saveCategorySample(
    'HKCategoryTypeIdentifierSleepAnalysis',
    SLEEP_VALUE_CORE,
    new Date(wokeAt.getTime() - SLEEP_HOURS * HOUR_MS),
    wokeAt,
  );

  return { localDate, hoursSeeded, steps: hoursSeeded * STEPS_PER_HOUR };
}

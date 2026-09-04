import {
  queryCategorySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
  type WorkoutProxyTyped,
} from '@kingstinct/react-native-healthkit';
import { currentLocalDate, dayEndUtc, dayStartUtc } from '@kairo/core';
import { hourlySampleInstants } from './intervals.ts';
import {
  sleepMinutesByDate,
  type SleepNight,
  type SleepSegment,
} from './sleep-attribution.ts';
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
  /** `sourceRevision.source.bundleIdentifier`, untranslated. The server holds the allowlist. */
  sourceBundleId: string | null;
  /** Apple's `HKWasUserEntered`. Undefined reads as false — absent is not a claim of manual entry. */
  wasUserEntered: boolean;
  /** Whether the session carried heart-rate samples. Manual entry never does. */
  hasHeartRateEvidence: boolean;
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

/**
 * Whether one workout carried heart-rate samples.
 *
 * Evidence is **presence**, not a value: a statistic that exists means the
 * session was recorded by something measuring a wrist, and manual entry never
 * produces one. Nothing here judges what that implies — §3's rule that a
 * verified workout needs an allowlisted source *and* this flag is applied
 * server-side in `scoring-inputs.ts`.
 *
 * Wrapped because this is the one per-session native round trip in the file
 * and it is made once per workout: a single unreadable session must not fail
 * the whole sync, which also carries the day's steps. An unreadable workout is
 * **inert** — false, therefore unverified, therefore shifting nothing. Never
 * trusted. Same posture as `workout-units.ts` meeting a unit it cannot convert:
 * inert beats wrong.
 */
async function hasHeartRateSamples(workout: WorkoutProxyTyped): Promise<boolean> {
  try {
    const statistic = await workout.getStatistic('HKQuantityTypeIdentifierHeartRate');
    return statistic != null;
  } catch {
    return false;
  }
}

export interface HealthReadResult {
  readings: HourlyReading[];
  /**
   * Logged workouts, kept whole. Separate from `readings` because these are
   * sessions rather than hourly samples — the per-hour `hadWorkout` reading
   * anti-cheat uses is still in `readings` and is unaffected.
   */
  sessions: WorkoutSessionReading[];
  sleep: SleepNight[];
  /** One per local day that had a reading. Wearable users only. */
  restingHeartRate: Array<{ localDate: string; bpm: number }>;
}

/**
 * Today's steps, straight from HealthKit, for the onboarding connect screen.
 *
 * **The one read in this file that answers a question the server cannot.** Every
 * other path here feeds `sync-health`, and the app reads the result back out of
 * `health_buckets`. `/connect` runs before a profile row exists — so there is
 * nothing for a bucket to hang from, no `profiles.timezone` to key a local day
 * by, and no server answer to wait for. It reads the phone directly and shows
 * the number, which is the entire reason the Health ask moved to the front.
 *
 * Deliberately not `readHealthWindow`. That reads distance, calories, exercise
 * minutes, heart rate, workouts and sleep across two days to produce a bucket
 * payload; this needs one figure, immediately, on a screen the user is standing
 * on with the permission sheet just dismissed.
 *
 * `unit: 'count'` for the same reason every read here is explicit: omitting it
 * returns the user's *preferred* unit. Steps have no plausible alternative unit,
 * but the rule holds without exceptions or it is not a rule.
 *
 * **A zero is a real answer** — a new phone, or one left on a desk — so this
 * returns a number and never null. Whether the call *threw* is the caller's
 * only failure signal, and the connect screen treats a throw and a zero
 * identically: both mean "nothing to show yet", and neither is an error the
 * user did anything about.
 */
export async function readStepsToday(timeZone: string): Promise<number> {
  const today = currentLocalDate(new Date(), timeZone);
  const from = dayStartUtc(today, timeZone);
  const to = dayEndUtc(today, timeZone);

  // A single bucket spanning the whole local day, rather than the hourly
  // collection the sync path builds: nothing here needs the shape of the day,
  // only its total.
  const collection = await queryStatisticsCollectionForQuantity(
    'HKQuantityTypeIdentifierStepCount',
    ['cumulativeSum'],
    from,
    DAILY,
    { filter: { date: { startDate: from, endDate: to } }, unit: 'count' },
  );

  // Summed rather than indexed at [0]. An interval anchored at local midnight
  // lands on one bucket in every zone Kairo serves, but a half-hour-offset zone
  // is exactly where that assumption has bitten this codebase before, and
  // summing is correct whether the answer arrives in one bucket or two.
  return collection.reduce(
    (total, interval) => total + finite(interval.sumQuantity?.quantity),
    0,
  );
}

/**
 * Daily step totals for a run of complete local days, for onboarding
 * calibration (deviation #63).
 *
 * **One query, one metric, and that is the point.** The obvious alternative is
 * `readHealthWindow` over fourteen days, and it would be wrong twice over: it
 * runs six hourly statistics collections plus every workout sample plus sleep
 * and returns thousands of objects to answer a question that needs one number
 * per day — including heart rate, which is owner-readable only and absent from
 * every projection. Reading that much to propose a quest size would leave the
 * connect beat's privacy claim technically accurate and morally misleading.
 *
 * So it is the same daily-interval collection `readStepsToday` already makes,
 * over a longer anchor. `unit: 'count'` for the same reason every read here is
 * explicit, and `DAILY` intervals anchored at the window's first local midnight
 * so a day boundary is a day boundary in the player's own zone.
 *
 * Returned **aligned to `localDates`**, with a day HealthKit reported nothing
 * for as `0` — which `calibrateQuestTier` then drops rather than counts, since
 * a zero and a phone in a drawer are the same reading. Bucketing by resolved
 * local date rather than by index because a DST day is 23 or 25 hours long and
 * an index assumes every bucket is the day it sits in.
 */
export async function readDailySteps(
  localDates: readonly string[],
  timeZone: string,
): Promise<number[]> {
  const first = localDates[0];
  const last = localDates.at(-1);
  if (first === undefined || last === undefined) return [];

  const from = dayStartUtc(first, timeZone);
  const to = dayEndUtc(last, timeZone);

  const collection = await queryStatisticsCollectionForQuantity(
    'HKQuantityTypeIdentifierStepCount',
    ['cumulativeSum'],
    from,
    DAILY,
    { filter: { date: { startDate: from, endDate: to } }, unit: 'count' },
  );

  const byDate = new Map<string, number>();
  for (const interval of collection) {
    if (!interval.startDate) continue;
    const localDate = currentLocalDate(interval.startDate, timeZone);
    const running = byDate.get(localDate) ?? 0;
    byDate.set(localDate, running + finite(interval.sumQuantity?.quantity));
  }

  return localDates.map((localDate) => byDate.get(localDate) ?? 0);
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
    //
    // The three origin fields are read the same way — flattened, never judged.
    // The bundle identifier goes over the wire untranslated because the
    // allowlist lives server-side (§3): a client that decided its own
    // verification would be deciding its own score.
    sessions.push({
      hkUuid: workout.uuid,
      localDate: currentLocalDate(workout.startDate, timeZone),
      startedAt: workout.startDate,
      endedAt: workout.endDate,
      activityType: workout.workoutActivityType as unknown as number,
      durationS: Math.round(secondsFrom(workout.duration) ?? 0),
      distanceM: metresFrom(workout.totalDistance) ?? 0,
      activeKcal: kcalFrom(workout.totalEnergyBurned) ?? 0,
      // Optional-chained and coalesced although the typings promise both are
      // present: this is a native boundary, and the whole sync — steps
      // included — dies on a property read against an undefined object. Same
      // reasoning as the try/catch above; the honest fallback is no evidence.
      //
      // `|| null` rather than `?? null`, so an **empty** identifier is inert
      // too. The validator refuses `''` deliberately — a bundle id that is
      // present and blank is malformed, and the client should stop producing
      // it rather than the server start tolerating it — but the validator's
      // refusal rejects the *whole request*, and this repo has already lost
      // two days of scoring to a sync that failed after its bucket upsert had
      // committed. An odd identifier costs a workout its STR shift; it must
      // not cost the day its steps.
      sourceBundleId: workout.sourceRevision?.source?.bundleIdentifier || null,
      // `HKWasUserEntered` is `boolean | undefined`. Undefined is absence of a
      // flag, not a flag set to false, and both mean the same thing here.
      wasUserEntered: workout.metadata?.HKWasUserEntered === true,
      hasHeartRateEvidence: await hasHeartRateSamples(workout),
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
    // Carried per segment rather than per night, because attribution merges
    // segments across sources and the verdict has to survive that merge —
    // `sleep-attribution.ts` decides, this only reports. Optional-chained for
    // the reason the workout loop is: a missing metadata map must not take
    // down a sync that also carries the day's steps.
    wasUserEntered: s.metadata?.HKWasUserEntered === true,
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

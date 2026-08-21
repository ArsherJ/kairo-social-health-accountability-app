import { KAIRO_READ_TYPES } from './read-types.ts';

/**
 * What Kairo tells the user it reads from Apple Health, and why.
 *
 * The QA pass in August 2026 found the sheet naming four data types while
 * `KAIRO_READ_TYPES` requested eight — iOS showed Sleep, Heart Rate, Resting
 * Heart Rate and Workouts that the copy never mentioned. In a health app that
 * is the permission moment's whole job, failed.
 *
 * Prose could not have stayed honest: nothing connects a sentence to a
 * constant. So the disclosure is *derived* from the request list instead. Every
 * identifier in `KAIRO_READ_TYPES` must appear in exactly one group here, and
 * `disclosure.test.ts` fails the build otherwise — so adding a read type
 * without disclosing it is not something a future change can quietly do.
 *
 * Grouped rather than listed one-per-line because steps and distance answer the
 * same question and reading them as two asks would overstate the ask. Every
 * identifier is still covered exactly once.
 */
export interface DisclosureGroup {
  /** The HealthKit identifiers this line accounts for. */
  types: readonly string[];
  /** What the user recognises it as. */
  label: string;
  /** What Kairo does with it, in the user's terms. */
  purpose: string;
}

export const HEALTH_DISCLOSURE: readonly DisclosureGroup[] = [
  {
    types: [
      'HKQuantityTypeIdentifierStepCount',
      'HKQuantityTypeIdentifierDistanceWalkingRunning',
    ],
    label: 'Steps and distance',
    purpose: 'Score your AGI',
  },
  {
    types: ['HKQuantityTypeIdentifierActiveEnergyBurned'],
    label: 'Active calories',
    purpose: 'Score your STR',
  },
  {
    types: ['HKQuantityTypeIdentifierAppleExerciseTime'],
    label: 'Active minutes',
    // END stopped being a stat on 2026-08-20 (deviation #41) and active
    // minutes stopped being scored with it — they are shown back to you and
    // nothing more. Saying "score" here would promise a number that no longer
    // exists.
    purpose: 'Show in your daily breakdown',
  },
  {
    types: ['HKCategoryTypeIdentifierSleepAnalysis'],
    label: 'Sleep',
    // Promoted from the REC bonus to a full stat on 2026-08-20 (deviation
    // #41). This is the one entry where the copy understated what happens to
    // the data rather than overstating it: sleep is now scored.
    purpose: 'Score your MND',
  },
  {
    types: [
      'HKQuantityTypeIdentifierHeartRate',
      'HKQuantityTypeIdentifierRestingHeartRate',
    ],
    label: 'Heart rate',
    // Deliberately says what it is *not* used for. Heart rate is the most
    // sensitive thing in the list and the one a reader is most likely to assume
    // feeds a score — it never touches `daily_scores` (deviation #24).
    purpose: 'Show your strain — never scored, never shared',
  },
  {
    types: ['HKWorkoutTypeIdentifier'],
    label: 'Workouts',
    purpose: 'Confirm a hard session was real',
  },
] as const;

/** Every identifier the disclosure accounts for. */
export function disclosedTypes(): string[] {
  return HEALTH_DISCLOSURE.flatMap((group) => [...group.types]);
}

/** Requested but never disclosed — the exact drift that caused the finding. */
export function undisclosedTypes(): string[] {
  const disclosed = new Set(disclosedTypes());
  return KAIRO_READ_TYPES.filter((type) => !disclosed.has(type));
}

/** Disclosed but not actually requested — an overstated ask, also a defect. */
export function overDisclosedTypes(): string[] {
  const requested = new Set<string>(KAIRO_READ_TYPES);
  return disclosedTypes().filter((type) => !requested.has(type));
}

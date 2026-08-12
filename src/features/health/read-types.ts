/**
 * Everything Kairo reads from Apple Health (§5). Steps and distance drive AGI,
 * active energy STR, exercise time END, hourly steps VIT, sleep REC. Heart rate
 * and workouts exist for the anti-cheat cross-check (§20) — a normal jog must
 * never flag — and for strain (deviation #24), and are requested here so the
 * user is asked once rather than twice.
 *
 * Kairo never writes to Health, so there is no `toShare` list.
 *
 * **Why this is its own file.** It used to live in `permission.ts`, next to the
 * calls that use it. `disclosure.ts` has to read it — the whole point of that
 * module is that the copy cannot name fewer types than the app requests — and
 * `permission.ts` imports `@kingstinct/react-native-healthkit`, which drags in
 * React Native's Flow syntax that root Vitest cannot parse. Importing it from a
 * test meant no test could exist. Same constraint `sync-state.ts` records, same
 * answer: the data is pure, so it lives where pure things can reach it.
 */
export const KAIRO_READ_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierHeartRate',
  // Apple computes this itself, once a day, from overnight readings. Kairo
  // never derives it — a floor over the day's hourly averages would be the
  // lowest hour, not a resting rate. Only used for strain's reserve
  // denominator; absent is normal and falls back.
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKWorkoutTypeIdentifier',
] as const;

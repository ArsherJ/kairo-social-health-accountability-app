import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailable,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import {
  permissionState,
  type HealthPermissionState,
  type RequestStatus,
} from './permission-state.ts';

/**
 * Everything Kairo reads (§5). Steps and distance drive AGI, active energy
 * STR, exercise time END, hourly steps VIT, sleep REC. Heart rate and workouts
 * exist only for the anti-cheat cross-check (§20) — a normal jog must never
 * flag — and are requested here so the user is asked once rather than twice.
 *
 * Kairo never writes to Health, so there is no `toShare` list.
 */
export const KAIRO_READ_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierHeartRate',
  'HKWorkoutTypeIdentifier',
] as const;

function toRequestStatus(status: AuthorizationRequestStatus): RequestStatus {
  if (status === AuthorizationRequestStatus.unnecessary) return 'unnecessary';
  if (status === AuthorizationRequestStatus.shouldRequest) return 'should-request';
  return 'unknown';
}

/**
 * getRequestStatusForAuthorization, not authorizationStatusFor.
 *
 * HealthKit deliberately never reveals READ authorization — doing so would leak
 * whether a user has a given condition — so authorizationStatusFor cannot
 * answer "have I asked yet" for read types. This call can.
 */
export async function readHealthPermissionState(): Promise<HealthPermissionState> {
  const available = isHealthDataAvailable();
  if (!available) return permissionState({ available, requestStatus: 'unknown' });

  const status = await getRequestStatusForAuthorization({ toRead: KAIRO_READ_TYPES });
  return permissionState({ available, requestStatus: toRequestStatus(status) });
}

/**
 * Shows the iOS sheet. Resolves true once the user has answered — HealthKit
 * does not report what they chose for read types, so this is "they were asked",
 * not "they said yes".
 */
export async function requestHealthPermission(): Promise<boolean> {
  return requestAuthorization({ toRead: KAIRO_READ_TYPES });
}

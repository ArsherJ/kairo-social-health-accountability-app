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
import { KAIRO_READ_TYPES } from './read-types.ts';

// Re-exported so existing callers keep their import site. The list itself lives
// in `read-types.ts` because `disclosure.ts` and its test have to read it, and
// nothing importing this file can be loaded by root Vitest.
export { KAIRO_READ_TYPES };

export function isHealthAvailable(): boolean {
  return isHealthDataAvailable();
}

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
  const available = isHealthAvailable();
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

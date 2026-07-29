/**
 * Our own vocabulary for HealthKit's request status, so the decision is a
 * plain function. The native enum is translated in permission.ts; nothing
 * importable from `@kingstinct/react-native-healthkit` appears in this file.
 *
 * Same split the Edge Functions use: decisions pure and tested, I/O thin.
 */
export type RequestStatus = 'unknown' | 'should-request' | 'unnecessary';

export type HealthPermissionState = 'unavailable' | 'should-ask' | 'asked';

export function permissionState(input: {
  available: boolean;
  requestStatus: RequestStatus;
}): HealthPermissionState {
  if (!input.available) return 'unavailable';
  return input.requestStatus === 'unnecessary' ? 'asked' : 'should-ask';
}

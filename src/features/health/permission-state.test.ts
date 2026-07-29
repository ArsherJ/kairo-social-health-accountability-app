import { describe, expect, it } from 'vitest';
import { permissionState } from './permission-state.ts';

describe('permissionState', () => {
  it('is unavailable when the device has no HealthKit', () => {
    expect(permissionState({ available: false, requestStatus: 'should-request' })).toBe(
      'unavailable',
    );
  });

  it('asks when HealthKit says the request has not been made', () => {
    expect(permissionState({ available: true, requestStatus: 'should-request' })).toBe(
      'should-ask',
    );
  });

  it('does not ask again once the request is unnecessary', () => {
    expect(permissionState({ available: true, requestStatus: 'unnecessary' })).toBe(
      'asked',
    );
  });

  it('asks when the status cannot be determined', () => {
    // iOS silently no-ops a prompt for types already authorized, so asking on
    // `unknown` costs nothing. Treating it as answered would mean a user who
    // hits this state is never asked at all.
    expect(permissionState({ available: true, requestStatus: 'unknown' })).toBe(
      'should-ask',
    );
  });
});

import {
  configureHealthBackgroundDelivery,
  KAIRO_OBSERVED_TYPES,
  subscribeToHealthChanges,
} from './background.ts';
import type { HealthSource } from './health-source-types.ts';
import { healthSourcePolicy } from './health-source-policy.ts';
import {
  isHealthAvailable,
  readHealthPermissionState,
  requestHealthPermission,
} from './permission.ts';
import { readHealthWindow, readStepsToday } from './read.ts';

export const appleHealthSource: HealthSource = {
  policy: healthSourcePolicy('ios'),
  displayName: 'Apple Health',
  isAvailable: isHealthAvailable,
  readPermissionState: readHealthPermissionState,
  requestPermission: requestHealthPermission,
  configureBackgroundDelivery: configureHealthBackgroundDelivery,
  subscribeToChanges: (onChange) =>
    KAIRO_OBSERVED_TYPES.map((identifier) =>
      subscribeToHealthChanges(identifier, onChange),
    ),
  readWindow: readHealthWindow,
  readStepsToday,
};

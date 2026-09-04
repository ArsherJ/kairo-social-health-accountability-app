import type { HealthSource } from './health-source-types.ts';
import { healthSourcePolicy } from './health-source-policy.ts';

const UNSUPPORTED_MESSAGE = 'Health data is unsupported on this platform';

export const unsupportedHealthSource: HealthSource = {
  policy: healthSourcePolicy('android'),
  displayName: 'device health',
  isAvailable: () => false,
  readPermissionState: async () => 'unavailable',
  requestPermission: async () => false,
  configureBackgroundDelivery: async () => false,
  subscribeToChanges: () => [],
  readWindow: async () => {
    throw new Error(UNSUPPORTED_MESSAGE);
  },
  readStepsToday: async () => {
    throw new Error(UNSUPPORTED_MESSAGE);
  },
  readDailySteps: async () => {
    throw new Error(UNSUPPORTED_MESSAGE);
  },
};

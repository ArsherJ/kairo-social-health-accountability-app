import type { HealthPermissionState } from './permission-state.ts';
import type { HealthReadResult } from './read.ts';
import type { HealthSourcePolicy } from './health-source-policy.ts';
import type { SyncWindow } from './sync-window.ts';

export interface HealthSubscription {
  remove: () => void;
}

/**
 * All device-health I/O crosses this boundary. Callers never need to know
 * whether the runtime is backed by HealthKit or deliberately unsupported.
 */
export interface HealthSource {
  policy: HealthSourcePolicy;
  displayName: string;
  isAvailable: () => boolean;
  readPermissionState: () => Promise<HealthPermissionState>;
  requestPermission: () => Promise<boolean>;
  configureBackgroundDelivery: () => Promise<boolean>;
  subscribeToChanges: (onChange: () => void) => HealthSubscription[];
  readWindow: (window: SyncWindow, timeZone: string) => Promise<HealthReadResult>;
  readStepsToday: (timeZone: string) => Promise<number>;
  /**
   * Daily step totals for a run of complete local days, aligned to the dates
   * given. Onboarding calibration only — see `readDailySteps`.
   */
  readDailySteps: (localDates: readonly string[], timeZone: string) => Promise<number[]>;
}

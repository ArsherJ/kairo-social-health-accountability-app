export type HealthSourceKind = 'apple-health' | 'unsupported';

export interface HealthSourcePolicy {
  kind: HealthSourceKind;
  supportsPermission: boolean;
  supportsReads: boolean;
  supportsSubscriptions: boolean;
  supportsServerSync: boolean;
}

const APPLE_HEALTH_POLICY: HealthSourcePolicy = {
  kind: 'apple-health',
  supportsPermission: true,
  supportsReads: true,
  supportsSubscriptions: true,
  supportsServerSync: true,
};

const UNSUPPORTED_POLICY: HealthSourcePolicy = {
  kind: 'unsupported',
  supportsPermission: false,
  supportsReads: false,
  supportsSubscriptions: false,
  supportsServerSync: false,
};

/**
 * The product boundary for device health data.
 *
 * Android development builds deliberately exercise navigation, authentication,
 * API access and native packaging only. Health Connect is a later product
 * decision, so treating Android as an empty Apple Health source would be
 * dangerous: a successful-looking read of zero could overwrite a real day.
 */
export function healthSourcePolicy(platform: string): HealthSourcePolicy {
  return platform === 'ios' ? APPLE_HEALTH_POLICY : UNSUPPORTED_POLICY;
}

import { Platform } from 'react-native';
import { appleHealthSource } from './apple-health-source.ts';
import { healthSourcePolicy } from './health-source-policy.ts';
import type { HealthSource } from './health-source-types.ts';
import { unsupportedHealthSource } from './unsupported-health-source.ts';

const policy = healthSourcePolicy(Platform.OS);

/** The single health integration used by the running native platform. */
export const healthSource: HealthSource =
  policy.kind === 'apple-health' ? appleHealthSource : unsupportedHealthSource;

import { describe, expect, it } from 'vitest';
import { healthSourcePolicy } from './health-source-policy.ts';

describe('health source platform boundary', () => {
  it('keeps the current Apple Health behavior on iOS', () => {
    expect(healthSourcePolicy('ios')).toEqual({
      kind: 'apple-health',
      supportsPermission: true,
      supportsReads: true,
      supportsSubscriptions: true,
      supportsServerSync: true,
    });
  });

  it.each(['android', 'web'])('makes %s explicitly unsupported', (platform) => {
    expect(healthSourcePolicy(platform)).toEqual({
      kind: 'unsupported',
      supportsPermission: false,
      supportsReads: false,
      supportsSubscriptions: false,
      supportsServerSync: false,
    });
  });
});

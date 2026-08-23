import { describe, expect, it } from 'vitest';
import { providerIdsForRuntime } from './provider-policy.ts';

describe('sign-in providers by runtime', () => {
  it('offers Apple on iOS and the anonymous smoke-test path in development', () => {
    expect(providerIdsForRuntime({ platform: 'ios', development: true })).toEqual([
      'apple',
      'anonymous',
    ]);
  });

  it('ships only Apple sign-in in iOS production', () => {
    expect(providerIdsForRuntime({ platform: 'ios', development: false })).toEqual([
      'apple',
    ]);
  });

  it('offers only the anonymous smoke-test path on Android development builds', () => {
    expect(providerIdsForRuntime({ platform: 'android', development: true })).toEqual([
      'anonymous',
    ]);
  });

  it('does not imply a production Android authentication strategy yet', () => {
    expect(providerIdsForRuntime({ platform: 'android', development: false })).toEqual([]);
  });
});

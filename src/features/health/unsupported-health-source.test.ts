import { describe, expect, it, vi } from 'vitest';
import { unsupportedHealthSource } from './unsupported-health-source.ts';

describe('unsupported health source', () => {
  it('never presents a permission flow or creates observer subscriptions', async () => {
    const changed = vi.fn();

    expect(unsupportedHealthSource.isAvailable()).toBe(false);
    await expect(unsupportedHealthSource.readPermissionState()).resolves.toBe(
      'unavailable',
    );
    await expect(unsupportedHealthSource.requestPermission()).resolves.toBe(false);
    await expect(
      unsupportedHealthSource.configureBackgroundDelivery(),
    ).resolves.toBe(false);
    expect(unsupportedHealthSource.subscribeToChanges(changed)).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
  });

  it('fails closed if an Android path accidentally attempts a health read', async () => {
    await expect(unsupportedHealthSource.readStepsToday('UTC')).rejects.toThrow(
      'Health data is unsupported on this platform',
    );
    await expect(
      unsupportedHealthSource.readDailySteps(['2026-09-03'], 'UTC'),
    ).rejects.toThrow('Health data is unsupported on this platform');
  });
});

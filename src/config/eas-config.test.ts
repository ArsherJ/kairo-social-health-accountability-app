import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type EasConfig = {
  cli?: { appVersionSource?: string };
  build?: Record<string, unknown>;
  submit?: Record<string, unknown>;
};

function readEasConfig(): EasConfig {
  return JSON.parse(
    readFileSync(new URL('../../eas.json', import.meta.url), 'utf8'),
  ) as EasConfig;
}

describe('EAS migration profiles', () => {
  it('uses remote build numbers so every TestFlight upload is unique', () => {
    expect(readEasConfig().cli?.appVersionSource).toBe('remote');
  });

  it('provides an installable development client for both native platforms', () => {
    expect(readEasConfig().build?.development).toEqual({
      developmentClient: true,
      distribution: 'internal',
      environment: 'development',
      android: { buildType: 'apk' },
      ios: { simulator: false },
    });
  });

  it('keeps production distribution iOS-only during the Android foundation phase', () => {
    expect(readEasConfig().build?.['ios-production']).toEqual({
      distribution: 'store',
      environment: 'production',
      autoIncrement: true,
      ios: { simulator: false },
    });
    expect(Object.keys(readEasConfig().build ?? {}).sort()).toEqual([
      'development',
      'ios-production',
    ]);
  });

  it('defines the submit profile used by the main-branch workflow', () => {
    expect(readEasConfig().submit?.['ios-production']).toEqual({
      ios: { ascAppId: '6800990955' },
    });
  });

  it('keeps generated native projects out of Git and EAS uploads', () => {
    const activeIgnore = readFileSync(
      new URL('../../.easignore', import.meta.url),
      'utf8',
    );
    const gitIgnore = readFileSync(
      new URL('../../.gitignore', import.meta.url),
      'utf8',
    );

    expect(activeIgnore).toContain('\n/ios/\n/android/\n');
    expect(activeIgnore).toContain('\n.env\n.env.*\n');
    expect(gitIgnore).toContain('\n/ios/\n/android/\n');
  });
});

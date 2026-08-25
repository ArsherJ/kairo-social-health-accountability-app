import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import appConfig from '../../app.config.ts';

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
      channel: 'development',
      developmentClient: true,
      distribution: 'internal',
      environment: 'development',
      android: { buildType: 'apk' },
      ios: { simulator: false },
    });
  });

  it('keeps production distribution iOS-only during the Android foundation phase', () => {
    expect(readEasConfig().build?.['ios-production']).toEqual({
      channel: 'production',
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

/**
 * EAS Update is the build-quota valve: a JS or asset change reaches installed
 * builds for free, and only a native change spends one of the month's builds.
 * Every assertion here guards a failure that reports nothing at all — an update
 * that is published successfully and simply never arrives, or worse, one that
 * arrives at a build whose native side no longer matches it.
 */
describe('EAS Update', () => {
  it('gives every build profile a channel, since one without it takes no updates', () => {
    // A build with no channel is not subscribed to anything. It installs and
    // runs perfectly and silently ignores every update ever published to it,
    // which is indistinguishable from OTA being broken.
    const profiles = Object.entries(readEasConfig().build ?? {});
    expect(profiles.length).toBeGreaterThan(0);
    for (const [name, profile] of profiles) {
      expect(
        (profile as { channel?: string }).channel,
        `build profile "${name}" declares no update channel`,
      ).toBeTruthy();
    }
  });

  it('resolves the runtime version by fingerprint, not by app version', () => {
    // `appVersion` would tie compatibility to the `version` string, so an
    // update would reach any build sharing it — including one built before a
    // native module was added. That bricks older builds on launch with no
    // recovery except a new build through review. `fingerprint` hashes the real
    // native inputs, so a native change moves the runtime version by
    // construction and old builds are simply not offered the update.
    expect(appConfig.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  it('never blocks launch on the update check', () => {
    // 0 means: launch from the cached bundle now, fetch in the background,
    // apply next launch. A non-zero value blocks the first frame on a network
    // request — and this app has already shipped one permanent hold overlay
    // (2026-08-14) caused by a host that resolved but never connected. Nothing
    // guards this request the way `fetch-timeout.ts` guards Supabase.
    expect(appConfig.updates?.fallbackToCacheTimeout).toBe(0);
  });

  it('points the update URL at the same EAS project as extra.eas', () => {
    // These two are written from one constant. If they ever drift, the app asks
    // a project it does not belong to for manifests, receives no update, and
    // reports no error.
    const projectId = (
      appConfig.extra as { eas?: { projectId?: string } } | undefined
    )?.eas?.projectId;
    expect(projectId).toBeTruthy();
    expect(appConfig.updates?.url).toBe(`https://u.expo.dev/${projectId}`);
  });

  it('keeps the native directories Git-ignored so fingerprints match EAS', () => {
    // Subtle and load-bearing. @expo/fingerprint resolves the project workflow
    // by asking whether the native project marker is Git-ignored: ignored means
    // `managed`, tracked means `generic`, and the two hash differently. EAS
    // builds via CNG with no `ios/` at all, so it computes `managed`. A local
    // `eas update` runs against a working tree where `npm run prebuild` has
    // materialised `ios/` — and still computes `managed` only because these
    // entries are here. Commit the native directories and every locally
    // published update silently targets a runtime version no build has.
    const gitIgnore = readFileSync(
      new URL('../../.gitignore', import.meta.url),
      'utf8',
    );
    expect(gitIgnore).toContain('\n/ios/\n/android/\n');
  });
});

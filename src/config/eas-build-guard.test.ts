import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const guardScript = new URL('../../scripts/guard-eas-build-platform.mjs', import.meta.url);

function runGuard(profile: string, platform: string) {
  return spawnSync(process.execPath, [guardScript.pathname], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EAS_BUILD_PROFILE: profile,
      EAS_BUILD_PLATFORM: platform,
    },
  });
}

describe('EAS build platform guard', () => {
  it('blocks production-like Android builds during the development-only phase', () => {
    const result = runGuard('ios-production', 'android');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Android builds are development-only');
  });

  it('allows the approved iOS production and Android development builds', () => {
    expect(runGuard('ios-production', 'ios').status).toBe(0);
    expect(runGuard('development', 'android').status).toBe(0);
  });

  it('runs automatically before every remote EAS build install', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['eas-build-pre-install']).toBe(
      'node scripts/guard-eas-build-platform.mjs',
    );
  });

  it('submits the artifact from the same iOS build instead of the latest build', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['eas:build:ios:production']).toBe(
      'eas build --platform ios --profile ios-production --auto-submit',
    );
    expect(packageJson.scripts?.['eas:submit:ios:production']).toBeUndefined();
  });
});

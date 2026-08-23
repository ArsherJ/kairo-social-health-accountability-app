import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const guardScript = new URL('../../scripts/guard-eas-build-platform.mjs', import.meta.url);

const safePublicConfig = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_value',
};

function runGuard(
  profile: string,
  platform: string,
  overrides: Record<string, string | undefined> = {},
) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...safePublicConfig,
    EAS_BUILD_PROFILE: profile,
    EAS_BUILD_PLATFORM: platform,
    ...overrides,
  };

  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) delete env[name];
  }

  return spawnSync(process.execPath, [guardScript.pathname], {
    encoding: 'utf8',
    env: env as NodeJS.ProcessEnv,
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

  it.each([
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ])('blocks a build when %s is missing', (name) => {
    const result = runGuard('ios-production', 'ios', { [name]: undefined });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${name} is missing or empty`);
    expect(result.stderr).not.toContain(safePublicConfig.EXPO_PUBLIC_SUPABASE_URL);
    expect(result.stderr).not.toContain(
      safePublicConfig.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  });

  it.each([
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ])('blocks a build when %s is empty', (name) => {
    const result = runGuard('ios-production', 'ios', { [name]: '   ' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${name} is missing or empty`);
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

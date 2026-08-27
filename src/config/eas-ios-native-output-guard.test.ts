import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const guardScript = fileURLToPath(
  new URL('../../scripts/verify-ios-native-output.mjs', import.meta.url),
);
const fixtures: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'kairo-eas-ios-'));
  fixtures.push(root);
  return root;
}

function writePodfileProperties(root: string, value: unknown = 'true'): void {
  const ios = join(root, 'ios');
  mkdirSync(ios, { recursive: true });
  writeFileSync(
    join(ios, 'Podfile.properties.json'),
    JSON.stringify({ 'ios.buildReactNativeFromSource': value }),
  );
}

function writeFrameworksScript(root: string, embedsExpoModulesJSI = true): void {
  const support = join(
    root,
    'ios',
    'Pods',
    'Target Support Files',
    'Pods-Generated-App',
  );
  mkdirSync(support, { recursive: true });
  writeFileSync(
    join(support, 'Pods-Generated-App-frameworks.sh'),
    embedsExpoModulesJSI
      ? 'install_framework "${PODS_XCFRAMEWORKS_BUILD_DIR}/ExpoModulesJSI/ExpoModulesJSI.framework"\n'
      : 'install_framework "${PODS_XCFRAMEWORKS_BUILD_DIR}/Other/Other.framework"\n',
  );
}

/**
 * Writes the Expo.plist that CNG generates from the `updates` block in
 * `app.config.ts`. Defaults are the values a correct build produces; pass
 * overrides to simulate a regression.
 */
function writeExpoPlist(
  root: string,
  overrides: Record<string, string> = {},
): void {
  const values: Record<string, string> = {
    EXUpdatesEnabled: '<true/>',
    EXUpdatesRuntimeVersion: '<string>file:fingerprint</string>',
    EXUpdatesLaunchWaitMs: '<integer>0</integer>',
    EXUpdatesURL:
      '<string>https://u.expo.dev/ccfa0966-3aa9-4548-b5a2-6e311816d8de</string>',
    ...overrides,
  };
  const supporting = join(root, 'ios', 'Kairo', 'Supporting');
  mkdirSync(supporting, { recursive: true });
  const body = Object.entries(values)
    .map(([key, value]) => `    <key>${key}</key>\n    ${value}`)
    .join('\n');
  writeFileSync(
    join(supporting, 'Expo.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n  <dict>\n${body}\n  </dict>\n</plist>\n`,
  );
}

function completeFixture(): string {
  const root = fixture();
  writePodfileProperties(root);
  writeFrameworksScript(root);
  writeExpoPlist(root);
  return root;
}

function runGuard(root: string, platform = 'ios') {
  return spawnSync(process.execPath, [guardScript], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, EAS_BUILD_PLATFORM: platform },
  });
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('EAS iOS native output guard', () => {
  it('fails when Podfile.properties.json is missing', () => {
    const root = fixture();
    writeFrameworksScript(root);
    writeExpoPlist(root);

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ios/Podfile.properties.json is missing');
  });

  it('fails when Podfile.properties.json is invalid', () => {
    const root = fixture();
    mkdirSync(join(root, 'ios'), { recursive: true });
    writeFileSync(join(root, 'ios', 'Podfile.properties.json'), '{invalid');
    writeFrameworksScript(root);
    writeExpoPlist(root);

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ios/Podfile.properties.json is invalid JSON');
  });

  it('fails when React Native core is not configured to build from source', () => {
    const root = fixture();
    writePodfileProperties(root, 'false');
    writeFrameworksScript(root);
    writeExpoPlist(root);

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'ios.buildReactNativeFromSource must be true',
    );
  });

  it('fails when the React-Core-prebuilt pod exists', () => {
    const root = completeFixture();
    mkdirSync(join(root, 'ios', 'Pods', 'React-Core-prebuilt'), {
      recursive: true,
    });

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('React-Core-prebuilt exists');
  });

  it('fails when no generated frameworks script embeds ExpoModulesJSI.framework', () => {
    const root = fixture();
    writePodfileProperties(root);
    writeFrameworksScript(root, false);
    writeExpoPlist(root);

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'no generated Pods target frameworks script embeds ExpoModulesJSI.framework',
    );
  });

  it('fails when Expo.plist is missing entirely', () => {
    // expo-updates silently not configuring the generated project. The build
    // would succeed and ship an app that ignores every update published to it.
    const root = fixture();
    writePodfileProperties(root);
    writeFrameworksScript(root);

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Expo.plist is missing');
  });

  it('fails when updates are disabled in the generated project', () => {
    const root = completeFixture();
    writeExpoPlist(root, { EXUpdatesEnabled: '<false/>' });

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EXUpdatesEnabled is not true');
  });

  it('fails when the fingerprint runtime version policy did not survive prebuild', () => {
    // A literal version string means the policy reverted to `appVersion`, which
    // would let a later update reach builds whose native side no longer matches.
    const root = completeFixture();
    writeExpoPlist(root, { EXUpdatesRuntimeVersion: '<string>0.1.0</string>' });

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EXUpdatesRuntimeVersion is not');
  });

  it('fails when the update check would block app launch', () => {
    const root = completeFixture();
    writeExpoPlist(root, { EXUpdatesLaunchWaitMs: '<integer>5000</integer>' });

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EXUpdatesLaunchWaitMs is not 0');
  });

  it('fails when the update URL is not an EAS Update endpoint', () => {
    const root = completeFixture();
    writeExpoPlist(root, {
      EXUpdatesURL: '<string>https://example.com/updates</string>',
    });

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EXUpdatesURL is not a valid');
  });

  it('passes when generated iOS output satisfies every native invariant', () => {
    const result = runGuard(completeFixture());

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('does nothing on non-iOS builds', () => {
    const result = runGuard(fixture(), 'android');

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('runs automatically after EAS finishes native dependency installation', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['eas-build-post-install']).toBe(
      'node scripts/verify-ios-native-output.mjs',
    );
  });
});

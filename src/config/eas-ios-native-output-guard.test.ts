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

function completeFixture(): string {
  const root = fixture();
  writePodfileProperties(root);
  writeFrameworksScript(root);
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

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ios/Podfile.properties.json is missing');
  });

  it('fails when Podfile.properties.json is invalid', () => {
    const root = fixture();
    mkdirSync(join(root, 'ios'), { recursive: true });
    writeFileSync(join(root, 'ios', 'Podfile.properties.json'), '{invalid');
    writeFrameworksScript(root);

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ios/Podfile.properties.json is invalid JSON');
  });

  it('fails when React Native core is not configured to build from source', () => {
    const root = fixture();
    writePodfileProperties(root, 'false');
    writeFrameworksScript(root);

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

    const result = runGuard(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'no generated Pods target frameworks script embeds ExpoModulesJSI.framework',
    );
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

#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';

// EAS runs this post-install hook after npm install, CNG prebuild and pod
// install. At this point the generated iOS outcome exists and can be asserted
// directly. These checks replace the artifact assertions in the retired Xcode
// Cloud post-clone script.
if (process.env.EAS_BUILD_PLATFORM !== 'ios') {
  process.exit(0);
}

const projectRoot = process.cwd();
const iosRoot = join(projectRoot, 'ios');
const propertiesPath = join(iosRoot, 'Podfile.properties.json');
const fromSourceKey = 'ios.buildReactNativeFromSource';

function fail(message) {
  console.error(`EAS iOS native output guard: ${message}`);
  process.exit(1);
}

if (!existsSync(propertiesPath)) {
  fail('ios/Podfile.properties.json is missing after CNG prebuild.');
}

let properties;
try {
  properties = JSON.parse(readFileSync(propertiesPath, 'utf8'));
} catch {
  fail('ios/Podfile.properties.json is invalid JSON.');
}

if (
  properties?.[fromSourceKey] !== 'true' &&
  properties?.[fromSourceKey] !== true
) {
  fail(
    'ios.buildReactNativeFromSource must be true in ios/Podfile.properties.json.',
  );
}

if (existsSync(join(iosRoot, 'Pods', 'React-Core-prebuilt'))) {
  fail(
    'ios/Pods/React-Core-prebuilt exists; the incompatible prebuilt React Native core was linked.',
  );
}

const targetSupportRoot = join(iosRoot, 'Pods', 'Target Support Files');

function findFrameworkScripts(directory) {
  if (!existsSync(directory)) return [];

  const scripts = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      scripts.push(...findFrameworkScripts(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('-frameworks.sh')) {
      scripts.push(entryPath);
    }
  }
  return scripts;
}

let frameworkScripts;
try {
  frameworkScripts = findFrameworkScripts(targetSupportRoot);
} catch {
  fail('generated Pods target support files could not be inspected.');
}

let embedsExpoModulesJSI;
try {
  embedsExpoModulesJSI = frameworkScripts.some((script) => {
    const contents = readFileSync(script, 'utf8');
    return /^\s*install_framework\s+["'][^"'\n]*ExpoModulesJSI\.framework["']/m.test(
      contents,
    );
  });
} catch {
  fail('generated Pods target frameworks scripts could not be inspected.');
}

if (!embedsExpoModulesJSI) {
  fail(
    'no generated Pods target frameworks script embeds ExpoModulesJSI.framework.',
  );
}

// EAS Update must survive CNG into the generated project, and its absence is
// silent in every direction: the build succeeds, installs, runs, and simply
// ignores every update ever published to it. That is indistinguishable from OTA
// being broken, and it is only discoverable by publishing an update and waiting
// for it not to arrive — after the build is already spent. Same failure shape as
// `aps-environment` and Associated Domains, so it is asserted here where the
// generated outcome actually exists.
const expoPlistPath = join(iosRoot, 'Kairo', 'Supporting', 'Expo.plist');

if (!existsSync(expoPlistPath)) {
  fail(
    'ios/Kairo/Supporting/Expo.plist is missing; expo-updates did not configure the generated project.',
  );
}

const expoPlist = readFileSync(expoPlistPath, 'utf8');

/**
 * Reads one value out of the generated Expo.plist.
 *
 * Deliberately a regex rather than a plist parser: this script runs on the EAS
 * worker before anything project-local is guaranteed importable, and it must
 * not add a dependency to do it. The file is machine-generated, so its shape is
 * stable. `<true/>` and `<false/>` are self-closing, hence the two branches.
 */
function readPlistValue(key) {
  const selfClosing = new RegExp(
    `<key>${key}</key>\\s*<(true|false)\\s*/>`,
  ).exec(expoPlist);
  if (selfClosing) return selfClosing[1];

  const valued = new RegExp(
    `<key>${key}</key>\\s*<(?:string|integer)>([^<]*)</(?:string|integer)>`,
  ).exec(expoPlist);
  return valued ? valued[1] : null;
}

if (readPlistValue('EXUpdatesEnabled') !== 'true') {
  fail('EXUpdatesEnabled is not true in the generated Expo.plist.');
}

// `file:fingerprint` is what the fingerprint runtimeVersion policy generates:
// the hash is computed during the build and written to a bundled `fingerprint`
// file. A literal version string here means the policy silently reverted to
// `appVersion`, which would let a future update reach builds whose native side
// no longer matches it.
if (readPlistValue('EXUpdatesRuntimeVersion') !== 'file:fingerprint') {
  fail(
    'EXUpdatesRuntimeVersion is not "file:fingerprint"; the fingerprint runtime version policy did not survive prebuild.',
  );
}

// 0 means launch from the cached bundle and fetch in the background. Anything
// higher blocks the first frame on a network request, which is how this app
// shipped a permanent hold overlay once already.
if (readPlistValue('EXUpdatesLaunchWaitMs') !== '0') {
  fail(
    'EXUpdatesLaunchWaitMs is not 0; the update check would block app launch.',
  );
}

if (!/^https:\/\/u\.expo\.dev\/[0-9a-f-]{36}$/.test(readPlistValue('EXUpdatesURL') ?? '')) {
  fail('EXUpdatesURL is not a valid EAS Update endpoint in the generated Expo.plist.');
}

console.log('EAS iOS native output guard: verified generated native outcomes.');

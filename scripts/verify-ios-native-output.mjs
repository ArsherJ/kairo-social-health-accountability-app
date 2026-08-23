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

console.log('EAS iOS native output guard: verified generated native outcomes.');

#!/usr/bin/env node
/**
 * Copy `scripts/ci/*.sh` into `ios/ci_scripts/`, executable.
 *
 * Why this exists: Apple looks for the `ci_scripts` directory "in the same
 * directory as your Xcode project or workspace" — for this repo that is `ios/`,
 * not the repository root. And `npm run prebuild` runs `expo prebuild --clean`,
 * which deletes `ios/` wholesale, so a script committed there survives exactly
 * until the next regeneration.
 *
 * So `scripts/ci/` is the source of truth and `ios/ci_scripts/` is a generated
 * copy — committed like the rest of `ios/` (roadmap deviation #28) and rebuilt
 * by `postprebuild`. Exactly the arrangement `write-xcode-env.mjs` already uses
 * for `.xcode.env.local`, for exactly the same reason.
 *
 * The executable bit is not decoration. Xcode Cloud honours a script's shebang
 * only when the file is executable; otherwise it runs it as `zsh <file>`, and
 * a non-executable script can also be skipped outright.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(PROJECT, 'scripts', 'ci');
const IOS_DIR = join(PROJECT, 'ios');
const TARGET = join(IOS_DIR, 'ci_scripts');

// Not an error: this runs from postprebuild, and prebuild can be interrupted
// before the directory exists. A fresh clone has ios/ committed, so the normal
// case is that it is present.
if (!existsSync(IOS_DIR)) {
  console.log('install-ci-scripts: no ios/ yet, skipping');
  process.exit(0);
}

mkdirSync(TARGET, { recursive: true });

const scripts = readdirSync(SOURCE).filter((name) => name.endsWith('.sh'));

for (const name of scripts) {
  const destination = join(TARGET, name);
  copyFileSync(join(SOURCE, name), destination);
  chmodSync(destination, 0o755);
}

console.log(`install-ci-scripts: installed ${scripts.join(', ')} into ios/ci_scripts/`);

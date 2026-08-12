#!/bin/sh
#
# Xcode Cloud — post-clone. Runs after the repository is cloned and before
# Xcode Cloud resolves dependencies.
#
# SOURCE OF TRUTH. The copy Xcode Cloud actually runs lives at
# `ios/ci_scripts/ci_post_clone.sh`, because Apple looks for `ci_scripts` in the
# directory holding the project or workspace — for this repo that is `ios/`, and
# `expo prebuild --clean` deletes `ios/` wholesale. So the file is edited here
# and installed there by `scripts/install-ci-scripts.mjs`, which `postprebuild`
# runs. Same shape as `write-xcode-env.mjs`, for the same reason. Editing the
# copy under ios/ works until the next prebuild silently reverts it.
#
# Xcode Cloud's default shell is zsh; the shebang above is honoured only because
# the installer marks the file executable.
set -e

cd "$CI_PRIMARY_REPOSITORY_PATH"

# Xcode Cloud images ship Homebrew, Xcode and CocoaPods — but no node. Install
# before anything else: Expo's Podfile shells out to `node --print
# "require.resolve('expo/package.json')"`, so `pod install` below fails without
# it. Guarded so the step is free if a future image starts shipping one new
# enough.
if ! command -v node >/dev/null 2>&1 ||
  [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  brew install node@22
  brew link --overwrite --force node@22
fi
node --version

npm ci

# `ios/.xcode.env` resolves NODE_BINARY with `command -v node`, and Xcode runs
# script phases under a restricted PATH — the Hermes phase then dies with
# "line 9: : command not found". Identical failure to the local one; identical
# fix. `postinstall` already ran this as part of `npm ci`; it is repeated
# because it is the line the build depends on, and a silent reorder of
# postinstall should not be able to take the build down.
node scripts/write-xcode-env.mjs

# ios/Pods is not committed (1.2 GB). Podfile.lock is, so this is deterministic.
cd ios
pod install

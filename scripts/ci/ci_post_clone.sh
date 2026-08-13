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

# --- ExpoModulesJSI embed guard ---------------------------------------------
# The expo-modules-jsi npm package ships no binary; its xcframework is produced
# by a build-time script phase. Whether CocoaPods *embeds* that framework in the
# app is decided earlier, at `pod install` time, by inspecting a stub xcframework
# that expo-modules-autolinking creates from a pre-install hook — and that hook
# discards the script's exit status, so a failure there is silent.
#
# On Xcode Cloud the classification came out wrong. Build 2's archive log runs
# [CP] Embed Pods Frameworks with 7 of its 8 install_framework calls; the missing
# one is ExpoModulesJSI. Archive, export and upload all still succeed, and the
# app dies on launch with:
#   Library not loaded: @rpath/ExpoModulesJSI.framework/ExpoModulesJSI
# That is what shipped to TestFlight.
#
# A fully-fresh `pod install` on the dev Mac (no Pods/, no Products/, CocoaPods
# 1.17.0) emits all 8, so the difference is environmental and is NOT yet pinned
# down — CI never prints its CocoaPods version, which is the leading suspect.
# The diagnostics below exist to close that gap from the next build's log.
#
# Creating the stub explicitly is idempotent and puts it in place before
# CocoaPods runs, with `set -e` free to catch a failure the hook would swallow.
# The assertion after `pod install` is the real protection: it converts a
# crash-on-launch into a build failure that names its own cause.
JSI_APPLE_DIR="$CI_PRIMARY_REPOSITORY_PATH/node_modules/expo-modules-jsi/apple"
if [ -f "$JSI_APPLE_DIR/scripts/create-stub-xcframework.sh" ]; then
  # Invoked through `bash` rather than executed, so a missing exec bit cannot
  # turn this into a silent no-op.
  (cd "$JSI_APPLE_DIR" && bash ./scripts/create-stub-xcframework.sh)
fi

echo "--- ExpoModulesJSI state going into pod install ---"
pod --version
file "$JSI_APPLE_DIR/Products/ExpoModulesJSI.xcframework/ios-arm64/ExpoModulesJSI.framework/ExpoModulesJSI" \
  || echo "  no ios-arm64 stub binary — CocoaPods will classify this pod static"

# ios/Pods is not committed (1.2 GB). Podfile.lock is, so this is deterministic.
cd ios
pod install

EMBED_SCRIPT="Pods/Target Support Files/Pods-Kairo/Pods-Kairo-frameworks.sh"
echo "--- frameworks the app will embed ---"
grep 'install_framework "' "$EMBED_SCRIPT" | sed 's/.*XCFRAMEWORKS_BUILD_DIR}\///' | sort -u

if ! grep -q 'ExpoModulesJSI\.framework' "$EMBED_SCRIPT"; then
  echo "error: pod install omitted ExpoModulesJSI from $EMBED_SCRIPT." >&2
  echo "error: archiving would still succeed and the app would crash on launch with" >&2
  echo "error: 'Library not loaded: @rpath/ExpoModulesJSI.framework/ExpoModulesJSI'." >&2
  echo "error: see the ExpoModulesJSI embed guard in scripts/ci/ci_post_clone.sh." >&2
  exit 1
fi

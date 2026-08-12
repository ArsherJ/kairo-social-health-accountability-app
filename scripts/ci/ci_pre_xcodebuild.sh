#!/bin/sh
#
# Xcode Cloud — pre-xcodebuild. Runs after dependency resolution, before
# `xcodebuild`.
#
# SOURCE OF TRUTH — see the header of `ci_post_clone.sh` in this directory.
set -e

cd "$CI_PRIMARY_REPOSITORY_PATH"

# Fail here rather than on the device. `src/lib/supabase.ts` reads
# `Constants.expoConfig.extra`, which `app.config.ts` fills from these two
# variables at bundle time — so if they are missing from the workflow's
# Environment section the archive succeeds, uploads, installs, and throws
# "Supabase config missing" on launch. Thirty seconds here beats a 25-minute
# build and a TestFlight round trip. Both are marked secret in the workflow, so
# a value can never reach the build log.
: "${EXPO_PUBLIC_SUPABASE_URL:?not set — add it to the workflow's Environment section}"
: "${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?not set — add it to the workflow's Environment section}"

# Every TestFlight upload needs a unique CFBundleVersion. `ios/` is committed
# (roadmap deviation #28) so prebuild does not run here and `app.config.ts`
# cannot reach CI_BUILD_NUMBER — the plist is patched directly instead.
# CI_BUILD_NUMBER is monotonic per workflow, which is exactly App Store
# Connect's requirement. The committed literal ("1") stays the local value.
if [ -z "$CI_BUILD_NUMBER" ]; then
  echo "ci_pre_xcodebuild: CI_BUILD_NUMBER unset, leaving CFBundleVersion as committed"
else
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $CI_BUILD_NUMBER" ios/Kairo/Info.plist
  echo "ci_pre_xcodebuild: CFBundleVersion=$CI_BUILD_NUMBER"
fi

const { withPodfileProperties } = require('expo/config-plugins');

// Builds React Native's core from source instead of linking Meta's prebuilt
// `React.xcframework`. Without this the app corrupts its own heap on launch and
// dies before the first frame.
//
// ## The failure
//
// RN 0.86 ships React core, ReactNativeDependencies and hermesvm as prebuilt
// binary xcframeworks (`React-Core-prebuilt`) to cut build times. Meta compiles
// those against a pinned toolchain — the shipped artifacts carry libc++'s
// `abi:ne190102` tag (libc++ 19, Xcode 16). Every pod CocoaPods builds locally
// — ExpoModulesCore among them — compiles against whatever Xcode is installed,
// here 26.6, which is `abi:nqe210106` (libc++ 21).
//
// libc++ changed the layout of a type that `facebook::react::ShadowNodeFamily`
// holds by value between those versions, so the two halves of the app disagree
// about `sizeof(ShadowNodeFamily)` — 400 bytes as React.framework sees it,
// 336 as ExpoModulesCore sees it. That is a textbook ODR violation, and the
// headers are identical, so nothing warns.
//
// It detonates on the first render. `ExpoViewComponentDescriptor::createFamily`
// inlines `make_shared<ShadowNodeFamily>`, so ExpoModulesCore allocates its own
// (short) 360-byte block, then calls React.framework's out-of-line constructor,
// which initialises members out to offset 400 — **64 bytes past the end of the
// heap block**, on every Expo view created.
//
// ## Why the crash reports never pointed here
//
// They can't: the overflow scribbles the malloc metadata of whatever block sits
// next, so the process dies at some *later, unrelated* allocation. Observed
// signatures from five consecutive launches of one binary:
//
//   - EXC_BAD_ACCESS in `-[RCTComponentViewFactory createComponentViewWithComponentHandle:]`
//     (the map lookup returns a garbage iterator) — this is what TestFlight reported
//   - malloc freelist abort on the JS thread inside RCTTextLayoutManager's cache
//   - malloc freelist abort on the main thread inside `ProcessInfo.environment`,
//     reached from SwiftUI under `-[UINavigationController loadView]`
//
// Chasing any one of them leads into React Native's or Apple's code, which is
// innocent. The tell is that the signature *changes between runs of the same
// binary*: that is heap corruption, not a bug where it crashed. Guard Malloc
// (`DYLD_INSERT_LIBRARIES=/usr/lib/libgmalloc.dylib`, default guard-after
// placement — `MALLOC_PROTECT_BEFORE` hides overflows and reports the app as
// healthy) is what pins it to the offending write in one run.
//
// ## Why this fix and not another
//
// The prebuilt artifacts are published by Meta; their toolchain is not ours to
// change, and there is no version of them built with libc++ 21. Building from
// source puts every translation unit through one compiler, so the mismatch
// cannot exist. `ios.buildReactNativeFromSource` is Expo's own supported knob —
// `ios/Podfile` already reads it to set `RCT_USE_PREBUILT_RNCORE` and
// `RCT_USE_RN_DEP` to '0'. The cost is real and is the whole reason prebuilts
// exist: a clean build compiles React Native itself, so CI gets substantially
// slower.
//
// This is a config plugin rather than a hand-edit of `ios/Podfile.properties.json`
// because local prebuilds and EAS CNG regenerate that file — the same reason
// withHealthKitBackgroundObservers exists. The CNG TestFlight build has
// explicitly verified that this plugin reproduces the required value.
const KEY = 'ios.buildReactNativeFromSource';

function withReactNativeFromSource(config) {
  return withPodfileProperties(config, (config) => {
    config.modResults[KEY] = 'true';
    return config;
  });
}

module.exports = withReactNativeFromSource;

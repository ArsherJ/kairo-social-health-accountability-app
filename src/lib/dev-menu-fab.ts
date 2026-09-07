import { requireOptionalNativeModule } from 'expo';

/**
 * Turns off the dev client's floating gear.
 *
 * `expo-dev-menu` draws a grey floating action button in its own passthrough
 * window, over every screen, and its default is **on**
 * (`DevMenuPreferences.setup()` registers `showFloatingActionButton: true`).
 * That is fine for a debugging session and wrong for a screenshot: it sits in
 * the corner of every capture taken from a development build, which is the
 * only kind of build this machine can drive.
 *
 * **It is already absent from TestFlight**, and that is a property of the
 * podspec rather than of this call: `expo-dev-client`'s podspec declares
 * `s.dependency 'expo-dev-menu', :configurations => :debug`, so the pod is not
 * linked into a Release configuration at all. `ios-production` builds Release,
 * so nothing in a store or TestFlight build can draw the gear. This exists for
 * the development build.
 *
 * **A runtime write rather than the Info.plist key it shadows.** The default
 * can also be set declaratively, with `EXDevMenuShowFloatingActionButton` under
 * `ios.infoPlist` — and the resolved Expo config is a fingerprint input, so
 * that one line costs a native build and orphans every OTA until it lands.
 * Measured rather than assumed on 2026-09-07: adding it took the tree's
 * runtimeVersion from `9d76c5d3…` to `89a1b399…`. A JS write reaches the
 * installed dev build for nothing.
 *
 * The gear is an affordance, not the only one: shake, the three-finger long
 * press and ⌘D all still open the menu, and this deliberately leaves those
 * alone rather than reaching for `motionGestureEnabled` beside it.
 *
 * Not tested. It is three lines over a native module that only exists in a
 * debug build, so there is nothing here root Vitest could load, let alone
 * assert.
 */

interface DevMenuPreferences {
  setPreferencesAsync(settings: { showFloatingActionButton?: boolean }): Promise<void>;
}

export function hideDevMenuFloatingButton(): void {
  // Belt and braces, and each half covers the other's blind spot: `__DEV__` is
  // false in a release JS bundle, and the module is absent from a release
  // binary. A dev bundle running against a release binary is exactly the
  // arrangement neither one alone would catch.
  if (!__DEV__) return;

  const preferences = requireOptionalNativeModule<DevMenuPreferences>('DevMenuPreferences');
  if (preferences === null) return;

  // Swallowed. Failing to hide a dev affordance is not worth an unhandled
  // rejection on a screen the user is trying to look at.
  void preferences.setPreferencesAsync({ showFloatingActionButton: false }).catch(() => {});
}

import type { ExpoConfig } from 'expo/config';
// The one place the invite domain is written. Imported rather than repeated:
// the entitlement generated from `associatedDomains` below and the URL in the
// share message must name the same host, and if they drift the link opens
// Safari with nothing reporting an error.
import { INVITE_HOST } from './src/features/squad/invite-link.ts';

/**
 * Kairo — Expo app config.
 *
 * The HealthKit plugin's `background: true` is load-bearing, not optional. It
 * adds the background-delivery entitlement and registers observer queries in
 * didFinishLaunchingWithOptions the way Apple requires. Background sync is free
 * for every user (spec §12), and the real-time leaderboard depends on it.
 *
 * The matching capability must ALSO be enabled on the App ID in the Apple
 * Developer portal. Without it the build installs fine and silently returns no
 * health data — a genuinely miserable thing to debug.
 *
 * THIS FILE IS NO LONGER THE SOURCE OF TRUTH FOR NATIVE CONFIG. `ios/` is
 * committed so Xcode Cloud can resolve a scheme (roadmap deviation #28), and
 * prebuild does not run in CI — the committed `ios/Kairo/Info.plist` and
 * `Kairo.entitlements` are what ship. Changing anything native here
 * (`usesAppleSignIn`, `NSHealthShareUsageDescription`, the HealthKit plugin's
 * `background: true`, a new plugin) requires `npm run prebuild` AND a commit of
 * the regenerated `ios/`, or the change silently does not reach the build.
 * The JS side is unaffected: `extra` and `EXPO_PUBLIC_*` are evaluated during
 * the bundle phase of the Xcode build, so CI environment variables do land.
 */

const config: ExpoConfig = {
  name: 'Kairo',
  slug: 'kairo',
  owner: 'eddytion47',
  version: '0.1.0',
  orientation: 'portrait',
  // Deep-link scheme. §14 routes eight notification types straight to a screen.
  scheme: 'kairo',
  userInterfaceStyle: 'dark',
  // No newArchEnabled flag: React Native 0.83 dropped the legacy architecture,
  // so New Architecture is the only option and the option was removed.

  ios: {
    bundleIdentifier: 'com.arsherj.kairo',
    supportsTablet: false,
    // Xcode refuses to sign for a physical device without a team, and
    // `expo prebuild --clean` deletes `ios/` — so setting it in Xcode's UI
    // survives exactly until the next prebuild. Declaring it here is what makes
    // device builds reproducible. Not a secret: a Team ID appears in every
    // app's provisioning profile.
    //
    // It does not create the signing certificate. That comes from adding the
    // Apple ID under Xcode → Settings → Accounts, which is per-machine and
    // cannot live in config.
    appleTeamId: '8C53KVSFWK',
    // Writes the Sign in with Apple entitlement. Like HealthKit's, the matching
    // capability must ALSO be enabled on the App ID in the Developer portal —
    // without it the entitlement is present, the button renders, and
    // `signInAsync` fails with ERR_REQUEST_UNKNOWN, which looks identical to a
    // device that is not signed into an Apple ID. Changing this needs a native
    // rebuild (`npm run prebuild && npm run ios`), not a JS reload.
    usesAppleSignIn: true,
    // Universal links (design §11, deviation #36). No `https://` prefix —
    // Apple's format is `applinks:<host>`, and including the scheme is the
    // documented mistake that makes links silently fall back to Safari.
    //
    // Declaring it here is not sufficient. Because `ios/` is committed
    // (deviation #28) Xcode Cloud ships the entitlements file as it finds it,
    // so this needs `npm run prebuild` AND a commit of the regenerated `ios/`.
    // And the Associated Domains capability must be enabled on the App ID in
    // the Developer portal — without it the entitlement is present, the link
    // resolves to Safari, and nothing reports an error.
    associatedDomains: [`applinks:${INVITE_HOST}`],
    // CFBundleVersion. Every TestFlight upload needs a unique one, and because
    // `ios/` is committed (roadmap deviation #28) prebuild does not run in CI —
    // so this value cannot be derived from `CI_BUILD_NUMBER` through the config.
    // `ci_scripts/ci_pre_xcodebuild.sh` overwrites it in the built Info.plist
    // with Xcode Cloud's monotonic build number. This literal is therefore the
    // local-build value and the floor, not what ships.
    buildNumber: '1',
    config: {
      // Writes `ITSAppUsesNonExemptEncryption: false`. Without it App Store
      // Connect asks the export-compliance question on *every* upload and holds
      // processing until it is answered. Kairo's only cryptography is HTTPS,
      // which is exempt under the standard ATS/HTTPS exemption.
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      // HealthKit is iPhone-only; declaring it keeps the App Store listing honest.
      UIRequiredDeviceCapabilities: ['healthkit'],
    },
  },

  // V1.5. Listed now so the config does not need restructuring later.
  android: {
    package: 'com.arsherj.kairo',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    './plugins/withIosBuildWarningFixes',
    // Load-bearing, not an optimisation choice. Meta's prebuilt React
    // xcframework is compiled against libc++ 19 while CocoaPods builds Expo's
    // pods against the installed Xcode's libc++ 21, and the two disagree on
    // `sizeof(ShadowNodeFamily)` by 64 bytes — every Expo view created
    // overflows its own heap block. Removing this brings back a launch crash
    // whose stack lands somewhere different on every run. Full write-up in the
    // plugin.
    './plugins/withReactNativeFromSource',
    [
      '@kingstinct/react-native-healthkit',
      {
        // Framed as the spec's onboarding copy: the ask has a visible why (§5).
        //
        // Names every type in `src/features/health/read-types.ts`, not just the
        // four that score. This string is what iOS shows in the system dialog
        // and in Settings, so it is the one place a user can compare what was
        // promised against what was requested — it said four while the app
        // asked for eight, which is the QA pass's trust finding at its source.
        // `src/features/health/disclosure.ts` carries the in-app half and is
        // test-locked to the request list; this string cannot be, so it has to
        // be changed by hand whenever that list changes.
        NSHealthShareUsageDescription:
          'Kairo reads steps, active calories and sleep to score your character, with distance as an anti-cheat cross-check; active minutes appear in your daily breakdown; heart rate and resting heart rate show your strain; and workouts confirm a hard session was real. Heart rate is never scored, and your squad sees scores only — never your raw data.',
        // Declared because iOS requires the string whenever the entitlement is
        // present. Shipped builds never request write access at all — only the
        // `__DEV__` simulator seeder in src/features/health/dev-seed.ts does,
        // and it is compiled out of release. Worded to stay true in both.
        NSHealthUpdateUsageDescription:
          'Kairo does not write to Apple Health. Internal development builds write sample activity data for testing.',
        background: true,
      },
    ],
    // The other half of `background: true`. That flag only writes the
    // entitlement — the plugin above never touches the AppDelegate, and Apple
    // requires observer queries to be registered in
    // didFinishLaunchingWithOptions for the app to be woken after termination.
    // Listed after the HealthKit plugin so the pairing is obvious; the two
    // touch different mods, so the order is not load-bearing.
    './plugins/withHealthKitBackgroundObservers',
    [
      // Declared for one reason: `mode` writes `aps-environment` into the
      // entitlements, and Expo's default is `development` — the APNs *sandbox*.
      // On an EAS build that value is rewritten to `production` for a
      // distribution build, but this project archives through Xcode Cloud,
      // which ships the committed `ios/` exactly as it finds it (deviation
      // #28). Nothing else in the repo declared the intent, so the entitlement
      // was arriving implicitly at Expo's default and no one had said whether
      // that was meant.
      //
      // TestFlight is production distribution, so `production` is what it
      // should say. This does not by itself prove push works — Expo's service
      // relays to both APNs environments — which is why
      // `NotificationSettingsCard` reads the value back off the running device
      // rather than leaving it as an inference about the archive.
      'expo-notifications',
      { mode: 'production' },
    ],
    // The native date picker behind the goal form's "Custom" end date. Config
    // plugin rather than autolinking alone: it is what pins the compile SDK on
    // Android, which V1.5 will need. Adding it means `npm run prebuild` before
    // the next `npm run ios`.
    '@react-native-community/datetimepicker',
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    eas: {
      projectId: 'ccfa0966-3aa9-4548-b5a2-6e311816d8de',
    },
  },
};

export default config;

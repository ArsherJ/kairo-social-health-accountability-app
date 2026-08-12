import type { ExpoConfig } from 'expo/config';

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
    // Writes the Sign in with Apple entitlement. Like HealthKit's, the matching
    // capability must ALSO be enabled on the App ID in the Developer portal —
    // without it the entitlement is present, the button renders, and
    // `signInAsync` fails with ERR_REQUEST_UNKNOWN, which looks identical to a
    // device that is not signed into an Apple ID. Changing this needs a native
    // rebuild (`npm run prebuild && npm run ios`), not a JS reload.
    usesAppleSignIn: true,
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
          'Kairo reads steps, distance, active calories and active minutes to score your character; sleep, heart rate and resting heart rate to show your recovery and strain; and workouts to confirm a hard session was real. Heart rate is never scored, and your squad sees scores only — never your raw data.',
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

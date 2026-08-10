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
        NSHealthShareUsageDescription:
          'Kairo reads your steps, distance, active calories and active minutes to power your character and your squad leaderboard.',
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
  },
};

export default config;

import type { ExpoConfig } from 'expo/config';
// The one place the invite domain is written. Imported rather than repeated:
// the entitlement generated from `associatedDomains` below and the URL in the
// share message must name the same host, and if they drift the link opens
// Safari with nothing reporting an error.
import { INVITE_HOST } from './src/features/squad/invite-link.ts';

// The EAS project. Written once because it appears twice — `updates.url` is
// `https://u.expo.dev/<projectId>`, and `extra.eas.projectId` is the same id.
// If those two ever disagree the app fetches manifests for a project it does
// not belong to, which returns no update and reports no error: OTA simply
// stops working, silently, exactly like the entitlement traps below.
const EAS_PROJECT_ID = 'ccfa0966-3aa9-4548-b5a2-6e311816d8de';

/**
 * Kairo — Expo app config.
 *
 * The HealthKit plugin's `background: true` is load-bearing, not optional: it
 * adds the background-delivery entitlement. The project-owned
 * `withHealthKitBackgroundObservers` plugin separately injects observer
 * registration into didFinishLaunchingWithOptions the way Apple requires.
 * Background sync is free for every user (spec §12), and the real-time
 * leaderboard depends on it.
 *
 * The matching capability must ALSO be enabled on the App ID in the Apple
 * Developer portal. Without it the build installs fine and silently returns no
 * health data — a genuinely miserable thing to debug.
 *
 * This file and the project-owned config plugins are the source of truth for
 * native config. Both native directories are generated and ignored: EAS uses
 * Continuous Native Generation for remote builds, and `npm run prebuild`
 * materialises the same inputs for local Xcode work. Never rely on a hand-edit
 * under `ios/` or `android/`; it will disappear at the next generation.
 */

const config: ExpoConfig = {
  name: 'Kairo',
  slug: 'kairo',
  owner: 'kairo-health',
  version: '0.1.0',
  orientation: 'portrait',
  // App icon: the terracotta mark on the cream ground — `colors.accent` on
  // `colors.bg` from `src/theme.ts`, rather than a second palette invented for
  // the icon.
  //
  // Terracotta rather than the far higher-contrast `colors.text`, because the
  // mark has to survive **two** grounds and only one of them is designed here.
  // iOS 26 derives the Dark appearance automatically by darkening the fill and
  // keeping the symbol, so ink scored 1.00:1 against that darkened ground —
  // literally invisible, confirmed on the simulator — while reading 13.95:1 in
  // Default. Terracotta gives up some of that (3.03:1 on cream) to get 4.60:1
  // on the dark ground, which was checked by hand on a device and reads
  // correctly. That is the trade a single-layer icon has to make; the
  // alternative is a per-appearance override, which cannot currently be
  // hand-authored — see the `ios.icon` note below.
  //
  // Three properties of this file are load-bearing and easy to undo by
  // "improving" it:
  //
  // - **It carries no alpha channel** (PNG colour type 2, not 6). Apple
  //   rejects an App Store icon that has one *even when every pixel is
  //   opaque* — ITMS-90717, raised at upload rather than at build, so a
  //   flattened-but-still-RGBA file passes everything local and fails the
  //   submission. Re-exporting through most tools silently adds the channel
  //   back; check with `sips -g hasAlpha`.
  // - **The ground is baked in and the corners are square.** iOS applies its
  //   own squircle mask, so pre-rounding double-masks the artwork.
  // - **The mark fills ~76% of the canvas and is centred on the mark's own
  //   bounding box**, not on the artboard it was drawn in — those differ, and
  //   centring on the latter is what left it visibly off-axis.
  //
  // This flat PNG is the **non-iOS** icon and the pre-iOS-26 fallback. iOS
  // itself uses the Icon Composer bundle declared at `ios.icon` below; see
  // the note there, which is where the interesting constraints live.
  icon: './assets/icon.png',
  // Deep-link scheme. §14 routes eight notification types straight to a screen.
  scheme: 'kairo',
  userInterfaceStyle: 'dark',

  // OTA updates (expo-updates). This is the quota valve: a JS or asset change
  // ships to installed builds for free, and only a *native* change costs one of
  // the month's EAS builds.
  //
  // **The policy is `fingerprint`, and that choice is load-bearing.** The
  // alternative, `appVersion`, ties compatibility to the `version` string above
  // — which means an OTA update is delivered to any build sharing that string,
  // including one whose native side no longer matches. Add a native module,
  // forget to bump `version`, publish an update that calls into it, and every
  // older build takes the update and crashes on launch with no way to recover
  // except a new build through review. `fingerprint` hashes the actual native
  // inputs instead — the config plugins under `plugins/`, the resolved Expo
  // config, native dependency versions, `patches/` — so a native change moves
  // the runtime version by construction and old builds simply stop being
  // offered the update. Both policies fail when native drifts; this one fails
  // by withholding an update rather than by bricking the app.
  //
  // Two consequences worth knowing before changing this:
  //
  // - The fingerprint's default `balanced` preset deliberately skips
  //   `ExpoConfigVersions`, which is what makes this compatible with
  //   `appVersionSource: "remote"` + `autoIncrement` in eas.json. Without that
  //   skip every build would carry a fresh buildNumber, therefore a fresh
  //   fingerprint, and no update would ever match anything.
  // - The runtime version is not readable by eye. `npm run eas:fingerprint`
  //   prints it; `eas update` prints the one it published to. When an update
  //   appears not to arrive, compare those two before assuming the network.
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    // Launch from the embedded/cached bundle immediately and fetch the new one
    // in the background, applying it on the next launch. This is the default
    // (0), declared explicitly because raising it is the tempting change that
    // reintroduces a bug this app has already shipped once: a non-zero value
    // blocks the first frame on a network request, and the 2026-08-14 outage
    // was precisely a host that resolved but never connected. `fetch-timeout.ts`
    // guards Supabase; nothing guards this, so the only safe value is 0 —
    // an update that lands one launch later is never worth a launch that hangs.
    fallbackToCacheTimeout: 0,
  },
  // No newArchEnabled flag: React Native 0.83 dropped the legacy architecture,
  // so New Architecture is the only option and the option was removed.

  ios: {
    bundleIdentifier: 'com.arsherj.kairo',
    supportsTablet: false,
    // iOS 26 Liquid Glass icon — an Apple Icon Composer bundle, not a PNG.
    // `assets/Kairo.icon/` holds a *transparent* terracotta symbol plus an
    // `icon.json` declaring the cream ground as `fill`. Keeping the ground out
    // of the pixels is the whole point: the system renders light, dark and
    // tinted appearances from that one layered source, which a flat PNG cannot
    // express. Verified with `xcrun assetutil --info` — the compiled catalog
    // carries `UIAppearanceLight`, `UIAppearanceDark` and `ISAppearanceTintable`
    // stacks.
    //
    // Four things break this quietly:
    //
    // - **It must live on `ios.icon`, as a plain string.** `@expo/prebuild-config`
    //   warns (and falls back) if a `.icon` path is set on the *root* `icon`
    //   field, or passed inside the light/dark/tinted object form. The root
    //   `icon` above stays a PNG on purpose — it serves Android and web.
    // - **Nothing in the JS toolchain validates `icon.json`.** Expo copies the
    //   directory verbatim into `ios/<App>/Kairo.icon` and sets
    //   `ASSETCATALOG_COMPILER_APPICON_NAME`; the schema is Apple's and is only
    //   ever checked by `actool` at Xcode/EAS build time. A malformed file
    //   therefore passes `prebuild` and every local check, then fails in CI —
    //   the same shape as the `aps-environment` and Associated Domains traps.
    //   Validate changes locally instead of guessing (the `mkdir` is
    //   load-bearing — `actool` errors rather than creating the directory):
    //     `mkdir -p /tmp/out && xcrun actool --compile /tmp/out \
    //        --platform iphoneos --minimum-deployment-target 26.0 \
    //        --target-device iphone --app-icon Kairo \
    //        --output-partial-info-plist /tmp/out/p.plist assets/Kairo.icon`
    //   It exits non-zero on a bad schema and, on success, writes the actual
    //   rendered icon PNGs — which is also the only way to *see* the glass
    //   treatment without a device.
    // - **`fill` colours are `<colour-space>:r,g,b,a` floats**, not hex —
    //   `extended-srgb:0.96078,0.91765,0.84706,1.00000` is `colors.bg`
    //   (`#f5ead8`). A hex string here is silently wrong.
    // - **The basename is the icon name.** `Kairo.icon` becomes
    //   `ASSETCATALOG_COMPILER_APPICON_NAME = Kairo`; renaming the directory
    //   renames the build setting, so do not rename it casually.
    icon: './assets/Kairo.icon',
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
    // CNG generates the entitlement from this declaration. The Associated
    // Domains capability must also be enabled on the App ID in the Developer
    // portal — without it the entitlement is present, the link resolves to
    // Safari, and nothing reports an error.
    associatedDomains: [`applinks:${INVITE_HOST}`],
    // Local/prebuild floor. EAS uses remote app-version state and auto-increments
    // this for `ios-production`, so every TestFlight upload stays unique rather
    // than relying on this literal as the release counter.
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
    // CNG must produce a production push entitlement for TestFlight.
      //
      // TestFlight is production distribution, so `production` is what it
      // should say. This does not by itself prove push works — Expo's service
      // relays to both APNs environments — which is why
      // `NotificationSettingsCard` reports whether push-token registration
      // succeeded rather than trying to read `aps-environment` at runtime.
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
      projectId: EAS_PROJECT_ID,
    },
  },
};

export default config;

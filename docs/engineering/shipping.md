# Shipping — OTA, fingerprints, native builds, RN from source — the rules in full

Moved verbatim from `CLAUDE.md` on 2026-09-12 (ponytail audit) to keep that file inside its size limit. The rules are summarised in `CLAUDE.md`; this is the full text and the *why*.

**`ios/` and `android/` are generated and ignored as of 2026-08-23** (roadmap deviation #42). `app.config.ts` and the project-owned config plugins are the only native source of truth. EAS uses Continuous Native Generation for remote builds; `npm run prebuild` materialises the same inputs for local simulator/Xcode work, and `postprebuild` restores the machine-local `ios/.xcode.env.local`. Never commit or depend on a hand-edit under a generated native directory — it disappears on the next clean generation. EAS environment variables supply the JS-side `extra` and `EXPO_PUBLIC_*` values during the remote build.

**EAS guards both build inputs and generated native outcomes.** The `eas-build-pre-install` hook runs `scripts/guard-eas-build-platform.mjs`: it preserves Android's development-only boundary and rejects either missing public Supabase variable without printing its value. The iOS-only `eas-build-post-install` hook runs after dependency installation, CNG prebuild and CocoaPods, when `scripts/verify-ios-native-output.mjs` can assert the generated result: React Native is configured and actually built from source, the incompatible `React-Core-prebuilt` pod is absent, a generated target frameworks script embeds `ExpoModulesJSI.framework`, and the generated `Expo.plist` carries a working EAS Update configuration (enabled, `file:fingerprint`, zero launch wait, a real `u.expo.dev` endpoint). These lifecycle hooks replace the retired Xcode Cloud artifact guards. Do not move the outcome checks into pre-install, where `ios/` and `Pods/` do not exist yet.

**JS ships over the air as of 2026-08-25** (roadmap deviation #43). EAS Update
is installed, so a change under `app/`, `src/` or `packages/kairo-core` reaches
installed builds with `npm run eas:update:production` and costs nothing; only a
**native** change spends one of the month's 15 EAS builds. Native means the app
icon, any native field in `app.config.ts`, entitlements, the plugins under
`plugins/`, a new or upgraded native module, an SDK bump — batch those into one
build rather than spending one each. Every failure mode here is silent: the
update publishes successfully and simply never arrives. Four things are pinned
by tests in `src/config/eas-config.test.ts`, and the generated-native half is
asserted on the EAS worker by `scripts/verify-ios-native-output.mjs` against
`ios/Kairo/Supporting/Expo.plist`.

- **`runtimeVersion` is `{ policy: 'fingerprint' }`, and `appVersion` is the
  trap, not the simpler alternative.** `appVersion` ties compatibility to the
  `version` string, so an update reaches every build sharing it — including one
  built before a native module existed, which takes the update and crashes on
  launch with no recovery except a build through review. `fingerprint` hashes
  the real native inputs, so a native change moves the runtime version by
  construction. Both fail when native drifts; this one fails by *withholding* an
  update rather than by bricking the app. It is compatible with
  `appVersionSource: "remote"` + `autoIncrement` only because fingerprint's
  default `balanced` preset skips `ExpoConfigVersions` — otherwise every build's
  fresh buildNumber would mean a fresh fingerprint and nothing would ever match.
- **The local and EAS fingerprints agree only because `/ios/` and `/android/`
  are Git-ignored.** `@expo/fingerprint` resolves the project workflow by asking
  whether the native project marker is Git-ignored: ignored is `managed`,
  tracked is `generic`, and the two hash differently. EAS builds via CNG with no
  `ios/` at all; a local `eas update` runs against a tree where `npm run
  prebuild` has materialised one, and still resolves `managed` purely because of
  deviation #42's ignore entries — verified, `workflow: managed` with `ios/`
  present. Commit the native directories and every update published from this
  machine silently targets a runtime version no build has.
- **Every `eas.json` build profile must declare a `channel`.** A build without
  one is subscribed to nothing: it installs, runs, and ignores every update ever
  published to it, indistinguishable from OTA being broken.
- **`updates.fallbackToCacheTimeout` stays 0.** Non-zero blocks the first frame
  on a network request, which is how this app shipped a permanent hold overlay
  once already (the 2026-08-14 black-holed host). `fetch-timeout.ts` guards
  Supabase; nothing guards this. The cost is that an update applies on the
  *next* launch — "open it twice" is normal, not a bug.

Diagnosis order when an update does not arrive is **never the network first**:
`npm run eas:fingerprint` prints this tree's runtime version, `eas update`
printed the one it published to, and a mismatch means the tree has native
changes the installed build does not — the policy working correctly, and the fix
is a build.

**`eas build --local` needs fastlane, and Homebrew's fastlane is broken out of
the box on this machine.** Ruby 4.0 removed several default gems the formula's
bundled gem set still assumes, so `fastlane` aborts with
`Gem::MissingSpecError: Could not find 'bigdecimal'` — then `digest-crc`, `nkf`
and `rbs` in turn. The fix is to install each into the user gem path already on
fastlane's `GEM_PATH`:
`GEM_HOME=~/.local/share/fastlane/4.0.0 gem install <name>`. Done as of
2026-08-25; if a `brew upgrade` reintroduces it, that is the loop, not a broken
install.

**React Native core is built from source as of 2026-08-13** (roadmap deviation #29),
via `plugins/withReactNativeFromSource.js` → `ios.buildReactNativeFromSource`. This is
not a preference: Meta's prebuilt `React.xcframework` is compiled against libc++ 19,
CocoaPods compiles `ExpoModulesCore` against the installed Xcode's libc++ 21, and the
two disagree about `sizeof(ShadowNodeFamily)` by 64 bytes — so every Expo view
overflows its own heap block and the app dies before the first frame. Headers are
byte-identical; nothing warns. **Do not re-enable prebuilts to speed up CI** —
the config plugin is the durable CNG input, build 21 verified it on the generated
native project, and the post-install outcome guard fails every later EAS iOS
build if the prebuilt pod returns.
The debugging lesson is the durable part: the crash surfaced as
`-[RCTComponentViewFactory createComponentViewWithComponentHandle:]`, which reads as
an unregistered Fabric component and is not one. A crash signature that **varies
between runs of the same binary** is heap corruption, not a bug where it crashed;
reproduce it with a Release *simulator* build (100%, no TestFlight round trip) and
pin it with Guard Malloc, leaving `MALLOC_PROTECT_BEFORE` unset. The retired
build-path account remains in `docs/archive/xcode-cloud.md` for history.

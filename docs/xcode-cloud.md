# Xcode Cloud — building Kairo without a USB cable

**Status as of 2026-08-13.** The pipeline works end to end: a push to
`chore/xcode-cloud` archives on Apple's machines and lands in TestFlight. The
first build to make it through **crashed on launch** — `Library not loaded:
@rpath/ExpoModulesJSI.framework/ExpoModulesJSI` — because a patch-package patch
carrying stale Xcode build output made `pod install` skip embedding one
framework. Fixed at the cause, with a guard that fails the build rather than
shipping it again; see the landmines. Step 8 resumes on the next build.

| Step | State |
|---|---|
| 1. Record the deviation | ✅ roadmap deviation #28, `README.md`, `CLAUDE.md` |
| 2. Commit `ios/` | ✅ 20 files; `Pods/`, `build/`, `xcuserdata/`, `.xcode.env.local` still ignored |
| 3. `ci_post_clone.sh` | ✅ **at `ios/ci_scripts/`, not the repo root** — see the correction below |
| 4. Build-number + encryption config | ✅ `ios.buildNumber`, `ios.config.usesNonExemptEncryption`, `ci_pre_xcodebuild.sh` |
| 5. App Store Connect app record | ✅ created |
| 6. Create the workflow | ✅ Archive + TestFlight Internal Testing post-action, `chore/xcode-cloud`, both env vars secret |
| 7. First build → TestFlight | ✅ green once one iOS device was registered in the portal (builds 1–2 failed the dev/ad-hoc exports — see landmines) |
| 8. Verify on device | 🟡 build 3 installed and **crashed on launch** (missing `ExpoModulesJSI.framework`); cause fixed and reproduced both ways locally — awaiting a green build to verify on |

Steps 1–4 and 7's push were executed on branch `chore/xcode-cloud`. The order
was changed: step 4's config edits landed *before* the prebuild in step 2, so
`ios/` was regenerated once rather than twice.

## Why this exists

This dev machine **cannot pair an iPhone over USB.** It is corporate-managed and
CrowdStrike Falcon's Device Control policy denies `usbmuxd` the phone's USB
interface at the kernel level (`IOUC AppleUSBHostInterfaceUserClient failed MACF
in process pid …, usbmuxd`). No pairing record can be written, so the phone
re-prompts "Trust This Computer?" on every plug-in, `devicectl` never sees it,
and Developer Mode never appears in iOS Settings. Full triage in `README.md`
under "Building onto a physical device"; the constraint is recorded in
`CLAUDE.md`.

So `npx expo run:ios --device` is unavailable, and the only remaining blocker for
release — step 5 of `docs/sign-in-with-apple.md`, "verify on a real device" —
needs a build that installs **over the air**. Xcode Cloud builds on Apple's
machines and ships to TestFlight, which installs from the App Store. The cable
is never involved.

EAS Build solves the same problem and needs no native commit; it was the
recommendation and was declined in favour of Xcode Cloud, whose 25 compute
hours/month are already included in the Developer Program membership. Both are
valid. This document is the Xcode Cloud path.

## The trade being made

**`ios/` becomes a committed directory.** Xcode Cloud configures a workflow
against a scheme in an Xcode project that exists in the repo; it cannot select a
scheme from a directory that only materialises after clone. `ci_post_clone.sh`
runs early enough to *build* a generated project but not early enough to
*configure* one.

That reverses a deliberate decision — `ios/` is line 4 of `.gitignore` precisely
because it is generated. Three consequences follow, and the third is the one that
bites:

1. **Expo SDK upgrades stop being free.** Today a bump is `npm run prebuild` and
   the directory is rebuilt. After this it is `npm run prebuild` *and* reviewing
   a large native diff before committing it.
2. **`.xcode.env.local` still cannot be committed** — it holds a machine-specific
   absolute path to node. It stays ignored and CI regenerates it (step 3).
3. **`app.config.ts` stops being the source of truth for native config.** The
   committed `Info.plist` and entitlements are what ship. Changing
   `usesAppleSignIn`, `NSHealthShareUsageDescription`, the HealthKit plugin's
   `background: true`, or anything else native now requires `npm run prebuild`
   **and a commit of the result**, or the change silently does not reach the
   build. This is the single most likely way to lose a day to this setup.

   The JS side is unaffected: `EXPO_PUBLIC_*` variables and `extra` are evaluated
   during the bundle phase of the Xcode build, so workflow environment variables
   do reach the app.

Record this in `docs/roadmap.md`'s approved-deviations table before doing it.

## 1. Record the deviation

Add a row to the approved-deviations table in `docs/roadmap.md`: `ios/` is
committed, why (USB pairing blocked by endpoint security, Xcode Cloud needs a
committed scheme), and the upgrade cost above. Update `README.md`, which
currently states that `ios/` is generated and gitignored — that sentence becomes
wrong the moment step 2 lands.

## 2. Commit `ios/`

Regenerate from scratch first, so what gets committed is exactly what
`app.config.ts` produces:

```bash
npm run prebuild          # expo prebuild --clean, then write-xcode-env
```

Then un-ignore the project while keeping build output out. In `.gitignore`,
replace the bare `ios/` line with:

```gitignore
# ios/ is committed so Xcode Cloud can resolve a scheme (deviation: see roadmap).
# Its build output is not.
ios/Pods/
ios/build/
ios/DerivedData/
ios/.xcode.env.local
ios/**/xcuserdata/
```

`ios/Pods` is 1.2 GB and must stay out; CI reinstalls it from the committed
`Podfile.lock`. The rest of `ios/` is small — the repo is 47 MiB today and should
stay well under 100 MiB.

Confirm before committing that the shared scheme is present, since Xcode Cloud
cannot see an unshared one:

```bash
ls ios/Kairo.xcodeproj/xcshareddata/xcschemes/Kairo.xcscheme
git add ios && git status --short ios | head -20
```

## 3. `ci_scripts/` — and where it actually goes

**Correction to this plan as written.** It said the repo root. Apple's docs are
explicit that it is not:

> Custom build scripts reside in a directory named `ci_scripts` that's located
> **in the same directory as your Xcode project or workspace**, and Xcode Cloud
> runs your custom build scripts with this directory as the root directory.

For this repo the workspace is `ios/Kairo.xcworkspace`, so the scripts belong at
`ios/ci_scripts/`. The failure mode of getting this wrong is that the scripts
are silently skipped and the build dies in `pod install` with no node — 25
minutes to learn something the docs already said.

That collides with `expo prebuild --clean`, which deletes `ios/` wholesale. So
the arrangement is the one `write-xcode-env.mjs` already established:

- **`scripts/ci/*.sh` is the source of truth.** Edit these.
- **`ios/ci_scripts/*.sh` is a generated copy**, committed like the rest of
  `ios/`, reinstalled by `scripts/install-ci-scripts.mjs`.
- `postprebuild` runs the installer, so a prebuild cannot quietly remove them.
  `npm run ci-scripts` does it by hand.

The installer also sets mode `755`. That is load-bearing twice over: Xcode Cloud
honours a script's shebang **only** if the file is executable, and otherwise
runs it as `zsh <file>`.

`ci_post_clone.sh` installs node (the images ship Homebrew, Xcode and CocoaPods
but no node — and Expo's Podfile shells out to node, so `pod install` needs it
first), runs `npm ci`, regenerates `.xcode.env.local`, and runs `pod install`.
The `write-xcode-env` reuse is the important line: that script already exists for
the identical local failure, and it is why the Hermes phase does not fail in CI.

`ci_pre_xcodebuild.sh` does two things — the build number below, and a hard
assertion that `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are present. That assertion is step 8's
"the one assumption in this plan worth verifying early", moved to where it costs
30 seconds instead of a build and a TestFlight round trip: without those
variables the archive succeeds, uploads, installs, and throws "Supabase config
missing" on launch.

## 4. Build number and export compliance

Two things TestFlight needs that `app.config.ts` does not currently set:

- **`ios.buildNumber`** — every TestFlight upload needs a unique `CFBundleVersion`.
  Because `ios/` is committed, prebuild does not run in CI, so this cannot be
  derived from Xcode Cloud's `CI_BUILD_NUMBER` through the config. Either bump it
  by hand and commit alongside each release, or add a step to
  `ci_scripts/ci_pre_xcodebuild.sh` that writes `CI_BUILD_NUMBER` into
  `ios/Kairo/Info.plist` with `PlistBuddy`. Prefer the script; a manual bump will
  be forgotten.
- **`ITSAppUsesNonExemptEncryption: false`.** Without it App Store Connect asks
  an export-compliance question on *every* build and holds processing until
  answered. Kairo uses only HTTPS, which is exempt. Set through Expo's own
  `ios.config.usesNonExemptEncryption` rather than a raw `ios.infoPlist` key —
  `@expo/config-plugins`' `UsesNonExemptEncryption` mod is what writes the plist
  entry, and going through it keeps the two from disagreeing.

Both changes go in `app.config.ts`, then `npm run prebuild`, then commit the
regenerated `ios/` — per consequence 3 above.

**Done, with the script chosen over the manual bump.** `ci_pre_xcodebuild.sh`
patches `CFBundleVersion` with `PlistBuddy`; the committed literal is `1` and
stays the local-build value. Verified in the regenerated project:
`ITSAppUsesNonExemptEncryption` is `false`, `CFBundleVersion` is `1`, and
`ios/Kairo/Kairo.entitlements` carries `com.apple.developer.applesignin`,
`com.apple.developer.healthkit` and `…healthkit.background-delivery`.

## 5. App Store Connect app record

TestFlight distributes against an app record, which does not exist yet. In App
Store Connect → Apps → **+** → New App:

- Platform iOS, bundle ID **`com.arsherj.kairo`** (already registered — the App ID
  and its Sign in with Apple + HealthKit capabilities were set up in
  `docs/sign-in-with-apple.md`)
- Name, primary language, and an SKU of your choosing

No screenshots, pricing or review submission are needed for internal TestFlight.

**This step gates step 6's post-action, so it cannot be deferred past it.** Apple:
"you need an app record in App Store Connect for your app. If you already have an
app record, Xcode Cloud uses it automatically. If you don't have an app record,
Xcode helps you create one after you grant Xcode Cloud access to your Git
repository." Until one exists the TestFlight post-action is greyed out —
*unavailable until setup completes* — while the notification post-actions, which
target nothing, stay enabled.

Creating it through Xcode's onboarding prompt instead of App Store Connect is
equivalent and asks for the same fields. Either way the **name collides**: "Kairo"
is taken on the App Store. The name is editable until first release and internal
TestFlight publishes nothing, so take a working name now rather than solving
branding mid-flow.

## 6. Create the workflow

Xcode → **Product → Xcode Cloud → Create Workflow**, with `ios/Kairo.xcworkspace`
open. Apple will ask to install its GitHub App on
`ArsherJ/kairo-social-health-accountability-app`; grant it.

- **Start condition:** branch changes on **`main`** since 2026-08-14, when
  `chore/xcode-cloud` merged. It ran on `chore/xcode-cloud` while the path was
  being proven. (This plan originally named `fix/health-sync-visibility`; that
  branch was merged in `46b747b` before any of this ran, so the work landed on a
  new one.)

  **Repoint the existing workflow's start condition — do not create a second
  workflow for `main`.** Xcode Cloud numbers builds **per workflow**, so a new
  one restarts at 1, and `ci_pre_xcodebuild.sh` writes `CI_BUILD_NUMBER` straight
  into `CFBundleVersion` — App Store Connect then rejects the upload as a
  duplicate build number for the same marketing version. Editing the existing
  workflow also keeps the environment variables and the TestFlight post-action,
  both of which are easy to forget on a fresh one.
- **Environment:** latest Xcode 26.x. Do not pin older — the project is RN 0.86 /
  Expo SDK 57.
- **Action:** **Archive**. Its *Deployment Preparation* setting offers exactly
  three values — **None**, **TestFlight (Internal Testing Only)**, and
  **TestFlight and App Store**. Either TestFlight value works; **TestFlight and
  App Store** is a superset and is the one to pick if the internal-only option is
  not offered. Internal testers skip Beta App Review under both, because that is
  a property of *internal* testing rather than of this setting. The only cost of
  the App Store-eligible archive is stricter upload validation — already
  satisfied here by `ITSAppUsesNonExemptEncryption`, the committed
  `PrivacyInfo.xcprivacy`, and the 1024 icon.
- **Post-action: TestFlight Internal Testing.** *(This plan originally missed
  this step and described distribution as part of the Archive action; it is not.
  Archiving and distributing are separate, and a workflow with only the Archive
  action produces an artifact that never reaches TestFlight.)* Click **+** next
  to **Post-Actions**, choose **TestFlight Internal Testing**, and select a
  tester group. If the picker is empty, create the group first in App Store
  Connect → Kairo → TestFlight → Internal Testing → **+**.

  **It is greyed out during the first-run wizard** — "unavailable until setup
  completes" — because no app record exists yet (step 5). Do not fight it there.
  Finish onboarding with whatever workflow Xcode suggests, create the app record
  when prompted, then reopen **Report navigator → Cloud → the workflow → Edit
  Workflow**; the post-action is selectable from that screen. Nothing chosen in
  the wizard is load-bearing, because everything in it is editable afterwards.
  Two of its defaults do need correcting in that same pass: it starts builds on
  the **default branch** (`main`, not `chore/xcode-cloud`) and it carries none of
  the environment variables below.
- **Environment variables** (mark secret):
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — values from
  `.env`. **Do not add `OPENAI_API_KEY`**; it is used only by the local
  swap-asset scripts and has no business in a build that ships.

  Both names are asserted by `ci_pre_xcodebuild.sh`, so a missing one fails the
  build in seconds with the variable named in the log rather than shipping an
  archive that throws on launch. The mechanism is confirmed working locally: the
  `[CP-User] Generate app.config for prebuilt Constants.manifest` phase reads
  `process.env` at build time and bakes the values into
  `EXConstants.bundle/app.config`, which is what `Constants.expoConfig.extra`
  reads. In CI that `process.env` is the workflow's Environment section.

Signing needs no local certificate: Xcode Cloud manages its own certificates and
profiles through App Store Connect. The `security find-identity` prerequisite in
`README.md` applies to local device builds only.

## 7. First build

The branch is pushed:

```bash
git push -u origin chore/xcode-cloud
```

Nothing builds until step 6 creates the workflow — Xcode Cloud has no standing
to watch a repository it has not been pointed at.

Expect 20–30 minutes for a first React Native archive (cold Pods cache). At
~25 min a build, the included 25 hours/month is roughly 50 builds — ample.

Then on the phone: install TestFlight, sign in with the same Apple ID, accept the
internal-tester invite, install Kairo.

**Between the green build and the install there is a processing wait.** App Store
Connect → Kairo → TestFlight shows the build as *Processing* for a few minutes
before it becomes installable; it does not appear in the phone's TestFlight app
until that clears. Two things to confirm on that screen while waiting: the build
number matches `CI_BUILD_NUMBER` (proof `ci_pre_xcodebuild.sh`'s PlistBuddy patch
ran) and no export-compliance question is being asked (proof
`ITSAppUsesNonExemptEncryption` shipped). If the internal group has no testers,
add yourself there — the post-action distributes to the group, not to the account.

## 8. Verify

Work the eight-item checklist at the bottom of `docs/sign-in-with-apple.md` —
first sign-in granting name/email, relaunch restoring the session, token refresh,
sign out/in landing on the same `auth.users` row, cancel showing no error,
revoke-and-resign, delete-account-then-signin yielding a *new* character, and the
anonymous provider plus "Development build" label both absent in Release.

Two things to fold in while the build is on the device:

- **Confirm Supabase config actually arrived.** If the workflow's environment
  variables did not reach the bundle phase, `src/lib/supabase.ts` throws its
  "Supabase config missing" error on launch. That is the one assumption in this
  plan worth verifying early rather than trusting.
- **The `Aaaae` backfill.** `Aaaae`, `She` and `QaAeon0811` have unscored health
  buckets for 10–11 Aug. One app launch per account fixes it through the normal
  sync path; this build is that launch.

## Known landmines

- **A native change that is not prebuilt-and-committed does not ship.** See
  consequence 3. If a capability appears absent on device, check the committed
  `ios/Kairo/Kairo.entitlements` before suspecting the portal.
- **`ios/Pods` must stay ignored.** 1.2 GB. If it lands in a commit, rewrite
  history rather than pushing it.
- **An Archive action alone never reaches TestFlight.** Distribution is a
  post-action. A workflow that runs green and produces an artifact nobody can
  install is this, every time.
- **The archive action fails until one iOS device is registered in the account,
  and it fails in a way that looks like it should be ignorable.** It exports
  three ways — app-store, development, ad-hoc — and the last two die with
  `No profiles for 'com.arsherj.kairo' were found`. Apple's API gives the reason
  in `IDEDistributionProvisioning.log`: *"Your team has no devices from which to
  generate a provisioning profile. Connect a device to use or manually add
  device IDs in Certificates, Identifiers & Profiles."* A development or ad-hoc
  profile must contain at least one device; this team has none, because
  registering one normally requires the USB pairing this document exists to
  route around.

  **Two of the three exports failing fails the whole action, and a failed action
  skips every post-action** — so nothing uploads and App Store Connect lists no
  build, even though `** ARCHIVE SUCCEEDED **` and the app-store export reported
  `** EXPORT SUCCEEDED **` and wrote a real IPA. Builds 1 and 2 both failed
  exactly this way and were misread as cosmetic first time round.

  **Fixed by registering one device** under Certificates, Identifiers & Profiles
  → Devices; the next build went green and reached TestFlight. The device does not
  have to be the test phone — the profile only needs a non-empty device list, and
  `ios/Kairo/Kairo.entitlements` is not involved. Deployment Preparation is not
  the lever: Apple documents it as determining *how Xcode Cloud signs your app*,
  not which export variants run.

  Note the shape of this, because it will recur: an account-level prerequisite
  that USB pairing normally satisfies as a side effect. Xcode Cloud removes the
  cable from the *build*, not from every assumption Apple's tooling makes about
  one having been plugged in.
- **A green archive can still ship an app that cannot launch.** The first build
  to reach TestFlight died instantly with `Library not loaded:
  @rpath/ExpoModulesJSI.framework/ExpoModulesJSI`. Nothing was red anywhere: the
  archive succeeded, all three exports succeeded, the upload succeeded.

  `expo-modules-jsi` ships no binary in its npm package — the xcframework is
  produced by a build-time script phase. But whether CocoaPods *embeds* that
  framework is decided much earlier, at `pod install` time, by inspecting a stub
  xcframework that `expo-modules-autolinking` creates from a pre-install hook
  whose exit status it discards. On Apple's image that inspection came out
  "static", so `Pods-Kairo-frameworks.sh` was generated with 8 frameworks minus
  one. Build 2's archive log runs `[CP] Embed Pods Frameworks` with exactly 7
  `install_framework` calls, ExpoModulesJSI absent between ExpoModulesCore and
  ExpoModulesWorklets. The binary still links against it, so dyld fails at
  launch.

  **The cause was `patches/expo-modules-jsi+57.0.4.patch`, and it is worth
  understanding because the same trap is one careless `npx patch-package` away
  in any package.** That patch was 11 MB: 15 genuine Swift 6 source fixes
  (`weak let` → `nonisolated(unsafe) weak var`, `abs` → `Swift.abs`) plus 576
  diffs of `apple/.DerivedData/` and 30 of `apple/Products/` — local Xcode
  build output that happened to be sitting in `node_modules` when the patch was
  generated. **A diff cannot encode a Mach-O binary.** Those stanzas are only
  `Binary files /dev/null and b/… differ`, carrying no content, so on every
  `npm ci` patch-package recreated
  `Products/ExpoModulesJSI.xcframework/ios-arm64/…/ExpoModulesJSI` as a
  **zero-byte file**. `create-stub-xcframework.sh` is deliberately
  non-destructive — it keeps any existing slice binary — so the empty file
  survived, and CocoaPods read 0 bytes as "not dynamic".

  It never reproduced on this Mac because `node_modules` here already held a
  real binary from an earlier local build, which the same non-destructive rule
  preserved. Restoring the old patch and reinstalling the package from its npm
  tarball reproduces it exactly: `file` reports `empty` and the embed list comes
  out at 7. With the patch filtered to its 15 source hunks (11 MB → 14 KB), the
  stub script builds a real dylib and the list comes out at 8.

  **When regenerating a patch for a package with an Xcode build in it, exclude
  the build output** — `npx patch-package <pkg> --exclude '(\.DerivedData|Products)/'`
  — or the next patch reintroduces this.

  The guard stays regardless: `ci_post_clone.sh` creates the stub explicitly
  (via `bash`, so a missing exec bit cannot no-op it) and then **asserts
  ExpoModulesJSI is in the embed script**, failing the build if not. It is what
  caught this, and it is the same shape as the Supabase env-var assertions and
  `smoke-sync.mjs`: what tests cannot see is the deployed artifact, so the check
  belongs in the pipeline.
- **A first React Native archive reports ~92 warnings.** `umbrella header for
  module 'jsi' does not include header …`, `the variable "setTimeout" was not
  declared …`, `Direct call to eval()`. All are RN/Hermes noise. Build 1 showed
  "94 issues" and it was these 92 plus the 2 export errors above — nothing in
  Kairo's own code.
- **Steps 5 and 6 are ordered, not independent.** The TestFlight post-action is
  disabled until an App Store Connect app record exists, and reads as a
  half-finished Xcode Cloud setup rather than as a missing record — the
  notification post-actions beside it stay enabled, so the section does not look
  blocked. If step 5 stalls (the name is taken), finish the workflow without the
  post-action and add it later; the workflow is editable.
- **External testing requires a clean build; internal does not.** Apple's own
  warning is that Environment → Clean "significantly increases the time it takes
  to perform a build". Leave it off while testing internally, and expect the
  jump when external testers are added.
- **An unshared scheme is invisible to Xcode Cloud.** If the workflow cannot find
  `Kairo`, check `xcshareddata/xcschemes/` survived the prebuild.
- **`ci_scripts` at the repo root is silently ignored** — it goes beside the
  workspace, at `ios/ci_scripts/`. And it is generated: edit `scripts/ci/`, then
  `npm run ci-scripts`. Editing the copy under `ios/` works until the next
  prebuild reverts it without saying so.
- **A script without the executable bit is run as `zsh <file>`,** shebang
  ignored. `install-ci-scripts.mjs` sets `755`; `git ls-files -s
  ios/ci_scripts/` should show `100755`, and git will not preserve the bit if it
  was `100644` when first added.
- **`aps-environment` is `development` in the committed entitlements.** That is
  what prebuild writes and it is correct to leave alone — Xcode rewrites this
  one entitlement to `production` when signing with a distribution profile.
  Push notifications (§14) arriving in TestFlight is the confirmation; if they
  do not, this is the first thing to check and the *only* entitlement where the
  committed value is not the shipped one.
- **Sign in with Apple has a client secret that expires 2027-02-08.** Unrelated to
  this setup, but it takes sign-in down for every user at once and will look like
  a build problem. `npm run apple-secret` re-mints it.
- **The *second* green archive also shipped an app that could not launch, for a
  completely different reason: Meta's prebuilt `React.xcframework`.** The first
  build to get past the ExpoModulesJSI failure above reached TestFlight, and died
  on the first frame in
  `-[RCTComponentViewFactory createComponentViewWithComponentHandle:]`, which
  reads like a component that failed to register. It is not. Nothing is missing.

  React Native 0.86 links React core, ReactNativeDependencies and hermesvm as
  **prebuilt binary xcframeworks** (the `React-Core-prebuilt` pod) to cut build
  times. Meta compiles those against a pinned toolchain — the shipped binaries
  carry libc++'s `abi:ne190102` tag (libc++ 19, Xcode 16). Every pod CocoaPods
  builds locally, `ExpoModulesCore` among them, compiles against whatever Xcode
  is installed — 26.6 here, `abi:nqe210106`, libc++ 21. libc++ changed the layout
  of a type `facebook::react::ShadowNodeFamily` holds by value between those
  versions, so the two halves of the app disagree about its size: **400 bytes as
  `React.framework` sees it, 336 as `ExpoModulesCore` sees it.** The headers on
  disk are byte-identical, so nothing warns and nothing fails to build.

  `ExpoViewComponentDescriptor::createFamily` inlines
  `make_shared<ShadowNodeFamily>`, so ExpoModulesCore allocates its own short
  360-byte block and then calls React's out-of-line constructor, which writes
  out to offset 400 — **64 bytes past the end of the block, for every Expo view
  created.**

  **The reason this is worth a landmine entry is the debugging shape, not the
  bug.** The overflow scribbles the malloc metadata of whatever block happens to
  sit next, so the process dies at some *later, unrelated* allocation. Five
  consecutive launches of one binary produced three different crash signatures:
  the `RCTComponentViewFactory` one Apple reported, a malloc freelist abort on
  the JS thread inside `RCTTextLayoutManager`'s cache, and another on the main
  thread inside `ProcessInfo.environment` reached from SwiftUI under
  `-[UINavigationController loadView]`. Every one of them leads into React
  Native's or Apple's code, which is innocent.

  **A signature that changes between runs of the same binary is heap corruption,
  not a bug where it crashed.** Two things settle it quickly, and both are worth
  reaching for before reading any more stack traces: build Release for the
  *simulator* (`npx expo run:ios --configuration Release`) — this reproduced
  100% of the time locally, so no TestFlight round trip is needed — and then run
  it under Guard Malloc, `SIMCTL_CHILD_DYLD_INSERT_LIBRARIES=/usr/lib/libgmalloc.dylib`,
  which traps on the offending write itself. Leave `MALLOC_PROTECT_BEFORE`
  **unset**: it moves the guard page in front of each allocation, which hides
  overflows and reports the app as perfectly healthy.

  **Fixed by building React Native from source** —
  `plugins/withReactNativeFromSource.js` sets `ios.buildReactNativeFromSource`,
  which makes `ios/Podfile` export `RCT_USE_PREBUILT_RNCORE=0` and
  `RCT_USE_RN_DEP=0`. One compiler, one layout, mismatch impossible. The cost is
  the whole reason prebuilts exist: CI now compiles React Native itself, so
  expect a substantially longer build. `ci_post_clone.sh` fails the build if the
  `React-Core-prebuilt` pod comes back.

  Note the shape, because it generalises past this one pod: **any prebuilt C++
  binary in the dependency graph is a silent ABI contract with the toolchain
  that built it.** Bumping Xcode can break it without a single warning.

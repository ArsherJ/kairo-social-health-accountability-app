# Xcode Cloud — building Kairo without a USB cable

**Status as of 2026-08-12.** Nothing below is done yet; this is the plan.

| Step | State |
|---|---|
| 1. Record the deviation | ⬜ |
| 2. Commit `ios/` | ⬜ |
| 3. `ci_scripts/ci_post_clone.sh` | ⬜ |
| 4. Build-number + encryption config | ⬜ |
| 5. App Store Connect app record | ⬜ |
| 6. Create the workflow | ⬜ |
| 7. First build → TestFlight | ⬜ |
| 8. Verify on device | ⬜ |

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

## 3. `ci_scripts/ci_post_clone.sh`

Xcode Cloud runs `ci_scripts/ci_post_clone.sh` from the repo root after cloning
and before resolving dependencies. It must be executable (`chmod +x`) or it is
silently skipped.

```bash
#!/bin/sh
set -e

# Xcode Cloud images ship Homebrew but not node.
brew install node@22
brew link --overwrite --force node@22

cd "$CI_PRIMARY_REPOSITORY_PATH"

npm ci

# ios/.xcode.env resolves NODE_BINARY with `command -v node`, and Xcode runs
# script phases under a restricted PATH. Same failure as locally
# (`line 9: : command not found`), same fix — see scripts/write-xcode-env.mjs.
node scripts/write-xcode-env.mjs

# ios/Pods is not committed. Podfile.lock is, so this is deterministic.
cd ios && pod install
```

The `write-xcode-env` reuse is the important line: that script already exists for
the identical local failure, and it is why the Hermes phase will not fail in CI.

## 4. Build number and export compliance

Two things TestFlight needs that `app.config.ts` does not currently set:

- **`ios.buildNumber`** — every TestFlight upload needs a unique `CFBundleVersion`.
  Because `ios/` is committed, prebuild does not run in CI, so this cannot be
  derived from Xcode Cloud's `CI_BUILD_NUMBER` through the config. Either bump it
  by hand and commit alongside each release, or add a step to
  `ci_scripts/ci_pre_xcodebuild.sh` that writes `CI_BUILD_NUMBER` into
  `ios/Kairo/Info.plist` with `PlistBuddy`. Prefer the script; a manual bump will
  be forgotten.
- **`ITSAppUsesNonExemptEncryption: false`** in `ios.infoPlist`. Without it App
  Store Connect asks an export-compliance question on *every* build and holds
  processing until answered. Kairo uses only HTTPS, which is exempt.

Both changes go in `app.config.ts`, then `npm run prebuild`, then commit the
regenerated `ios/` — per consequence 3 above.

## 5. App Store Connect app record

TestFlight distributes against an app record, which does not exist yet. In App
Store Connect → Apps → **+** → New App:

- Platform iOS, bundle ID **`com.arsherj.kairo`** (already registered — the App ID
  and its Sign in with Apple + HealthKit capabilities were set up in
  `docs/sign-in-with-apple.md`)
- Name, primary language, and an SKU of your choosing

No screenshots, pricing or review submission are needed for internal TestFlight.

## 6. Create the workflow

Xcode → **Product → Xcode Cloud → Create Workflow**, with `ios/Kairo.xcworkspace`
open. Apple will ask to install its GitHub App on
`ArsherJ/kairo-social-health-accountability-app`; grant it.

- **Start condition:** branch changes on `fix/health-sync-visibility` while
  testing, or manual. Move to `main` once merged.
- **Environment:** latest Xcode 26.x. Do not pin older — the project is RN 0.86 /
  Expo SDK 57.
- **Action:** **Archive**, distribution **TestFlight (Internal Testing Only)**.
  Internal testers skip Beta App Review, so builds land in minutes rather than a
  day.
- **Environment variables** (mark secret):
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — values from
  `.env`. **Do not add `OPENAI_API_KEY`**; it is used only by the local
  swap-asset scripts and has no business in a build that ships.

Signing needs no local certificate: Xcode Cloud manages its own certificates and
profiles through App Store Connect. The `security find-identity` prerequisite in
`README.md` applies to local device builds only.

## 7. First build

The branch has never been pushed:

```bash
git push -u origin fix/health-sync-visibility
```

Expect 20–30 minutes for a first React Native archive (cold Pods cache). At
~25 min a build, the included 25 hours/month is roughly 50 builds — ample.

Then on the phone: install TestFlight, sign in with the same Apple ID, accept the
internal-tester invite, install Kairo.

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
- **An unshared scheme is invisible to Xcode Cloud.** If the workflow cannot find
  `Kairo`, check `xcshareddata/xcschemes/` survived the prebuild.
- **Sign in with Apple has a client secret that expires 2027-02-08.** Unrelated to
  this setup, but it takes sign-in down for every user at once and will look like
  a build problem. `npm run apple-secret` re-mints it.

# Kairo — Command Reference

A single place for the commands you run day to day: testing, shipping JS over the
air, cutting a native TestFlight build, deploying the backend, and checking
status. Distilled from `CLAUDE.md` — that file remains the authority on *why*
each rule exists; this one is the quick lookup.

Project ref (Supabase): `zniopywbwenrzxezolwv`
App Store Connect app ID: `6800990955`

---

## 1. Before you push anything — verify locally

```bash
npm test                 # everything: kairo-core (node) + schema/planner suites
npm run test:core        # packages/kairo-core only
npm run test:schema      # schema (PGlite) + Edge Function planners
npm run typecheck        # tsc + workspace tsc + deno check, all three

# single file / single test
npm run test:core -- --run src/streak.test.ts
npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts
npx vitest run --config vitest.config.ts -t "Streak Shield"

npm run doctor           # expo-doctor sanity check
```

Strict TDD applies to scoring, day boundaries, Events, streaks, anti-cheat. UI
is verified by hand on device / simulator.

---

## 2. Run the app locally (simulator)

```bash
npm run ios              # build + run on iOS simulator (needs Xcode + CocoaPods)
npm run start            # Metro dev server (dev-client)
npm run prebuild         # regenerate ignored native projects from app.config.ts / plugins
                         #   NEVER commit ios/ or android/ — they are generated + gitignored
```

Physical-device builds do **not** work from this machine over USB (corporate MDM
blocks `usbmuxd`). Physical device = EAS Build → TestFlight only (section 4).

Dynamic Type / accessibility testing without a GUI:

```bash
xcrun simctl ui booted content_size accessibility-extra-extra-extra-large
xcrun simctl io booted screenshot ~/Desktop/kairo-xxxl.png
# relaunch the app after changing content size — RN caches text measurements
```

---

## 3. Ship JS/asset changes over the air (OTA) — free, unlimited

Use this when the change is only under `app/`, `src/`, or
`packages/kairo-core` and **no native input moved**.

### 3a. First, decide OTA vs native build

```bash
npm run eas:fingerprint                          # -> runtimeVersion of the working tree
npx eas-cli build:list --platform ios --limit 1  # -> "Fingerprint" of the last build
```

- **Fingerprints match**   → OTA update (3b). Applies on next app launch.
- **Fingerprints differ**  → native drift; you need a build (section 4).
  An OTA update would publish fine and silently never reach the device.

### 3b. Publish the OTA update

The `npm run eas:update:production` script is **missing two required flags** for
non-interactive shells. Run the full command instead (do **not** "fix" the
script — `package.json` scripts are a fingerprint input and editing them orphans
every OTA from the installed build):

```bash
npx eas-cli update --channel production --environment production -m "what changed"
```

Interactive shell shorthand (will prompt for the message):

```bash
npm run eas:update:production
```

Dev channel:

```bash
npm run eas:update:development
# or: npx eas-cli update --channel development --environment development -m "..."
```

---

## 4. Cut a native build → TestFlight — spends 1 of ~15 builds/month

Use this when a **native input** changed: app icon, any native field in
`app.config.ts`, entitlements, the plugins under `plugins/`, a new/upgraded
native module, an SDK bump. Batch native changes into one build.

```bash
npm run eas:build:ios:production   # eas build -p ios --profile ios-production --auto-submit
                                   #   builds AND submits to App Store Connect / TestFlight
```

Local pipeline (no EAS quota, needs fastlane working):

```bash
npm run eas:build:ios:local        # eas build -p ios --profile ios-production --local
```

Android development build (internal distribution APK):

```bash
npm run eas:build:android:development
```

### After the build submits

Apple processing takes ~5–10 min. The **first** build needs the
export-compliance prompt cleared once, in the browser:

```
https://appstoreconnect.apple.com/apps/6800990955/testflight/ios
```

---

## 5. Check build / submission status — read-only, no quota

```bash
npx eas-cli build:list  --platform ios --limit 5
npx eas-cli submit:list --platform ios --limit 3
npm run eas:fingerprint                             # this tree's iOS runtime version
```

Diagnosis order when an OTA update "doesn't arrive": **not the network first.**
`npm run eas:fingerprint` vs the runtime version `eas update` printed — a
mismatch means the tree has native changes the installed build lacks. The fix is
a build, not a retry.

---

## 6. Backend — Supabase

This machine cannot reach Postgres directly (port 5432 blocked, IPv6-only host,
no Docker). Everything below goes over HTTPS.

### Run SQL against the live project

```bash
./supabase/scripts/remote-sql.sh "select ..."
./supabase/scripts/remote-sql.sh -f path/to/file.sql
```

### Deploy an Edge Function

```bash
supabase functions deploy <name> --project-ref zniopywbwenrzxezolwv
```

Functions: `sync-health`, `finalize-days`, `replay-scores`,
`dispatch-notifications`. (`seed-health` is still in the tree but was
**undeployed on 2026-09-02**, before external testers — it fabricates activity.
Redeploy it only to a project with no real users.)

**The four deployed Edge Functions that bundle `core.ts` / `rescore.deno.ts`
redeploy together** — `sync-health`, `finalize-days`, `replay-scores`,
`dispatch-notifications`. Deploying only one leaves the others on the old scoring
model (split-brain).

**A migration touching a table an Edge Function writes ships with that
function's redeploy** — applying one without the other took scoring down for two
days in Aug 2026.

### Apply a migration (no `supabase db push` here)

```bash
# 1. run it
./supabase/scripts/remote-sql.sh -f supabase/migrations/<timestamp>_<name>.sql
#    wrap multi-statement migrations in  begin; ... commit;

# 2. record it so the CLI won't re-apply it
./supabase/scripts/remote-sql.sh \
  "insert into supabase_migrations.schema_migrations (version, name) \
   values ('<timestamp>', '<name>');"
```

### Smoke-test after every deploy

```bash
node supabase/scripts/smoke-sync.mjs
```

Runs a real sync against the deployed function. A `str_points` that is **not**
250 / 650 / 1200 proves the point interpolation is live; it also asserts
`has_sleep_source` is still being written.

### Retention / admin analytics

```bash
./supabase/scripts/remote-sql.sh "select * from kairo_retention();"
```

`EXECUTE` is revoked from clients — run it here, never from the app.

---

## 7. Credentials & one-off maintenance

### Apple Sign in with Apple client secret (~182-day expiry)

```bash
npm run apple-secret     # mints + installs the ES256 JWT, prints the expiry — diary that date
```

When it lapses, sign-in breaks for every user at once.

### APNs push key

Uploaded to Expo via `eas credentials` (not in git). A send without it returns a
ticket error.

### App icon validation (before a build)

```bash
mkdir -p /tmp/out && xcrun actool --compile /tmp/out \
  --platform iphoneos --minimum-deployment-target 26.0 --target-device iphone \
  --app-icon Kairo --output-partial-info-plist /tmp/out/p.plist assets/Kairo.icon
```

Exits non-zero on a bad Icon Composer schema (which otherwise passes every local
check and only fails in CI). After changing icon **artwork**:

```bash
npx expo prebuild -p ios --no-install
xcrun simctl uninstall booted <bundle-id>   # SpringBoard caches icons across reinstalls
```

Check the PNG fallback has no alpha:

```bash
sips -g hasAlpha assets/icon.png
```

### fastlane (for `eas build --local`)

If Homebrew's fastlane breaks with `Gem::MissingSpecError`:

```bash
GEM_HOME=~/.local/share/fastlane/4.0.0 gem install <missing-gem>
# seen: bigdecimal, digest-crc, nkf, rbs
```

---

## 8. The one-minute decision tree

```
Changed only app/, src/, packages/kairo-core ?
│
├─ yes → npm run eas:fingerprint  ==  last build's Fingerprint ?
│        ├─ match  → npx eas-cli update --channel production --environment production -m "..."
│        └─ differ → native drift → build (below)
│
└─ no (icon / app.config.ts native field / entitlements / plugins/ / native module / SDK)
         → npm run eas:build:ios:production      (spends 1 of ~15/month; auto-submits)
         → clear export compliance in App Store Connect
         → TestFlight installs it over the air

Touched the database or an Edge Function ?
  → remote-sql.sh -f <migration>  +  record in schema_migrations
  → supabase functions deploy <name>  (redeploy ALL core-bundling functions together)
  → node supabase/scripts/smoke-sync.mjs
```

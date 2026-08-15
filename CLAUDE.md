# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kairo is a Philippines-market health accountability app, **solo-first**: an RPG character levels from your real HealthKit activity, and squads are an optional layer on top — a daily leaderboard, plus shared goals over a span of days, weeks or years. iOS first via Expo; Supabase backend.

**Sabotage was removed on 2026-08-09.** It was the original premise (§8, and §20's principle #4 called it "the soul of the product"), so a lot of prose still assumes it. Nothing in the code does. If you find a reference, it is stale — fix it.

**Bronze/Silver/Gold are internal to scoring as of 2026-08-10.** `tierFor()`, `TIER_POINTS` and `daily_scores.tiers` still decide every day exactly as §5/§6 specify — nothing about the engine changed. But no surface renders a tier name or colour any more: the character sheet and the leaderboard both show a numeric **ability rating** from `ratingForStatPoints()` over lifetime per-stat rollups on `profiles`. If you find UI naming a tier, it is stale. **`profiles.focus` was dropped the same day** — `squads.program` is the only focus concept, and the character screen's "lane" reads observed dominance instead.

**Points are spoken only inside Goals, as of 2026-08-15.** `daily_scores.total`
still ranks the board, scores every Goal, and feeds XP and ratings — nothing
about the engine changed, exactly as with tiers in deviation #23. But no ambient
surface prints it: the home hero is the day in real units, a leaderboard row is
rank and the gap to the row above, and `src/features/squad/row-label.ts` speaks
that gap rather than a total — deliberately, because a screen reader naming a
figure the screen does not show describes a different product. A Goal keeps its
points because the user typed that target. If you find a surface outside
`src/features/goals/` rendering a score total, it is stale — fix it.

**Solo mode gained a floor and a curve on 2026-08-15** (deviations #31–#33).
Three things that are easy to break by accident:

- **`DAILY_STEP_BASELINE` is derived from `THRESHOLDS.AGI.gold`, never written
  as a literal** — and `scoring.test.ts` *also* pins it at 10,000. Both halves
  matter and they guard opposite failures. The derivation stops a raised Gold
  leaving a second number describing the old one; it is what lets the walk
  streak read `tiers->>'AGI' = 'gold'` out of `daily_scores`, which stores tiers
  and never raw steps. The literal in the test stops the derivation being *too*
  obedient: the Daily Walk baseline is a public-health number that must never
  scale with the user, so a raised Gold silently dragging it upward would be
  exactly as wrong as it going stale. Raise Gold and the test fails, and a human
  decides.
- **A Challenge is derived, never stored.** `resolveChallenge()` is a pure
  function of qualifying sessions **strictly before** the day being judged, and
  "strictly before" is load-bearing twice: the session being judged cannot move
  its own bar, and nothing stateful exists for a retroactive Apple revision to
  invalidate — the read-time projection property goal progress already has.
  Only the *completion* is stored, with the target snapshotted, because the
  trailing median can no longer answer "what did I clear in March". Do not add
  a stored level counter; clearing already makes the next one harder, because
  the median moved.
- **`workout_sessions` is owner-readable only and appears in no projection.** A
  pace carries fitness, and with distance it carries routine — at least as
  identifying as the hourly movement §5 protects. A schema test asserts no
  `public` function's body mentions the table; keep it that way. Apple's
  `HKWorkoutActivityType` **raw number** is stored untranslated, and which
  numbers mean something is decided in `challenge.ts`. `kairo-core` cannot
  import the HealthKit library and neither can a test (Flow syntax root Vitest
  cannot parse), so the guard is a **compile-time** assertion in
  `src/features/health/activity-types.ts` — proposing a runtime one is the
  obvious mistake. Related: `queryWorkoutSamples` takes **no unit parameter**,
  unlike every other read in `read.ts`, so `workout-units.ts` converts from the
  unit each `Quantity` reports and yields null for an unrecognised one, which
  becomes 0 and makes the session non-qualifying. Inert beats wrong — a 5-mile
  run stored as 5,000 metres would quietly corrupt every pace after it.

**"Hunter" and "barkada" were retired on 2026-08-11** (roadmap deviation #26). The
character has no noun — it is "your character", and the centre tab is `Character`;
a squad is a **squad**. The spec says "Hunter" throughout (§6, §15, §20) and so do
the dated docs under `docs/superpowers/`; both are historical records, not intent.
Three things deliberately still say it and are *not* stale: `profiles.class`'s
`'hunter'` default (inert internal enum, no surface renders it), the
`output/imagegen/hunter-*.png` render sources, and the **art-direction prompts** in
`scripts/generate_swap_assets*.py` plus §20's "dark fantasy hunter aesthetic" brief —
that last one is a genuinely open decision the art regeneration has to settle, not a
missed find-and-replace. Anywhere else, it is stale — fix it.

**`src/ui/Text.tsx` is the only Text, as of 2026-08-14.** Import it from `@/ui`,
never from `react-native` — the two are otherwise identical, which is exactly
why the wrong one is easy to reach for. It exists because React Native scales
with Dynamic Type without an upper bound, so at the largest accessibility sizes
a 34pt display line became ~80pt and every fixed-height row tore apart. It
**caps, never refuses**: `allowFontScaling={false}` would make the layout safe
by making the app unreadable for the people the setting exists for, and it
appears nowhere in this codebase. Three scales, chosen by *what the type sits
inside* rather than by how important it is — `prose` (1.8) for copy in
containers that grow, `chrome` (1.4) for buttons and meta lines, `fixed` (1.2)
for type locked to drawn geometry. `prose` is the default so tightening is
deliberate, and it belongs in the component that owns the geometry.

**Kairo says things without words, and each one needs an accessible name.** A
stat is a glyph with no letters beside it; the character's level band, dominant
stat and ability rating are shape, shadow and ring. The pattern, set by
`StatIcon`, is: **a decorative or duplicative element is hidden**
(`accessibilityElementsHidden`), and **the group that means something is one
element with a composed label**. `STAT_NAMES` is the single source for stat
words — `Dominance` is `CoreStat | 'balanced' | null`, so it covers the figure
too and a parallel table would drift. Where composition has real edges it gets a
tested pure module: `src/features/squad/row-label.ts` exists because a
leaderboard row was twelve separate stops (a six-person board took seventy-odd
swipes), and because "1-day streak" is right on screen and wrong out loud.
Before adding a label, check the text already beside it — `GoalBar`'s pace
marker needed nothing, since `statusLine()` already says "behind pace".

**Three rules the 2026-08-14 device pass added.** First: **grouping is
explicit.** `accessible` + `accessibilityLabel` on a parent is documented to
collapse its descendants on iOS and *did not* on that build — a leaderboard row
still read as separate stops. The mechanism is unconfirmed and the fix
deliberately does not depend on it: the parent keeps both props **and** every
direct child is hidden with `accessibilityElementsHidden` +
`importantForAccessibility="no-hide-descendants"`. Neither half is redundant;
removing one is how this comes back. Second: **the character HUD's layout stays
flow-based.** It was the app's only absolutely-positioned chrome, pinned at
`+8`/`+48`/`+48`/`+132`, and those constants assumed pill heights nothing
enforced — at large Dynamic Type the pills grew past each other and overlapped.
It is one flowing column now; do not reintroduce a `top` on any child. Third:
**before adding an accessible name, read what is already spoken around it.** A
label that repeats an adjacent line is noise; a label inside a control that
already names itself is a bug — `StatCoin` got one inside `StatRail`, which is a
single `Pressable` already speaking all four ratings, and it was reverted.

**Accessibility structure is verified in Xcode's Accessibility Inspector on the
simulator before a TestFlight build is cut.** This qualifies the "UI is verified
by hand on device" posture below rather than replacing it: the grouping failure
above cost a full build to find and another to confirm, and the inspector
answers *"is this row one element or twelve"* directly, with no VoiceOver
gestures and no build. Dynamic Type needs no GUI at all —
`xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`
sets it and `xcrun simctl io booted screenshot` captures the result.

**Stat identity is a glyph, not three letters, as of 2026-08-11.** `src/ui/StatIcon.tsx`
owns the only mapping; `StatCoin`, `StatBar` and `LeaderboardRow` all read it. It is
MaterialCommunityIcons on purpose while all chrome stays Feather — the split is
hairline = *things you operate*, solid = *things you are*. Don't blur it in either
direction.

**Onboarding is two screens as of 2026-08-11** (roadmap deviation #27): choose a
character body, then name it. **The profile row still commits exactly once**, on
the name screen — that is load-bearing, not incidental. Deviation #22 deleted the
`finishingOnboarding` flag when onboarding collapsed to one step; asking anything
*after* the INSERT flips `resolveRoute` to `'ready'` under the unfinished screen
and needs that flag back. Add onboarding steps *before* the name, never after.
`profiles.character_body` is cosmetic and nullable (null = never asked); it is
deliberately **not** `profiles.sex`, which stays dead.

**Two documents hold the decisions. Read them before proposing changes.**

- `Kairo_Master_Summary.md` — the product spec (v1.4). Sections are cited throughout the code as `§5`, `§12`, etc. Comments referencing a `§` are pointing here.
- `docs/roadmap.md` — build sequencing, phase status, and an **approved-deviations table**. Deviations from the spec are deliberate and recorded; propose changes against that table rather than "fixing" them.

`docs/user-journey.md` walks the end-to-end user flow (onboarding → daily loop → character → squad → goals) grounded in what's actually built, not just spec'd. Update it whenever a flow changes.

**`docs/mvp-scope.md` is the IN/OUT contract.** Cite it in any QA brief, test plan or store-facing copy. It exists because the August 2026 QA pass graded Kairo against a v1.3-era brief and scored four sections 1/10 for features that were deliberately removed (sabotage) or deliberately deferred (gear, referrals, monetization) — burying the findings that mattered under findings about a product that no longer exists. If a brief describes something not listed there, the brief is stale.

`docs/qa/kairo-end-to-end-qa-report.md` is that pass, plus an addendum tracing its central finding to a stale Edge Function deployment. **Two of its claims do not survive checking** and are corrected in place: the body-metric "defaults" are placeholders on empty inputs (nothing invented can be saved), and the finalization scheduler was healthy throughout. Its dispositions are tabulated in `docs/roadmap.md` under "End-to-end QA findings".

## Tooling conventions

- **Use context7 for library/SDK docs.** Before writing or debugging code against a versioned dependency (Expo SDK, Supabase client, React Navigation, HealthKit wrappers, etc.), pull current docs via context7 rather than relying on training-data recall — APIs move and training data goes stale.
- **Use graphify to navigate the codebase.** Prefer it over ad-hoc grep/find for architecture questions, call graphs, and cross-file relationships (`graphify-out/` holds the indexed graph) — it's faster and keeps answers grounded in the real dependency structure.
- **Route UI/UX changes through the frontend-design skill.** Any new or modified screen/component under `app/` or `src/` gets a design pass through that skill before implementation, so it lands as intentional design rather than generic RN defaults — Kairo's character-first visual identity (§6) is easy to flatten otherwise.
- **Documentation updates are part of the change, not a follow-up.** A change to product behavior, architecture, or setup steps updates `README.md`, this file, and `docs/user-journey.md` (or whichever `docs/` file governs it) in the same pass.

## Commands

```bash
npm test                 # everything: kairo-core (node) + schema/planner suites
npm run test:core        # packages/kairo-core only
npm run test:schema      # schema (PGlite) + Edge Function planners
npm run typecheck        # tsc + workspace tsc + deno check, all three

# single file / single test
npm run test:core -- --run src/streak.test.ts
npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts
npx vitest run --config vitest.config.ts -t "Streak Shield"

# app
npm run ios              # build + run on simulator (needs Xcode + CocoaPods)
npm run prebuild         # regenerate ios/ from app.config.ts — then COMMIT ios/ (see below)

# backend
./supabase/scripts/remote-sql.sh "select ..."      # SQL against the live project
./supabase/scripts/remote-sql.sh -f file.sql
supabase functions deploy <name> --project-ref zniopywbwenrzxezolwv
```

## Environment constraints — read before debugging connection errors

This dev machine cannot reach Postgres directly. Three independent causes, none of which indicate a broken project:

- Outbound **port 5432 is blocked** on this network.
- Supabase's direct host resolves **IPv6-only** with no IPv4 route here.
- **Docker is unavailable.** Podman Desktop is installed but its VM does not mount the project directory (`workdir ... does not exist on container`).

So `supabase db push`, `psql`, and `supabase start` all fail. What works, all over HTTPS: `supabase/scripts/remote-sql.sh` (Management API, auth from the CLI's Keychain entry), `supabase functions deploy`, and the PGlite test harness.

**Applying a migration** therefore means: run it via `remote-sql.sh -f`, then insert its row into `supabase_migrations.schema_migrations` yourself, or the CLI will try to re-apply it later. Wrap multi-statement migrations in `begin; ... commit;`.

**This machine also cannot pair an iPhone over USB, and the cause is not fixable from the phone.** It is corporate-managed — CrowdStrike Falcon runs as an Endpoint Security system extension (alongside Zscaler, Tanium and GlobalProtect), and its Device Control policy denies `usbmuxd` the iPhone's USB interface. The kernel signature is `IOUC AppleUSBHostInterfaceUserClient failed MACF in process pid …, usbmuxd`. Because no lockdown pairing record can be written, the phone re-prompts "Trust This Computer?" on *every* plug-in, `xcrun devicectl list devices` always says `No devices found`, and Developer Mode never appears in iOS Settings (it is gated on a completed pairing). **`npx expo run:ios --device` is therefore unavailable here** — device builds go through **Xcode Cloud → TestFlight**, which installs over the air and never touches USB (`docs/xcode-cloud.md`; EAS Build was the alternative and was declined). Four things were tested and are *not* the cause, so do not re-derive them: Developer Mode, a cached "Don't Trust", macOS accessory authorization, and the cable. Triage table in `README.md` under "Building onto a physical device".

**`ios/` is committed as of 2026-08-12** (roadmap deviation #28), because Xcode Cloud configures a workflow against a scheme in a project that has to exist in the repo. Only build output stays ignored: `ios/Pods/` (1.2 GB, reinstalled in CI from the committed `Podfile.lock`), `ios/build/`, `ios/DerivedData/`, `ios/.xcode.env.local`, `xcuserdata/`. **The consequence that bites: `app.config.ts` is no longer the source of truth for native config.** The committed `Info.plist` and `Kairo.entitlements` are what ship, so changing `usesAppleSignIn`, `NSHealthShareUsageDescription`, the HealthKit plugin's `background: true` or any plugin needs `npm run prebuild` **and a commit of the regenerated `ios/`**, or the change silently never reaches the build — the same class of failure as shipping a migration without its Edge Function redeploy. The JS half is unaffected: `extra` and `EXPO_PUBLIC_*` are evaluated during the Xcode build's bundle phase, so workflow environment variables do land. Xcode Cloud's build scripts live at `ios/ci_scripts/` because Apple looks for `ci_scripts` **beside the project, not at the repo root**; `expo prebuild --clean` deletes them, so `scripts/ci/` is their source of truth and `postprebuild` reinstalls them — the same arrangement, and the same reason, as `write-xcode-env.mjs`.

**React Native core is built from source as of 2026-08-13** (roadmap deviation #29),
via `plugins/withReactNativeFromSource.js` → `ios.buildReactNativeFromSource`. This is
not a preference: Meta's prebuilt `React.xcframework` is compiled against libc++ 19,
CocoaPods compiles `ExpoModulesCore` against the installed Xcode's libc++ 21, and the
two disagree about `sizeof(ShadowNodeFamily)` by 64 bytes — so every Expo view
overflows its own heap block and the app dies before the first frame. Headers are
byte-identical; nothing warns. **Do not re-enable prebuilts to speed up CI** —
`ci_post_clone.sh` fails the build if the `React-Core-prebuilt` pod comes back.
The debugging lesson is the durable part: the crash surfaced as
`-[RCTComponentViewFactory createComponentViewWithComponentHandle:]`, which reads as
an unregistered Fabric component and is not one. A crash signature that **varies
between runs of the same binary** is heap corruption, not a bug where it crashed;
reproduce it with a Release *simulator* build (100%, no TestFlight round trip) and
pin it with Guard Malloc, leaving `MALLOC_PROTECT_BEFORE` unset. Full account in
`docs/xcode-cloud.md` under Known landmines.

## Architecture

### `packages/kairo-core` is the keystone

Pure, zero-dependency TypeScript: scoring, local-day math, goal evaluation, anti-cheat, progression, streaks. **No I/O, no clock reads, no randomness** — every function takes what it needs as an argument, which is why timezone and DST behaviour is testable without mocking.

Both consumers import the same files:
- Expo app → `@kairo/core` (tsconfig path + Metro `watchFolders`)
- Supabase Edge Functions → `supabase/functions/_shared/core.ts`, a relative re-export

This is what makes §12's server-authoritative rule affordable. Do not add a second implementation of scoring anywhere, and do not add dependencies to this package.

### Writes are server-authoritative

Clients have `SELECT` on their own rows and **zero write grants** on `health_buckets` or `daily_scores`. Edge Functions own every mutation:

- **`sync-health`** — the only door health data enters. Upserts hourly buckets, then re-reads the *whole* day before rescoring (a partial payload must not collapse the day's total).
- **`finalize-days`** — hourly `pg_cron`, the only place a day becomes `final`. Guarded by `CRON_SECRET`.

Scores are always *replayed* from stored buckets, never adjusted in place. That is what makes retries, Apple's retroactive step revisions, and cron overlap all safe. Preserve this property — goal progress is a read-time projection over `daily_scores` for the same reason, and stores no number of its own.

### Structural invariants worth not breaking

- **Privacy is a projection, not a convention.** `profiles` is owner-readable only (the row holds height/weight/birth year, and RLS is row-level). Squadmates reach data through `squad_leaderboard()`, which has no argument that returns raw steps or hourly movement.
- **`reject_mutation()` and the `kairo.allow_purge` flag are inert.** They enforced append-only on `sabotage_events`, which is dropped; the flag is still set by `handle_profile_deletion()` / `leave_squad()` and now guards nothing. Left in place on purpose — it is not worth reopening that path for a no-op. See `20260809120000_remove_sabotage.sql`. **History (2026-08-11):** that migration's comment and this line both used to say `delete_account()` when no such function existed; the correction is kept because it explains why the flag is inert. **`delete_account()` now does exist** — see below.
- **Erasure is `delete_account()`, and most of it was already wired.** Migration `20260811140000` added the RPC and `app/delete-account.tsx`; the cascade underneath predates it. It takes **no argument** on purpose — the only account it can erase is `auth.uid()`, and a `p_user_id` parameter would make it one bug away from letting any signed-in user erase anybody. Three behaviours are deliberate and easy to "fix" wrongly: `profiles_handle_deletion` (BEFORE DELETE) hands squad leadership on *before* the FK cascade, so erasing a leader does not destroy the squad; `goals.created_by` is **SET NULL**, not CASCADE, so a shared goal survives its author — it confers only the `goals_update_own` title edit, so nulling it means nobody inherits the rename right; and `profiles_collect_orphaned_goals` (AFTER DELETE) sweeps goals left with neither creator nor participant. That sweep **must** stay AFTER: `goal_completions_xp_rollup` updates `profiles`, so reaching a completion from a BEFORE trigger modifies the row being deleted and Postgres aborts the statement.
- **Account-scoped tables reference `auth.users`; character-scoped tables reference `profiles`.** `app_events` and `device_tokens` are the account's (2026-08-11) — a profile does not exist until onboarding commits it, and pointing them at `profiles` made every write between sign-in and profile creation fail `23503`. That did not just drop rows: it made the sign-in → abandon funnel unmeasurable, because a user who never names a character produced no events *by construction*. Before adding a table, ask which it belongs to. Erasure is unaffected either way, since `profiles.id` already cascades from `auth.users`.
- **`profiles.total_xp` is a rollup**, recomputed as `sum(daily_scores.xp_awarded)` (plus `goal_completions.xp_awarded`) by trigger — never incremented, so nothing double-counts. The same function maintains `agi_total`/`str_total`/`end_total`/`vit_total`, which feed the ability ratings. Its trigger skips the recompute only when *every* column it reads is unchanged: a same-tier rescore (5,200 → 8,000 steps, both Silver) moves the raw points and not the XP, and a narrower skip loses it silently.
- **Strain is display-only.** `computeStrain()` runs on the client over `health_buckets.avg_heart_rate` and `daily_heart`. It never touches `daily_scores`, so score replay is unaffected. Heart rate is owner-readable only and absent from every projection — it is at least as revealing as the hourly movement §5 protects.
- **Column-level grants:** `profiles` UPDATE is granted per-column. A column-level `REVOKE` against an existing table-level `GRANT` is silently a no-op in Postgres; revoke the table grant and re-grant the allowed columns.
- **A migration touching a table an Edge Function writes ships with that function's redeploy.** Applying one without the other took scoring down for two days in August 2026: `remove_sabotage` dropped `daily_scores.sabotage_delta`, the deployed `sync-health` kept sending it, and because its bucket upsert commits *before* the score upsert, health data kept landing while nothing scored. Every test passed the whole time — they check the source, not the deployed artifact. Two guards now exist and both matter: the schema suite inserts `planDay`'s **real output** into `daily_scores` (so drift fails at commit time), and `supabase/scripts/smoke-sync.mjs` runs a real sync against the deployed function (so drift fails at deploy time). Run the latter after every deploy. Full post-mortem in `docs/qa/kairo-end-to-end-qa-report.md`.
- **Sign in with Apple has two halves the repo cannot see.** The app side landed 2026-08-12 (`appleProvider` in `src/features/auth/providers.ts`, `usesAppleSignIn` in `app.config.ts`, Apple's branded button on `app/(auth)/sign-in.tsx` — required by their HIG, so do not swap it for Kairo's `Button`). The other two halves live outside git and fail silently: the **Sign in with Apple capability on the App ID**, whose absence is indistinguishable from a device not signed into an Apple ID, and the **client secret**, an ES256 JWT that Apple caps at ~182 days and that takes sign-in down for every user at once when it lapses. `npm run apple-secret` mints and installs it and prints the expiry — diary that date. The nonce is load-bearing: `signInAsync` gets the SHA-256 hash, `signInWithIdToken` gets the raw value, and sending the hash to both makes gotrue hash a hash. Runbook in `docs/sign-in-with-apple.md`. `external_anonymous_users_enabled` stays `true` on the project on purpose — the `__DEV__` guard in `availableProviders()`, not the project setting, is what keeps anonymous out of TestFlight.
- **Every request has a deadline, because a hung request is worse than a failed one.** `supabase-js` sets no timeout and neither does `fetch`, so a **black-holed** host — DNS resolves, the TCP connection never completes — yields a promise that never settles. On 2026-08-14 a WiFi network began blocking `*.supabase.co` that way and the app sat on the KAIRO hold overlay permanently, surviving relaunches *and* a reinstall from TestFlight: `resolveRoute` reports a query with no data as `'loading'`, so the `'profile-error'` cover with its "Try again" button was already built and unreachable, because nothing ever errored. `src/lib/fetch-timeout.ts` is wired into `createClient`'s `global.fetch`. It **races** a deadline against the request rather than only aborting, since aborting merely asks the transport to reject and this exists for the case where the network layer is misbehaving; the abort still fires, to free the socket. Diagnostic worth reusing: `curl -w 'connect=%{time_connect}s'` showing DNS resolved but `connect=0.000000s` is a block, not an outage — and check the Management API separately, since `api.supabase.com` is a different host and stays up while the project's own subdomain is unreachable.
- **TanStack Query does not know what offline means on a phone unless told.** Its default online detection is the browser's `online`/`offline` events, which React Native does not have — so without wiring it believes it is permanently online, and a query fired with no signal spends `retry: 2` immediately and lands in an error state instead of pausing. `src/lib/query-client.ts` wires `onlineManager` to NetInfo using **TanStack's documented recipe unmodified** — `Boolean(state.isConnected)`. It briefly read `isInternetReachable` instead, on the reasoning that a captive-portal wifi is "connected" and cannot reach Supabase. True, but the wrong trade: that field is NetInfo's own probe against an unrelated third-party endpoint, so a network blocking *the probe* while Supabase works reports offline forever, and paused queries never error — the same endless spinner as above. Prefer the false positive that fails loudly over the false negative that hangs; `fetch-timeout.ts` covers the captive-portal case. Do not "improve" on the documented recipe here again.
- **Push has a client half that was missing until 2026-08-14, and a credential the repo cannot see.** The server had been sending a deep-link payload — `{trigger, localDate, screen}` from `dispatch-notifications`, plus `goalId` from `finalize-days` — since the notification engine shipped, and **nothing read it**: no `setNotificationHandler` (so a foreground push displayed nothing at all, which reads exactly like push being broken) and no response listener (so a tap went nowhere). `src/features/notifications/routing.ts` is the fix and follows the house split — `notificationTarget()` decides and is tested in Node, `useNotificationRouting()` performs. Three things there are load-bearing: `screen: 'character'` maps to **`/`**, not `/character`, which is the *onboarding* body picker; the hook is mounted in `app/(tabs)/_layout.tsx` because that layout only exists for a `'ready'` user, so mounting **is** the gate; and both `useLastNotificationResponse()` and the response listener are wired, because a tap that launches the app from terminated is retained by the former and never emitted to the latter. The credential is the **APNs key uploaded to Expo** (`eas credentials`) — same failure shape as the Apple client secret, invisible in git, and a send without it returns a ticket error rather than doing nothing.
- **`aps-environment` is a committed-`ios/` value that EAS would otherwise own.** Expo's notifications plugin defaults it to `development` (the APNs sandbox) and **EAS Build is what rewrites it to `production`** for a distribution build. Xcode Cloud does not — it ships the committed `ios/` as it finds it — so `app.config.ts` now declares `['expo-notifications', { mode: 'production' }]` explicitly rather than letting the default arrive unannounced. Do not treat this as proof push works: Expo's service relays to both environments. **And do not try to read the value back on TestFlight** — `expo-application` parses `embedded.mobileprovision`, App Store distribution strips that file from the bundle, and the answer is `null` there structurally (the library's own `appReleaseType` has an explicit branch for the file's absence). A diagnostic built on it shipped on 2026-08-14 and told a healthy TestFlight device it was a simulator. What `NotificationSettingsCard` reports instead is **registration**, which is knowable everywhere and the stronger signal anyway: `getExpoPushTokenAsync` fails with *"no valid aps-environment entitlement string found"* when the entitlement is wrong, so a token that exists is evidence the entitlement is right. Simulator is decided by the release type, never by a null environment. The line ships in **Release** on purpose — `__DEV__` would hide it from TestFlight.
- **The HealthKit disclosure is derived, not written.** `src/features/health/read-types.ts` is the single list of requested types; `disclosure.ts` maps each to user-facing copy, and `disclosure.test.ts` fails if either side names something the other does not. That list lives apart from `permission.ts` because anything importing `@kingstinct/react-native-healthkit` drags in React Native's Flow syntax that root Vitest cannot parse — the same constraint `sync-state.ts` records. The `NSHealthShareUsageDescription` string in `app.config.ts` covers the same types and is the one half no test can lock; update it by hand when the list changes.

### Per-user local days

Every player's day runs midnight-to-midnight in **their own** timezone (§2), so a squad spans multiple calendar dates at any instant. Health buckets, scores, and goal windows are keyed by local date. `finalizable_days()` in SQL and `isFinalizable()` in `kairo-core` implement the same ~2h grace window and are kept honest by a differential test.

## Conventions

- **`*.deno.ts`** marks a shared module that imports Deno-only specifiers (`npm:`, Deno globals). These are excluded from `tsc` and checked by `deno check` instead. Everything else under `supabase/functions/_shared/` stays pure so vitest can exercise it.
- **Edge Function handlers stay thin.** Every decision lives in a `*-plan.ts` module tested in plain Node; `index.ts` only authenticates, reads, plans, writes. This is deliberate — Docker is unavailable, so anything untestable in Node is effectively untested.
- Imports use explicit `.ts` extensions, which Deno requires and Vite/Metro both accept.

## Testing

Strict TDD on scoring, day boundaries, goals, streaks and anti-cheat — the logic where a bug corrupts real leaderboards. UI is verified by hand on device.

`supabase/tests/harness.ts` applies every migration to **PGlite** (real Postgres in WASM) with stubbed `auth` and `realtime` schemas, then asserts behaviour under the non-owner `authenticated` role. Runs in ~1.5s with no Docker.

**Its limits, so nothing over-trusts it:** it does not prove Supabase's Realtime server delivers broadcasts, nor that the hosted `auth` schema matches. `UNSUPPORTED_MIGRATIONS` in that file lists migrations it cannot apply, each with a reason — keep that list as short as possible, since every entry is schema no test covers. Verify those against the live project instead.

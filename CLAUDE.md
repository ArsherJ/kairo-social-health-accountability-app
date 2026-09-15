# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kairo is a Philippines-market health accountability app, **solo-first**: an RPG character levels from your real HealthKit activity, and squads are an optional layer on top — a daily race to a shared finish line. (A pooled Battle sat beside the race until deviation #66 retired it on 2026-09-06.) iOS first via Expo; Supabase backend.

**Current state (2026-09-12) — the ground truth a fresh session needs first:**

- **Tabs** are **Today · Sky · Flock · You** — `app/(tabs)/` is `index` (Today) · `sky` · `flock` · `profile` (You). There is no character tab.
- **Onboarding** is seven beats: `/welcome → /one-sky → /mirror → /connect → /difficulty → /privacy → /name` (`/mirror` sits between the sky card and the Health ask, added by deviation #62). The profile row commits exactly once, on `/name` (deviation #58; see its block below). **The rail draws one step per beat — "Step n of 7"** — with the hatch sharing the Health ask's step (deviation #75, 2026-09-14); *phase* survives only as the `pitch` flag Skip and the value-card dots derive from.
- **A Counting screen exists** (2026-09-14, issue #45): `app/counting.tsx`, copy in `src/features/health/counting-copy.ts`, reached from Settings, the privacy beat and the Today details sheet. It names the ridge through `RACE_FINISH_LINE` and **never the hourly ceilings** — `counting-copy.test.ts` bans the figures, formatted and bare. The privacy beat's intro names steps, active calories and sleep; the Sky's rail reads **YOUR RECENT DAYS** over a ghost race; `flightFrame` takes `footTop` and opens the grounded bird above the pinned foot.
- **Today is a progress-and-character dashboard as of 2026-09-11**: Motion and its walk meter sit beside the plush eagle in one responsive hero, followed by the bird's sentence/details action, Body and Mind, and the three quest rows. Motion appears once. `resolveLivingMirror` still owns the figure — Mind, verified strength, summit and reaction priority — while level scale, presence, plumage and the ceiling sky remain intact. Still no race copy, Mastery coins or score total; `today-board.ts` owns reading copy.
- **The app has warm-pastel light and dark schemes**: cream/charcoal pages, cocoa/cream ink, apricot primary actions, lilac support and mint secondary surfaces under the existing semantic roles. `src/theme.ts` exports `light`, `dark` and `themes`; themed screens — including all seven onboarding views — read `useTheme()` / `useStyles(makeStyles)`. Static `colors`/`ramp` remain the light palette for pure tests and authored sign-in. Settings → Appearance is System / Light / Dark on MMKV. **`userInterfaceStyle` is `automatic` in `app.config.ts`, a native field that ships with a build, not an OTA.**
- **The Sky is open-air flight toward a ridge** (2026-09-11 refinement): no winding trail, including on the scrubbable right-side minimap. Forward distance is a straight presentation of earned step progress; birds drift sideways automatically over layered scenery. Drift never changes steps or rank, stops for Reduce Motion/inactive screens, and uses the unchanged v3 assets. The scene, minimap and Locate share presentation coordinates; `flightFrame` still owns measured chrome clearance. See `docs/engineering/surfaces.md` before changing this projection.
- **The compact Flock perch is horizontally scrollable and never clamps a person's name by line count.** Cards keep a 96-point minimum, while a long label may widen to 144 points and make the card grow vertically; the domain allows 20-character names and XXXL readability outranks the earlier two-line silhouette.
- **The palette is Playful** (deviation #58), quieter since #72: one accent wash on the tab bar rather than four gradients, no gradient bands on Flock or You, cards at `radius.lg`. Every character is a **Philippine eagle** (deviations #55/#57); `profiles.species` still stores all four values and is resolved at the render boundary.
- **The character art is the plush eagle v3 pack as of 2026-09-11** (deviation #73): eleven renders and eleven crest masks, unsuffixed filenames, **no per-stage bodies and no cosmetics**. The growth stage reads as size through `figureResponse`'s `bodyScale`; `summit` is the seventh pose and the one the ridge draws. Shipped in build 26 (2026-09-15, issue #45).
- **The account-free preview mounts the four tabs and all seven real onboarding views.** Its local controls cover ready/loading/empty/private/error plus long names, ridge/summit, ceiling/reaction, missing sleep, solo ghosts and every shield branch; Connect, quest, privacy and name answers never invoke production stores or mutations. The toolbar consumes the top safe area, so only the shared screen canvas receives a preview-local top inset of zero; the nested Name view uses its measured window offset for the keyboard, while the production route keeps zero. The real bottom inset and route ownership stay intact. See `docs/engineering/mobile-screen-preview.md` before sample UI verification.
- **The scoring engine is untouched since the race pivot** and still decides every day exactly as §5/§6 specify.
- **There is no Battle, and no squad-wide target of any kind** (deviation #66, 2026-09-06). Nothing creates, renders or grades one and every live row is closed; what survives is history — see the block below. The notification ask keeps `hasSquad || hasScoredDay`.
- **The Digest reaches solo players and stops for lapsed ones** (deviations #61/#65). The privacy claim is made in **three** places, not four.
- **The privacy policy exists** (2026-09-02): `web/privacy.html`, served at `/privacy` on the invite host, linked from Settings beside a "Send feedback" row, and guarded — since 2026-09-07 — by `src/features/privacy/claim-surfaces.test.ts` along with every other surface that makes the claim. The App Store answers are `docs/app-store-privacy.md` and the listing copy — name, subtitle, description, keywords — is `docs/app-store-listing.md`. What remains is by hand: the controller's legal name in the page, App Store Connect's fields (the privacy answers **and** the listing), the `NSHealthShareUsageDescription` build.

Everything below this line is the *rules* — the short form of every decision a session is likely to trip over. The *why* and the *history* live in `docs/engineering/*.md`, moved there verbatim (2026-09-08 and 2026-09-12) to keep this file inside its size limit. **Read the named doc before changing anything a block touches**; each block is only the tripwires.

| Doc | Read before |
| --- | --- |
| `docs/engineering/scoring.md` | changing a threshold, a shift, a point curve, a stat's copy, the Daily Walk baseline or a Challenge |
| `docs/engineering/health-ingest.md` | touching a HealthKit read filter, the hourly ceilings or `stat_records()` |
| `docs/engineering/surfaces.md` | adding or reshaping a screen, a token, a scheme, the Sky projection, the tab bar or any bounded sheet |
| `docs/engineering/character.md` | touching the eagle, the Living Mirror, poses, reactions, the crest, the art pack or `figureResponse` |
| `docs/engineering/race.md` / `race-pivot.md` | touching the corridor, `placeRacers`, `race_results`, `RACE_FINISH_LINE` or the retention funnel |
| `docs/engineering/notifications.md` | touching the Digest, `shouldAskForNotifications`, the ask copy or push routing |
| `docs/engineering/privacy.md` | touching any sentence that describes what Kairo reads or shares, or the consent gate |
| `docs/engineering/invites.md` | touching invite links, `join_squad`, `preview_squad` or `consume_rate_limit` |
| `docs/engineering/onboarding.md` | adding an onboarding beat, the disclosure gate, `connect-health.ts` or the permission sheet |
| `docs/engineering/quests.md` | touching `pickQuests`, `questTier()` or `recalculate_user_xp` |
| `docs/engineering/shipping.md` | deciding OTA vs build, touching `app.config.ts`, `eas.json`, the plugins, the icon or fastlane |
| `docs/engineering/backend-invariants.md` | adding a table, a grant, a trigger, a migration that an Edge Function writes, or a request path |
| `docs/engineering/retired-vocabulary.md` | when a doc or a comment says sabotage, Hunter, barkada, a tier name, a score total or Sunlit |
| `docs/archive/battle-and-goals.md` | touching `challenge_events`, `event_*` tables or their RLS |

**Scoring (deviations #41, #51, #68, #31–#33).** `CoreStat` is `'AGI' | 'STR' | 'MND'` — Body · Motion · Mind on every surface, engine keys nowhere (`src/ui/stat-names.ts` is the single source). Shifts move bands, never multiply points; verified strength minutes raise Body's raw value and a rested night lowers Body's bands — never the other way round. Read `tiers->>'AGI_base'`, never `'AGI'`, for the Daily Walk. Prove a shift through `computeDailyScore`, never `tierFor`. `planDay`'s `earnableStats` / `verifiedStrengthMinutes` and `statShifts`' `sleepMinutes` are required, never defaulted. `DAILY_STEP_BASELINE` derives from `THRESHOLDS.AGI.gold` and a test also pins it at 10,000 — both halves. A Challenge is derived from sessions strictly before the day judged; `workout_sessions` appears in no projection. A scoring change that moves history redeploys all five Edge Functions and runs `replay-scores` in the same deploy (ADR-0001).

**Health ingest (deviation #67).** `EXCLUDE_TYPED_IN` is a compound `NOT` over `withMetadataKey`, never `notEqualTo` (a scan bans the word in `read.ts`). Untrusted step sources go through `partitionStepSources` into `filter.sources` on one combined collection, holding the objects `querySources` returned; an empty trusted list skips the collection rather than passing `[]`. `HOURLY_CEILINGS` flag and never clamp or reject; `stat_records()` skips a flagged day; `FLAGGED_DAY_NOTE` never says "won't count". `dev-seed.ts` must keep working.

**Retired vocabulary.** Sabotage (2026-08-09), tier names on any surface (2026-08-10), score totals on any surface (2026-08-15), "Hunter"/"barkada" (2026-08-11), body-metric benefit claims (deviation #60) and the Battle (deviation #66) are all gone; a doc or comment outside `docs/archive/` still using them is stale — fix it. `profiles.class`'s `'hunter'` default is the one deliberate survivor.

**The Battle (deviation #66).** The three `challenge_events` tables stay — `recalculate_user_xp` sums `event_completions.xp_awarded` and dropping them silently lowers every level. `closed_at is null` on every read. `recalculate_user_xp` is a full recompute written out whole: read the deployed body before editing, and number a migration after any sibling that rewrites the same function.

**Invites (deviation #71).** `INVITE_HOST` is one constant read by `app.config.ts` and `invite-message.ts` and is a one-way door. `join_squad` returns **null** for an unknown code and for an exhausted budget — one return, one constant (`NO_SUCH_SQUAD`), never "too many attempts". `consume_rate_limit` is charged before the lookup, shared by `preview_squad`, keyed by the UTC date, resolved from `auth.uid()`, and the RPC is `volatile`. Do not restore the 22023 raise: an exception rolls back the counter.

**Onboarding and disclosure (deviations #22, #37–#39, #58, #63, #64, #75).** Seven beats, declared once in `src/features/onboarding/beats.ts`; the profile row commits exactly once, on `/name` — add steps **before** it, never after. The rail is one segment per beat and `RAIL_STEPS` is derived; the hatch shares `/connect`'s step; Skip and the dots read `pitch`, never a step. `disclosureStage()` gates on lifetime `total > 0` scored days; hide on `stage`, navigate on `resolved && stage`. `syncStatus`'s `'no-data'` never shadows `'failed'`/`'stale'` and waits `QUIET_GRACE_MS`. Connecting Health is `connect-health.ts`, never inlined. Every bounded sheet: `maxHeight`, a `ScrollView` that is `flexGrow: 0, flexShrink: 1`, content in a `View` with an explicit point width; find the failure at XXXL and relaunch after changing content size. Native modals lease `src/ui/modal-owner.ts` — claim and release in the same effect.

**Notifications (deviations #52, #61/#65).** One push a day, `daily_digest` at 08:00 local; `MAX_NOTIFICATIONS_PER_DAY` stays 3 and bounds only the budgeted triggers, so no surface may state a hard daily cap or promise quiet hours. `shouldAskForNotifications` earns the ask on a squad or a first scored day; the ask copy lives in `ask-copy.ts` and its `DIGEST_LOCAL_HOUR` is tested against `DIGEST_HOUR`. `users_needing_digest()` suppresses after seven local days without a score (`> today - 7`, a commented literal). `notificationTarget()` maps `'today'` → `/`, `'squad'` → `/flock`, `'character'` → `/`; `event_completed`'s `eventId` addresses nothing. Retired triggers stay in `NotificationTrigger`.

**Privacy (issues #19, #27; deviation #47).** `src/features/privacy/claim-surfaces.test.ts` is the one test and `claim-copy.ts` the one file allowed to word the claim; every surface is registered there and the list is held whole by three sweeps — never start a second scan beside it, and never fix a false sentence by shortening it. The consent gate is reciprocal and per row: gate on `isSuccess && !consented`, below every hook; a row with null `steps` keeps its place. `race_results` has no client grant — read through `race_result()`. The claim also lives in `NSHealthShareUsageDescription`, App Store Connect and TestFlight, which no test reaches.

**The character (deviations #40, #55, #57, #59, #73; issues #32, #33).** Every character is a Philippine eagle, resolved at the render boundary by `displaySpecies()`; `profiles.species` and `parseSpecies` still accept all four. `speciesLine()` is the only place the sentence is printed. Today is the Living Mirror: no race copy, Mastery coins, quest rings or Daily Walk card; `todayQuests()` resolves exactly three and `selectNextStep()` marks one; the personal Streak and the Daily Walk run are different figures with different labels. The presence ring is `auraStrength()`'s; Body drives the ground shadow only. `dayPose()` resolves Motion against Body and `summit` wins; `resolveLivingMirror`'s `verifiedStrengthMinutes` is required. `living-reaction.ts` is the only producer of a `level:a->b` occurrence; only the presented reaction is consumed; `moments.ts` is fixed-size. The art is the plush eagle v3 pack — eleven renders, eleven crest masks, literal `require`s, no per-stage bodies, no cosmetics; re-run `scripts/generate_crest_masks.py` after any change to its `SOURCES`. `figureResponse()` owns how loudly the figure answers to level. `kairo-voice.ts` owns what the bird says.

**The race (deviations #44, #46, #47, #56).** The scoring engine is untouched by the pivot; the race reads raw units alongside it, never instead. `RACE_FINISH_LINE` is `DAILY_STEP_BASELINE`, derived — `10_000` appears in no race file. `squad_leaderboard()` orders by the weighted total and the corridor re-ranks on the client; `placeRacers` de-overlaps deterministically; `sky-path.ts` is arc-length parameterised; the corridor is plain React Native. `SoloBoard` has no race on it. `sky-empty.ts` names no rank and invents no rival. `race_seen` and `quest_cleared` fire once per local day via `daily-marker.ts`; `kairo_retention()` is unchanged across the pivot.

**Quests (deviation #50).** A quest is derived (`pickQuests` hashes `(userId, localDate, tier)`), only `quest_completions` is stored, and a `quest_id` is permanent — retire by leaving the id unused. The client and `finalize-days` resolve the tier through the same `questTier()` with the same lifetime count; sleep reads through `scoringSleepMinutes` / `scoredSleepMinutes`, never raw `daily_sleep.minutes`. `calibrateQuestTier()` proposes a seed; `questTierChosen` wins outright.

**Surfaces and appearance (deviations #53, #54, #58, #72; 2026-09-11 passes).** A token names a role, never a hue; the ramps' step contract is ink strength (200 wash, 500 fill, 700/800 inks). A bright fill takes `colors.ink`, a deep fill `colors.onDeep`; `colors.text` on a bright fill vanishes at night. `colors.accent` is fill-only — `accentDeep` for body text, `accentInk` for display. A themed screen reads `useStyles(makeStyles)` with a **module-level** factory; the static `colors`/`ramp` are the light palette for tests. `src/ui/Text.tsx` is the only Text — it caps, never refuses. `src/theme.ts` is the only file that may name a typeface; fonts load through `useFonts`, never npm. No native module for a visual effect; `Glass` is not a blur; the corridor is not SVG. One icon family. `NAV_HEIGHT` 96, `BAR_HEIGHT` 68, no raised disc. `<Screen bleed>` hands the top inset back (`bleed-inset.test.ts`). Counted figures go through `countWords`. A group that means something is one accessibility element with hidden children. `SegmentedControl` is the only filter control; `Tile` has two sizes. `flightFrame` owns the Sky's chrome clearance; drift never changes steps or rank. The account-free preview (`docs/engineering/mobile-screen-preview.md`) never invokes production stores.

**Shipping (deviations #29, #42, #43).** JS ships over the air; only a native change spends one of the month's 15 builds — batch them. `runtimeVersion` is `{ policy: 'fingerprint' }`; `ios/` and `android/` stay Git-ignored or every local update targets a runtime no build has; every `eas.json` profile declares a `channel`; `fallbackToCacheTimeout` stays 0. **`package.json` is a fingerprint input** — do not "fix" the `eas:update:production` script; run the full non-interactive command by hand. Diagnose a missing update by comparing `npm run eas:fingerprint` to the last build's fingerprint, never the network first. React Native is built from source (`withReactNativeFromSource`) and the post-install hook fails the build if the prebuilt pod returns. The app icon is an Icon Composer bundle on `ios.icon`; validate with `actool`; `assets/icon.png` carries no alpha. `aps-environment` is declared `production` in config and never read back on TestFlight. Sign in with Apple's capability and client secret live outside git; `npm run apple-secret` prints the expiry. Build 26 (2026-09-15, fingerprint `6b14c5c2…`) paid the build deviation #72 owed and carried the 2026-09-12 dependency removals and issue #45; nothing native is owed as of that date.

**Two documents hold the decisions. Read them before proposing changes.** (`docs/engineering/` holds the extracted reasoning behind three of the blocks above; `docs/archive/` holds retired eras.)

- `docs/Kairo_Master_Summary.md` — the product spec (v1.4). Sections are cited throughout the code as `§5`, `§12`, etc. Comments referencing a `§` are pointing here. §5's and §6's stat tables are superseded by deviation #41 and marked as such in place; the section numbering does not move.
- `docs/roadmap.md` — build sequencing, phase status, and an **approved-deviations table**. Deviations from the spec are deliberate and recorded; propose changes against that table rather than "fixing" them.

`docs/user-journey.md` walks the end-to-end user flow (onboarding → daily loop → character → squad) grounded in what's actually built, not just spec'd. Update it whenever a flow changes.

**`docs/mvp-scope.md` is the IN/OUT contract.** Cite it in any QA brief, test plan or store-facing copy. It exists because the August 2026 QA pass graded Kairo against a v1.3-era brief and scored four sections 1/10 for features that were deliberately removed (sabotage) or deliberately deferred (gear, referrals, monetization) — burying the findings that mattered under findings about a product that no longer exists. If a brief describes something not listed there, the brief is stale.

`docs/qa/kairo-end-to-end-qa-report.md` is that pass, plus an addendum tracing its central finding to a stale Edge Function deployment. **Two of its claims do not survive checking** and are corrected in place: the body-metric "defaults" are placeholders on empty inputs (nothing invented can be saved), and the finalization scheduler was healthy throughout. Its dispositions are tabulated in `docs/roadmap.md` under "End-to-end QA findings".

## Tooling conventions

- **Use context7 for library/SDK docs.** Before writing or debugging code against a versioned dependency (Expo SDK, Supabase client, React Navigation, HealthKit wrappers, etc.), pull current docs via context7 rather than relying on training-data recall — APIs move and training data goes stale.
- **Use graphify to navigate the codebase.** Prefer it over ad-hoc grep/find for architecture questions, call graphs, and cross-file relationships (`graphify-out/` holds the indexed graph) — it's faster and keeps answers grounded in the real dependency structure.
- **Route UI/UX changes through the frontend-design skill.** Any new or modified screen/component under `app/` or `src/` gets a design pass through that skill before implementation, so it lands as intentional design rather than generic RN defaults — Kairo's character-first visual identity (§6) is easy to flatten otherwise.
- **Documentation updates are part of the change, not a follow-up.** A change to product behavior, architecture, or setup steps updates `README.md`, this file, and `docs/user-journey.md` (or whichever `docs/` file governs it) in the same pass.
- **A Notion mirror of this documentation exists** (design: `docs/superpowers/specs/2026-08-15-notion-documentation-design.md`), summarized and chunked, with mermaid diagrams and Tasks/Backlog + Decisions Log databases. It updates **on request, not automatically** — when asked to "update Notion" (or when a finished feature is doc-worthy and the user agrees), sync the relevant Notion pages and append a dated entry to the Changelog page. The repo docs stay authoritative; Notion links back to them rather than mirroring verbatim.

## Agent skills

### Issue tracker

GitHub Issues on `ArsherJ/kairo-social-health-accountability-app`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + root `docs/adr/`. See `docs/agents/domain.md`.

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
npm run prebuild         # regenerate ignored native projects from app.config.ts/plugins; never commit them

# shipping — OTA is free and unlimited; a build is one of 15 a month
npm run eas:update:production   # JS/assets to installed TestFlight builds.
                                #   Non-interactive shells need BOTH flags this
                                #   script does not carry — run the full command:
                                #   npx eas-cli update --channel production \
                                #     --environment production -m "..."
                                #   **Do not "fix" this by editing the script.**
                                #   `packageJson:scripts` is a fingerprint input,
                                #   so touching it moves runtimeVersion and
                                #   orphans every OTA from the installed build.
                                #   Verified 2026-08-29: that edit alone took the
                                #   fingerprint 324fba3e -> a8f47fe3.
npm run eas:build:ios:production # native changes only; spends quota. = eas build -p ios
                                 #   --profile ios-production --auto-submit (builds AND
                                 #   submits to App Store Connect / TestFlight in one shot)
npm run eas:build:ios:local     # same pipeline locally, no quota (needs fastlane)
npm run eas:fingerprint         # this tree's iOS runtime version

# which one? compare this tree's fingerprint to the last build's:
npm run eas:fingerprint                          # -> runtimeVersion of the working tree
npx eas-cli build:list --platform ios --limit 1  # -> "Fingerprint" of the last build
#   match    -> npm run eas:update:production  (free; applies on next app launch)
#   differ   -> npm run eas:build:ios:production  (native drift; an OTA update would
#               publish fine and silently never reach the device)

# build / submission status (read-only, no quota)
npx eas-cli build:list --platform ios --limit 5
npx eas-cli submit:list --platform ios --limit 3
# after Apple finishes processing (~5-10 min post-submit), first build needs the
# export-compliance prompt cleared once:
#   https://appstoreconnect.apple.com/apps/6800990955/testflight/ios

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

**The Supabase CLI cannot reach the Management API without being handed the
machine's own root certificates** (found 2026-09-08). Corporate Zscaler
intercepts TLS — `openssl s_client` against `api.supabase.com` returns a chain
issued by *Zscaler Intermediate Root CA* — and the CLI's Node HTTP client trusts
its bundled roots only, so **every** command fails with the same useless
`HttpClientError: Transport error`, `--debug` included. `curl` is unaffected
(macOS hands it the system keychain), which is why `remote-sql.sh` has always
worked while `supabase functions deploy` and `supabase secrets set` did not, and
why the failure reads like an outage rather than a trust problem. The fix is one
environment variable:

```bash
security find-certificate -a -p /Library/Keychains/System.keychain > /tmp/mac-roots.pem
NODE_EXTRA_CA_CERTS=/tmp/mac-roots.pem supabase functions deploy <name> --project-ref zniopywbwenrzxezolwv
```

Do **not** reach for `NODE_TLS_REJECT_UNAUTHORIZED=0`, which disables
verification for every host the process talks to rather than trusting one more
root. The same variable is what a `gh`, `npm` or `eas` failure of this shape
wants; `curl`-based scripts in `supabase/scripts/` need nothing.

**This machine also cannot pair an iPhone over USB, and the cause is not fixable from the phone.** It is corporate-managed — CrowdStrike Falcon runs as an Endpoint Security system extension (alongside Zscaler, Tanium and GlobalProtect), and its Device Control policy denies `usbmuxd` the iPhone's USB interface. The kernel signature is `IOUC AppleUSBHostInterfaceUserClient failed MACF in process pid …, usbmuxd`. Because no lockdown pairing record can be written, the phone re-prompts "Trust This Computer?" on *every* plug-in, `xcrun devicectl list devices` always says `No devices found`, and Developer Mode never appears in iOS Settings (it is gated on a completed pairing). **`npx expo run:ios --device` is therefore unavailable here** — physical-device builds go through **EAS Build → TestFlight**, which installs over the air and never touches USB. Four things were tested and are *not* the cause, so do not re-derive them: Developer Mode, a cached "Don't Trust", macOS accessory authorization, and the cable. Triage table in `README.md` under "Building onto a physical device".

## Architecture

### `packages/kairo-core` is the keystone

Pure, zero-dependency TypeScript: scoring, local-day math, Event evaluation and pooling, anti-cheat, progression, streaks. **No I/O, no clock reads, no randomness** — every function takes what it needs as an argument, which is why timezone and DST behaviour is testable without mocking.

Both consumers import the same files:
- Expo app → `@kairo/core` (tsconfig path + Metro `watchFolders`)
- Supabase Edge Functions → `supabase/functions/_shared/core.ts`, a relative re-export

This is what makes §12's server-authoritative rule affordable. Do not add a second implementation of scoring anywhere, and do not add dependencies to this package.

### Writes are server-authoritative

Clients have `SELECT` on their own rows and **zero write grants** on `health_buckets` or `daily_scores`. Edge Functions own every mutation:

- **`sync-health`** — the only door health data enters. Upserts hourly buckets, then re-reads the *whole* day before rescoring (a partial payload must not collapse the day's total).
- **`finalize-days`** — hourly `pg_cron`, the only place a day becomes `final`. Guarded by `CRON_SECRET`.

Scores are always *replayed* from stored buckets, never adjusted in place. That is what makes retries, Apple's retroactive step revisions, and cron overlap all safe. Preserve this property — Event progress is a read-time projection over `health_buckets` for the same reason, and stores no number of its own.

### Structural invariants worth not breaking

Full text in `docs/engineering/backend-invariants.md`. The tripwires:

- **Privacy is a projection, not a convention.** `profiles` is owner-readable only; squadmates reach data through `squad_leaderboard()`, which has no argument that returns raw steps or hourly movement. Heart rate and `workout_sessions` appear in no projection.
- **`delete_account()` takes no argument** — it erases `auth.uid()` only. `profiles_handle_deletion` is BEFORE DELETE, `profiles_collect_orphaned_goals` must stay AFTER, `goals.created_by` is SET NULL.
- **Account-scoped tables reference `auth.users`; character-scoped tables reference `profiles`.** `app_events` and `device_tokens` are the account's.
- **`profiles.total_xp` and the three stat rollups are recomputed by trigger, never incremented**, and the trigger's skip guard must name every column it reads.
- **Column-level grants:** revoke the table grant and re-grant the allowed columns; a column-level `REVOKE` against a table-level `GRANT` is a silent no-op.
- **A migration touching a table an Edge Function writes ships with that function's redeploy**, and `smoke-sync.mjs` runs after every deploy. `bucketRows` and `BUCKET_CONFLICT_TARGET` live in `sync-plan.ts` and `sync-health` reads both; `seed-health` is deliberately not converted.
- **Every request has a deadline** (`src/lib/fetch-timeout.ts`, racing rather than only aborting) and **TanStack's `onlineManager` uses NetInfo's documented recipe unmodified** — `Boolean(state.isConnected)`, never `isInternetReachable`.
- **`reject_mutation()` and `kairo.allow_purge` are inert** and left in place on purpose.
- **The HealthKit disclosure is derived** from `read-types.ts`; `NSHealthShareUsageDescription` is updated by hand.
- **Telemetry decisions live in zero-import modules.** `telemetry-payloads.test.ts` is the one allowlist scan for every emitting surface — category-only payloads, no health figure, no occurrence id, no Motion location, no step median. Six lifetimes: per local day (`daily-marker.ts`), per tap, per occurrence, per beat mount, once ever on an MMKV milestone, and the welcome run's `welcome_seen`.

### Per-user local days

Every player's day runs midnight-to-midnight in **their own** timezone (§2), so a squad spans multiple calendar dates at any instant. Health buckets, scores, and Event windows are keyed by local date. `finalizable_days()` in SQL and `isFinalizable()` in `kairo-core` implement the same ~2h grace window and are kept honest by a differential test.

## Conventions

- **`*.deno.ts`** marks a shared module that imports Deno-only specifiers (`npm:`, Deno globals). These are excluded from `tsc` and checked by `deno check` instead. Everything else under `supabase/functions/_shared/` stays pure so vitest can exercise it.
- **Edge Function handlers stay thin.** Every decision lives in a `*-plan.ts` module tested in plain Node; `index.ts` only authenticates, reads, plans, writes. This is deliberate — Docker is unavailable, so anything untestable in Node is effectively untested.
- **`*.deno.test.ts`** is the narrow exception: a Node test that drives a `*.deno.ts` module directly, against a fake PostgREST client. It works only where every `npm:` import on the path is `import type` and vanishes at transform time, so adding a value import from `npm:` breaks it loudly — which is the point. Reach for it only when the behaviour genuinely lives in a query or a call rather than in a pure function (whether an enumeration filters on `status`, say). It is excluded from `tsc` for the same reason its subject is, and `deno check` only follows `index.ts`, so **nothing typechecks it**; that is the price.
- Imports use explicit `.ts` extensions, which Deno requires and Vite/Metro both accept.

## Testing

Strict TDD on scoring, day boundaries, Events, streaks and anti-cheat — the logic where a bug corrupts real leaderboards. UI is verified by hand on device.

**A module tested by root Vitest may not value-import through the `@/` alias.**
`vitest.config.ts` defines no alias, so a value import through it is a load
failure — `import type` is erased and is fine. Reach sideways by relative path,
exactly as `kairo-voice.ts` reaches `stat-names.ts` and `living-mirror.ts` and
`today-details.ts` reach `theme.ts` and `quest-copy.ts`. The include pattern is
`src/**/*.test.ts` and not `.tsx`, which is the other half of the same rule:
nothing under test may pull in React Native's Flow syntax.

**Engine-key guards are case-sensitive and word-bounded** — `/\b(AGI|STR|MND)\b/`.
A loose `/str/i` matches "Verified strength session", which is copy a test
elsewhere *requires*, and a loose `/agi/i` matches "Dagit", a perfectly good name
for a Philippine eagle. A guard that fails on real input gets loosened until it
guards nothing.

`supabase/tests/harness.ts` applies every migration to **PGlite** (real Postgres in WASM) with stubbed `auth` and `realtime` schemas, then asserts behaviour under the non-owner `authenticated` role. Runs in ~1.5s with no Docker.

**Its limits, so nothing over-trusts it:** it does not prove Supabase's Realtime server delivers broadcasts, nor that the hosted `auth` schema matches. `UNSUPPORTED_MIGRATIONS` in that file lists migrations it cannot apply, each with a reason — keep that list as short as possible, since every entry is schema no test covers. Verify those against the live project instead.

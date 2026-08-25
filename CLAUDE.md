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

**Kairo scores three stats as of 2026-08-20** (deviation #41). `CoreStat` is
`'AGI' | 'STR' | 'MND'`: steps, active calories, sleep. END folded into STR and
VIT into AGI as **threshold shifts** — never point multipliers, because a
stored multiplier stacks with the squad program's read-time weight and that is
deviation #10's trap — and sleep was promoted from the REC bonus to a full
stat. A day's stat points scale by `3 / earnable stats`, so both ceilings are
4,400 and a wearable buys a third route to the same ceiling rather than a
higher one. Three things break easily:

- **The Daily Walk reads `tiers->>'AGI_base'`, never `tiers->>'AGI'`.** The
  spread shift lowers AGI's whole ladder, Gold included, and `tiers` stores the
  **shifted** tier — so Gold arrives at 7,500 steps on an eight-active-hour day
  and the baseline scales with the user, which is exactly what it must never
  do. `sync-plan.ts` writes both keys; `goal_window_scores()` and the 90-day
  streak in `train/queries.ts` read `AGI_base` and fall back to `AGI` for rows
  written before the switch, for which the two agree. **A guard written through
  `tierFor` cannot catch this**, and one was: `tierFor` *is*
  `shiftedTierFor(stat, raw, 0)`, the single path where the shift is absent by
  definition, so `scoring.test.ts`'s 10,000 literal passed throughout. Assert
  through `computeDailyScore` — that is the only place the two ladders can
  disagree.
- **`planDay` requires `earnableStats` and `verifiedWorkoutMinutes`, and
  neither is defaulted.** `DailyScoreInput` defaults both, which is right for a
  pure function whose callers include tests. `planDay` has exactly two callers
  and **both are write paths**, so a default there is the silent failure the
  fields exist to prevent: every stored row scoring at factor 1.0 with nothing
  anywhere to notice. `scoring-inputs.ts` derives them, against **the date being
  scored** and never wall-clock today — identical on a live sync, wrong on a
  replay, and the difference is a 6,200-point day against a 4,400 ceiling that
  `contributing_stats` still passes.
- **The board re-sums the per-stat columns; it does not read `total`.** That is
  the only way `squad_leaderboard()` can apply the program weights at read time
  (deviation #11), and it means a stat is competitively invisible until it is
  added to `program_weighted_total` **and** `squad_leaderboard` **and**
  `weightedBoardTotal` in `@kairo/core`. MND shipped missing from all three for
  a day: 1,200 stored points the ranking number could not see, on every
  program. Changing that function's signature is a **drop by exact argument
  list**, never `create or replace` — the `create_goal` / `p_metric` trap, and a
  surviving overload fails nothing until a call site resolves to it.

**Solo mode gained a floor and a curve on 2026-08-15** (deviations #31–#33).
Three things that are easy to break by accident:

- **`DAILY_STEP_BASELINE` is derived from `THRESHOLDS.AGI.gold`, never written
  as a literal** — and `scoring.test.ts` *also* pins it at 10,000. Both halves
  matter and they guard opposite failures. The derivation stops a raised Gold
  leaving a second number describing the old one; it is what lets the walk
  streak read a tier out of `daily_scores`, which stores tiers and never raw
  steps — **`tiers->>'AGI_base'`, not `tiers->>'AGI'`**, since the three-stat
  switch, for the reason in the block above. The literal in the test stops the
  derivation being *too*
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

**Goals gained a second metric on 2026-08-17, and invites gained a link**
(deviations #35–#36). Six things that are easy to get wrong:

- **`goals.metric` was widened, not added.** It already existed as
  `check (metric = 'daily_score')`, documented as widenable — and the existing
  value is `'daily_score'`, the *value* name, not `'points'`. Match the
  database.
- **`create_goal` had to learn `p_metric`, or the widened check is
  unreachable.** `authenticated` holds only SELECT and UPDATE(title,
  description) on `goals`, so that function is the only way a row is ever
  written. Adding a defaulted parameter to a function that already has defaults
  is an *ambiguous overload* PostgREST cannot resolve — drop and recreate, as
  `p_description` already did. The same trap waits for the next parameter.
- **`walk_cleared` comes from `daily_scores.tiers`, never `health_buckets`.**
  The tier is already projected to squadmates by `squad_leaderboard()`; the
  buckets are not, and both produce an identical screen. A schema test pins the
  RPC's exact row shape for that reason.
- **A `daily_walk` consistency goal stores `target: 1` as a sentinel**, because
  the column requires a positive value and the bar is a boolean. Two places
  keep it off screens: `contribution()` checks `metric` **before** `kind` (the
  other order reads the sentinel as a points bar and counts every scoring day),
  and `windowLine()` drops its "· N a day" clause for the metric. And
  `finalize-days` **must select `metric`** — it has its own `GoalRow` and
  `toGoal`, so a walk goal graded without it latches off any day that scored,
  pays XP and pushes a notification saying so. A wrong card re-renders; a latch
  is permanent.
- **`stillPossible` keys off whether a day's contribution is capped, not off
  `kind`.** A points day has no ceiling, so a cumulative points goal lives while
  any day is unresolved. A *walk* day is worth at most 1 whichever kind it is,
  so a cumulative walk goal can die before its window closes. A test pins that
  points goals are unaffected — do not collapse the two branches back.
- **The universal-links chain has three sources and every failure is silent:**
  `ios.associatedDomains` in `app.config.ts`, the extensionless AASA file's
  `Content-Type` (`web/vercel.json`), and the **Associated Domains capability on
  the App ID** in Apple's portal. EAS CNG generates the native entitlement from
  config; never hand-edit the ignored `ios/` project. Same failure class as
  `aps-environment`. The domain is a one-way door —
  `INVITE_HOST` is one constant that both `app.config.ts` and
  `invite-message.ts` read, and changing it breaks every link already shared.
  Runbook: `web/README.md`.

**A new account does not see the whole app, as of 2026-08-17** (deviations
#37–#39). `disclosureStage()` in `@kairo/core` returns `core` below
`DISCLOSURE_THRESHOLD_DAYS` and `full` at or above it; `TrainEntry`, `GoalCard`,
`StatRail` and the Strain/Sleep rows are hidden in `core`. Nothing is deleted —
every gated surface stays built and reachable, which is what makes this cheap to
reverse. Four things break easily:

- **The threshold is pinned by a test and gates on *lifetime* scored days**,
  never a recent window — a recent-activity gate would demote someone returning
  from a quiet week back into the reduced app, and that user is exactly who the
  retention measurement is about. `useScoredDayCount` filters `total > 0` for a
  related reason: `sync-health` writes a `daily_scores` row per date in the
  payload whether or not it scored and `resolveSyncWindow` always sends today
  *and* yesterday, so a bare row count reads 2 on install and would open the
  gate on day 1 for someone who has done nothing.
- **Hiding an entry point is not closing a door.** `/train`, `/goal/new` and
  `SquadGoalPanel` check the stage themselves, because push routing and deep
  links reach all three regardless of the home screen. **The two routes gate on
  `resolved && stage === 'core'`, not on the stage alone** — the stage reads
  `core` while the count is in flight, which is correct for hiding a card and
  wrong for a redirect: a Challenge push that cold-launches into `/train` has no
  cached count, and bouncing a `full` user home on that frame reads exactly like
  the feature being removed. Hide on `stage`, navigate on `resolved && stage`.
- **Onboarding is `/connect` → `/character` → `/name`**, and the profile row
  still commits exactly once, on the last screen. Add steps *before* the name,
  never after — that is still deviation #22's deleted flag. `/connect` reads
  HealthKit **locally** via `readStepsToday` against the *device* zone, because
  no profile row and therefore no `profiles.timezone` exists yet; that is the
  whole reason the reveal can work that early.
- **`syncStatus`'s `'no-data'` never shadows `'failed'`** (the 9–11 Aug outage
  class) or `'stale'`, and it waits `QUIET_GRACE_MS` from `SyncState.firstSyncedAt`
  — stamped once, never overwritten. Without the window it accuses someone who
  connected at 8am with 200 steps, which is the same false accusation the state
  exists to remove. HealthKit does not report read-permission denial, so the app
  can only ever say nothing has arrived, never that the user declined. Two
  things keep it honest and both were found in review: `useHealthSync` **must
  invalidate `scoredDayCountKey`** (nothing else refetches it, and a stale count
  lets the accusation through the back door), and `everReceivedData` is **not**
  the scored-day count alone — Bronze AGI is 1,000 steps, so a 400-step day is
  real data that scored nothing, and today's buckets are OR'd in.
- **The permission sheet is bounded, scrolls, and wraps its content in a View
  with an explicit point width.** All three are load-bearing and were found the
  hard way on 2026-08-17. `Panel` sets `overflow: 'hidden'`, so an oversized
  sheet never visibly spilled — it was silently clipped *inside* the card, and
  at XXXL the Health ask lost its "Not now", the one control that lets someone
  decline. Three separate faults: no height bound (fixed with `maxHeight` plus
  a `ScrollView` that is `flexGrow: 0, flexShrink: 1`, so the card still hugs
  short content instead of always taking the cap); no width bound on **direct
  `Text` children of a scroll container**, which laid out wider than the card
  and clipped mid-word — a `View` with a computed point width fixes it and
  `width: '100%'` does not, because the percentage resolves against a
  ScrollView whose own size depends on measuring that content; and a two-column
  row that cannot fit past ~1.3x, which now stacks.
  **Two testing notes.** This class of bug is invisible at every normal text
  size — `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`
  is how it was found. And **relaunch the app after changing content size**:
  RN caches text measurements, so a size change on a running app renders correct
  text inside stale boxes and looks exactly like a layout regression.
- **Connecting Apple Health is `connect-health.ts`, never inlined.** It is five
  steps — request, `configureHealthBackgroundDelivery`,
  `notifyHealthPermissionGranted`, read the state back, track — and `/connect`
  and `HealthAsk` both call it. It exists because the sequence was paraphrased
  into `/connect` and three steps vanished with no error and no log: the worst
  was background delivery, since after a grant `readHealthPermissionState()`
  returns `'asked'` and `nextPermissionAsk` never offers the sheet again, so
  nothing would ever have registered it for the whole new-user cohort.

**"Hunter" and "barkada" were retired on 2026-08-11** (roadmap deviation #26). The
character has no noun — it is "your character", and the centre tab is `Character`;
a squad is a **squad**. The spec says "Hunter" throughout (§6, §15, §20) and so do
the dated docs under `docs/superpowers/`; both are historical records, not intent.
Two things deliberately still say it and are *not* stale: `profiles.class`'s
`'hunter'` default (inert internal enum, no surface renders it) and the
`output/imagegen/hunter-*.png` render sources. **§20's "dark fantasy hunter
aesthetic" brief and the art-direction prompts in
`scripts/generate_swap_assets*.py` used to be listed here as a genuinely open
decision; deviation #40 settles it** — the direction is flat vector, bold
outlines, colourful, and the subject is an animal. Those prompts are now stale
like anything else. Anywhere else, it is stale — fix it.

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
single `Pressable` already speaking every rating on the rail, and it was reverted.

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

**The character is an animal as of 2026-08-18** (roadmap deviation #40, which
supersedes #27). Four Philippine endemic species — `'pilandok' | 'tamaraw' |
'carabao' | 'eagle'` — live in `src/features/character/species.ts`, a
zero-import registry that is the single source for ids, names, hues,
affinities and blurbs. **`affinity` is flavour and nothing in `@kairo/core`
imports that file**: a species never touches scoring, and adding a mechanical
bonus later would rescore history, because `daily_scores` is replayed from
stored buckets. Five things break easily:

- **`profiles.species` is a new nullable column; `profiles.character_body` is
  dead**, never written and read by no surface — the same disposition as
  `profiles.sex`. Its TypeScript parser was deleted (a parser for a value no
  screen can produce documents nothing); the column comment and its schema test
  are what record the disposition.
- **One `SpeciesPicker`, mounted by two routes, because `redirectTarget` cuts
  both ways** — a `ready` user inside `(onboard)` is bounced to `/`, and a
  `needs-profile` user outside it is bounced to `/connect`, so no single route
  can serve both. `app/(onboard)/character.tsx` is the onboarding mount and
  writes nothing; the groupless `app/species.tsx` serves everyone past it and
  writes directly under the column-scoped UPDATE grant. Groupless is what the
  `ready` denylist permits, the same as `/goal/new`.
- **Onboarding is still `/connect` → `/character` → `/name`, and the profile
  row still commits exactly once**, on the name screen — unchanged by #40 and
  still load-bearing. Deviation #22 deleted the `finishingOnboarding` flag when
  onboarding collapsed to one step; asking anything *after* the INSERT flips
  `resolveRoute` to `'ready'` under the unfinished screen and needs that flag
  back. Add onboarding steps *before* the name, never after.
- **`SpeciesPicker` is vertical, scrolls, and its text sits in a `View` with a
  computed point width.** All three are the permission sheet's 2026-08-17
  lessons in a new place, and the width arithmetic has been wrong twice: it
  subtracts the screen padding, the card's `borderWidth` (Yoga lays out
  border-box), *three* `space.md` widths — two paddings plus the row `gap` —
  and `ART_WIDTH`. `CARD_BORDER` and `ART_WIDTH` are constants precisely so the
  stylesheet and that sum cannot drift.
- **The home screen prompts for a species once per launch, gated on
  `profile.isSuccess`.** `profile.data?.species` reads `undefined` while the
  query is in flight, which is indistinguishable from null — deviation #37's
  fourth lesson again. The flag is module scope, not MMKV: a permanent
  dismissal would strand the pre-#40 cohort on the fallback figure with no
  prompt to fix it.

**Two documents hold the decisions. Read them before proposing changes.**

- `docs/Kairo_Master_Summary.md` — the product spec (v1.4). Sections are cited throughout the code as `§5`, `§12`, etc. Comments referencing a `§` are pointing here. §5's and §6's stat tables are superseded by deviation #41 and marked as such in place; the section numbering does not move.
- `docs/roadmap.md` — build sequencing, phase status, and an **approved-deviations table**. Deviations from the spec are deliberate and recorded; propose changes against that table rather than "fixing" them.

`docs/user-journey.md` walks the end-to-end user flow (onboarding → daily loop → character → squad → goals) grounded in what's actually built, not just spec'd. Update it whenever a flow changes.

**`docs/mvp-scope.md` is the IN/OUT contract.** Cite it in any QA brief, test plan or store-facing copy. It exists because the August 2026 QA pass graded Kairo against a v1.3-era brief and scored four sections 1/10 for features that were deliberately removed (sabotage) or deliberately deferred (gear, referrals, monetization) — burying the findings that mattered under findings about a product that no longer exists. If a brief describes something not listed there, the brief is stale.

`docs/qa/kairo-end-to-end-qa-report.md` is that pass, plus an addendum tracing its central finding to a stale Edge Function deployment. **Two of its claims do not survive checking** and are corrected in place: the body-metric "defaults" are placeholders on empty inputs (nothing invented can be saved), and the finalization scheduler was healthy throughout. Its dispositions are tabulated in `docs/roadmap.md` under "End-to-end QA findings".

## Tooling conventions

- **Use context7 for library/SDK docs.** Before writing or debugging code against a versioned dependency (Expo SDK, Supabase client, React Navigation, HealthKit wrappers, etc.), pull current docs via context7 rather than relying on training-data recall — APIs move and training data goes stale.
- **Use graphify to navigate the codebase.** Prefer it over ad-hoc grep/find for architecture questions, call graphs, and cross-file relationships (`graphify-out/` holds the indexed graph) — it's faster and keeps answers grounded in the real dependency structure.
- **Route UI/UX changes through the frontend-design skill.** Any new or modified screen/component under `app/` or `src/` gets a design pass through that skill before implementation, so it lands as intentional design rather than generic RN defaults — Kairo's character-first visual identity (§6) is easy to flatten otherwise.
- **Documentation updates are part of the change, not a follow-up.** A change to product behavior, architecture, or setup steps updates `README.md`, this file, and `docs/user-journey.md` (or whichever `docs/` file governs it) in the same pass.
- **A Notion mirror of this documentation exists** (design: `docs/superpowers/specs/2026-08-15-notion-documentation-design.md`), summarized and chunked, with mermaid diagrams and Tasks/Backlog + Decisions Log databases. It updates **on request, not automatically** — when asked to "update Notion" (or when a finished feature is doc-worthy and the user agrees), sync the relevant Notion pages and append a dated entry to the Changelog page. The repo docs stay authoritative; Notion links back to them rather than mirroring verbatim.

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
npm run eas:update:production   # JS/assets to installed TestFlight builds
npm run eas:build:ios:production # native changes only; spends quota
npm run eas:build:ios:local     # same pipeline locally, no quota (needs fastlane)
npm run eas:fingerprint         # this tree's iOS runtime version

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

**This machine also cannot pair an iPhone over USB, and the cause is not fixable from the phone.** It is corporate-managed — CrowdStrike Falcon runs as an Endpoint Security system extension (alongside Zscaler, Tanium and GlobalProtect), and its Device Control policy denies `usbmuxd` the iPhone's USB interface. The kernel signature is `IOUC AppleUSBHostInterfaceUserClient failed MACF in process pid …, usbmuxd`. Because no lockdown pairing record can be written, the phone re-prompts "Trust This Computer?" on *every* plug-in, `xcrun devicectl list devices` always says `No devices found`, and Developer Mode never appears in iOS Settings (it is gated on a completed pairing). **`npx expo run:ios --device` is therefore unavailable here** — physical-device builds go through **EAS Build → TestFlight**, which installs over the air and never touches USB. Four things were tested and are *not* the cause, so do not re-derive them: Developer Mode, a cached "Don't Trust", macOS accessory authorization, and the cable. Triage table in `README.md` under "Building onto a physical device".

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
- **`profiles.total_xp` is a rollup**, recomputed as `sum(daily_scores.xp_awarded)` (plus `goal_completions.xp_awarded`) by trigger — never incremented, so nothing double-counts. The same function maintains `agi_total`/`str_total`/`mnd_total`, which feed the ability ratings (three since deviation #41 — `end_total` and `vit_total` are dropped, and the skip guard described next had to shed them in the very migration that dropped the columns, or it names a column that no longer exists and fails on the next write). Its trigger skips the recompute only when *every* column it reads is unchanged: a same-tier rescore (5,200 → 8,000 steps, both Silver) moves the raw points and not the XP, and a narrower skip loses it silently.
- **Strain is display-only.** `computeStrain()` runs on the client over `health_buckets.avg_heart_rate` and `daily_heart`. It never touches `daily_scores`, so score replay is unaffected. Heart rate is owner-readable only and absent from every projection — it is at least as revealing as the hourly movement §5 protects.
- **Column-level grants:** `profiles` UPDATE is granted per-column. A column-level `REVOKE` against an existing table-level `GRANT` is silently a no-op in Postgres; revoke the table grant and re-grant the allowed columns.
- **A migration touching a table an Edge Function writes ships with that function's redeploy.** Applying one without the other took scoring down for two days in August 2026: `remove_sabotage` dropped `daily_scores.sabotage_delta`, the deployed `sync-health` kept sending it, and because its bucket upsert commits *before* the score upsert, health data kept landing while nothing scored. Every test passed the whole time — they check the source, not the deployed artifact. Two guards now exist and both matter: the schema suite inserts `planDay`'s **real output** into `daily_scores` (so drift fails at commit time), and `supabase/scripts/smoke-sync.mjs` runs a real sync against the deployed function (so drift fails at deploy time). Run the latter after every deploy. Full post-mortem in `docs/qa/kairo-end-to-end-qa-report.md`.
- **Sign in with Apple has two halves the repo cannot see.** The app side landed 2026-08-12 (`appleProvider` in `src/features/auth/providers.ts`, `usesAppleSignIn` in `app.config.ts`, Apple's branded button on `app/(auth)/sign-in.tsx` — required by their HIG, so do not swap it for Kairo's `Button`). The other two halves live outside git and fail silently: the **Sign in with Apple capability on the App ID**, whose absence is indistinguishable from a device not signed into an Apple ID, and the **client secret**, an ES256 JWT that Apple caps at ~182 days and that takes sign-in down for every user at once when it lapses. `npm run apple-secret` mints and installs it and prints the expiry — diary that date. The nonce is load-bearing: `signInAsync` gets the SHA-256 hash, `signInWithIdToken` gets the raw value, and sending the hash to both makes gotrue hash a hash. Runbook in `docs/sign-in-with-apple.md`. `external_anonymous_users_enabled` stays `true` on the project on purpose — the `__DEV__` guard in `availableProviders()`, not the project setting, is what keeps anonymous out of TestFlight.
- **Every request has a deadline, because a hung request is worse than a failed one.** `supabase-js` sets no timeout and neither does `fetch`, so a **black-holed** host — DNS resolves, the TCP connection never completes — yields a promise that never settles. On 2026-08-14 a WiFi network began blocking `*.supabase.co` that way and the app sat on the KAIRO hold overlay permanently, surviving relaunches *and* a reinstall from TestFlight: `resolveRoute` reports a query with no data as `'loading'`, so the `'profile-error'` cover with its "Try again" button was already built and unreachable, because nothing ever errored. `src/lib/fetch-timeout.ts` is wired into `createClient`'s `global.fetch`. It **races** a deadline against the request rather than only aborting, since aborting merely asks the transport to reject and this exists for the case where the network layer is misbehaving; the abort still fires, to free the socket. Diagnostic worth reusing: `curl -w 'connect=%{time_connect}s'` showing DNS resolved but `connect=0.000000s` is a block, not an outage — and check the Management API separately, since `api.supabase.com` is a different host and stays up while the project's own subdomain is unreachable.
- **TanStack Query does not know what offline means on a phone unless told.** Its default online detection is the browser's `online`/`offline` events, which React Native does not have — so without wiring it believes it is permanently online, and a query fired with no signal spends `retry: 2` immediately and lands in an error state instead of pausing. `src/lib/query-client.ts` wires `onlineManager` to NetInfo using **TanStack's documented recipe unmodified** — `Boolean(state.isConnected)`. It briefly read `isInternetReachable` instead, on the reasoning that a captive-portal wifi is "connected" and cannot reach Supabase. True, but the wrong trade: that field is NetInfo's own probe against an unrelated third-party endpoint, so a network blocking *the probe* while Supabase works reports offline forever, and paused queries never error — the same endless spinner as above. Prefer the false positive that fails loudly over the false negative that hangs; `fetch-timeout.ts` covers the captive-portal case. Do not "improve" on the documented recipe here again.
- **Push has a client half that was missing until 2026-08-14, and a credential the repo cannot see.** The server had been sending a deep-link payload — `{trigger, localDate, screen}` from `dispatch-notifications`, plus `goalId` from `finalize-days` — since the notification engine shipped, and **nothing read it**: no `setNotificationHandler` (so a foreground push displayed nothing at all, which reads exactly like push being broken) and no response listener (so a tap went nowhere). `src/features/notifications/routing.ts` is the fix and follows the house split — `notificationTarget()` decides and is tested in Node, `useNotificationRouting()` performs. Three things there are load-bearing: `screen: 'character'` maps to **`/`**, not `/character`, which is the *onboarding* body picker; the hook is mounted in `app/(tabs)/_layout.tsx` because that layout only exists for a `'ready'` user, so mounting **is** the gate; and both `useLastNotificationResponse()` and the response listener are wired, because a tap that launches the app from terminated is retained by the former and never emitted to the latter. The credential is the **APNs key uploaded to Expo** (`eas credentials`) — same failure shape as the Apple client secret, invisible in git, and a send without it returns a ticket error rather than doing nothing.
- **`aps-environment` is generated from Expo config.** Expo's notifications plugin defaults it to `development` (the APNs sandbox), so `app.config.ts` declares `['expo-notifications', { mode: 'production' }]` explicitly and EAS CNG carries that into the distribution entitlement. Never patch the ignored generated entitlements. Do not treat the declaration as proof push works: Expo's service relays to both environments. **And do not try to read the value back on TestFlight** — `expo-application` parses `embedded.mobileprovision`, App Store distribution strips that file from the bundle, and the answer is `null` there structurally (the library's own `appReleaseType` has an explicit branch for the file's absence). A diagnostic built on it shipped on 2026-08-14 and told a healthy TestFlight device it was a simulator. What `NotificationSettingsCard` reports instead is **registration**, which is knowable everywhere and the stronger signal anyway: `getExpoPushTokenAsync` fails with *"no valid aps-environment entitlement string found"* when the entitlement is wrong, so a token that exists is evidence the entitlement is right. Simulator is decided by the release type, never by a null environment. The line ships in **Release** on purpose — `__DEV__` would hide it from TestFlight.
- **The app icon is an Icon Composer bundle, and nothing in JS validates it.** `assets/Kairo.icon/` holds a *transparent* terracotta symbol plus an `icon.json` declaring the cream ground as `fill`; iOS renders the light, dark and tinted appearances from that one layered source, which is what a flat PNG cannot do. Four things break it silently. **It must sit on `ios.icon` as a plain string** — `@expo/prebuild-config` warns and falls back if a `.icon` path is given to the *root* `icon` field or to the light/dark/tinted object form, so the root `icon` stays a PNG serving Android, web and pre-iOS-26. **Expo copies the directory verbatim** into `ios/<App>/Kairo.icon` and sets `ASSETCATALOG_COMPILER_APPICON_NAME`; the schema is Apple's and is only ever checked by `actool` at Xcode/EAS build time, so a malformed edit passes `prebuild` and every local check and fails in CI — the `aps-environment` failure shape again. Validate locally instead of guessing, with `mkdir -p /tmp/out && xcrun actool --compile /tmp/out --platform iphoneos --minimum-deployment-target 26.0 --target-device iphone --app-icon Kairo --output-partial-info-plist /tmp/out/p.plist assets/Kairo.icon` (the `mkdir` is load-bearing — `actool` errors rather than creating the output directory), which exits non-zero on a bad schema and otherwise writes the real rendered PNGs — the only way to *see* the glass treatment without a device. **`fill` colours are `<colour-space>:r,g,b,a` floats, not hex** (`extended-srgb:0.96078,0.91765,0.84706,1.00000` is `colors.bg`). And **the basename is the icon name**, so renaming the directory renames the build setting. **Editing the artwork without editing `app.config.ts` leaves the native copy stale and silent** — `npm run ios` does not re-sync `ios/Kairo/Kairo.icon`, because the config *value* is unchanged and only the bytes it points at moved, so the build succeeds against the previous icon (hit on 2026-08-25: the simulator kept rendering the ink mark after the terracotta one was installed). After changing icon artwork run `npx expo prebuild -p ios --no-install`, then `xcrun simctl uninstall` before reinstalling, since SpringBoard caches icons across reinstalls — and diff the native copy rather than trusting the build. **The Dark appearance is auto-derived, which constrains the symbol colour** — with one layer declared, iOS darkens the cream ground and keeps the symbol unchanged, so the symbol has to work on both. That is why it is terracotta (`colors.accent`) and not the far higher-contrast ink (`colors.text`): ink measured 13.95:1 on cream but **1.00:1** on the darkened ground, invisible, confirmed on the simulator 2026-08-25; terracotta reads 3.03:1 and 4.60:1, and Dark was then checked by hand and reads correctly. Darkening the symbol for a punchier Default silently destroys the Dark appearance. The override mechanism is the `*-specializations` family (`fill-specializations`, `image-name-specializations`, `glass-specializations`, …) keyed by `light-color` / `dark-color` / `dark-tint` / `dark-clear`, but **do not hand-write it from that vocabulary**: an invented nesting is a silent no-op, proven by pointing a specialization at a nonexistent file and still getting exit 0, where the same trick on the *primary* `image-name` fails the build. Author it in Apple's Icon Composer, which writes canonical JSON, or pick a mid-tone symbol that survives both grounds. And note `actool` is **nondeterministic** — identical input yields different `Assets.car` digests — so diffing the compiled output cannot tell you whether an edit landed. The fallback `assets/icon.png` has its own trap: it carries **no alpha channel** (PNG colour type 2), because Apple rejects an App Store icon that has one even when every pixel is opaque (ITMS-90717, raised at upload rather than at build) — most re-exports silently add it back, so check with `sips -g hasAlpha`.
- **The HealthKit disclosure is derived, not written.** `src/features/health/read-types.ts` is the single list of requested types; `disclosure.ts` maps each to user-facing copy, and `disclosure.test.ts` fails if either side names something the other does not. That list lives apart from `permission.ts` because anything importing `@kingstinct/react-native-healthkit` drags in React Native's Flow syntax that root Vitest cannot parse — the same constraint `sync-state.ts` records. The `NSHealthShareUsageDescription` string in `app.config.ts` covers the same types and is the one half no test can lock; update it by hand when the list changes.
- **Telemetry's decisions live in zero-import modules, for the same parse-failure reason as the HealthKit disclosure.** `src/features/telemetry/buffer.ts` (the pre-sign-in event queue) and `milestones.ts` (the once-ever rule) import nothing, so root Vitest — no `@/` alias, no MMKV — can load and test them directly; the MMKV-backed store and the Supabase write sit in separate files that pull those dependencies in. `first_sync_seen` and `first_score_seen` are gated on an MMKV once-ever marker in `milestone-store.ts`, claimed before the write and released via `markUnreached` if it fails — **not** the per-session marker `useAppOpenTelemetry` (`src/features/notifications/useNotifications.ts`) uses, which fires every relaunch on purpose and would silently overcount activation if reused here. `public.kairo_retention()` is admin analytics with EXECUTE revoked from `public`, `anon` and `authenticated` — it is run through `remote-sql.sh` against the live project, never from a client. Runbook: `docs/beta-measurement.md`.

### Per-user local days

Every player's day runs midnight-to-midnight in **their own** timezone (§2), so a squad spans multiple calendar dates at any instant. Health buckets, scores, and goal windows are keyed by local date. `finalizable_days()` in SQL and `isFinalizable()` in `kairo-core` implement the same ~2h grace window and are kept honest by a differential test.

## Conventions

- **`*.deno.ts`** marks a shared module that imports Deno-only specifiers (`npm:`, Deno globals). These are excluded from `tsc` and checked by `deno check` instead. Everything else under `supabase/functions/_shared/` stays pure so vitest can exercise it.
- **Edge Function handlers stay thin.** Every decision lives in a `*-plan.ts` module tested in plain Node; `index.ts` only authenticates, reads, plans, writes. This is deliberate — Docker is unavailable, so anything untestable in Node is effectively untested.
- **`*.deno.test.ts`** is the narrow exception: a Node test that drives a `*.deno.ts` module directly, against a fake PostgREST client. It works only where every `npm:` import on the path is `import type` and vanishes at transform time, so adding a value import from `npm:` breaks it loudly — which is the point. Reach for it only when the behaviour genuinely lives in a query or a call rather than in a pure function (whether an enumeration filters on `status`, say). It is excluded from `tsc` for the same reason its subject is, and `deno check` only follows `index.ts`, so **nothing typechecks it**; that is the price.
- Imports use explicit `.ts` extensions, which Deno requires and Vite/Metro both accept.

## Testing

Strict TDD on scoring, day boundaries, goals, streaks and anti-cheat — the logic where a bug corrupts real leaderboards. UI is verified by hand on device.

`supabase/tests/harness.ts` applies every migration to **PGlite** (real Postgres in WASM) with stubbed `auth` and `realtime` schemas, then asserts behaviour under the non-owner `authenticated` role. Runs in ~1.5s with no Docker.

**Its limits, so nothing over-trusts it:** it does not prove Supabase's Realtime server delivers broadcasts, nor that the hosted `auth` schema matches. `UNSUPPORTED_MIGRATIONS` in that file lists migrations it cannot apply, each with a reason — keep that list as short as possible, since every entry is schema no test covers. Verify those against the live project instead.

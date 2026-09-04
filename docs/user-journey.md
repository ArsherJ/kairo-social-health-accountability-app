# User Journey

What a player actually walks through, end to end. Grounded in the current implementation (`app/`, `src/`) and cross-referenced to the spec (`Kairo_Master_Summary.md`, cited as `§n`) and `docs/roadmap.md` for what's shipped vs. still planned.

**Keep this current.** A change to onboarding, the daily loop, the character screen, squads, or battles updates this file in the same pass — see `CLAUDE.md` → Tooling conventions.

---

## 1. Sign-in

`app/(auth)/sign-in.tsx` — the only gate before the app is usable. No paywall, no forced squad.

**The pitch comes before the ask** (2026-08-17). This screen used to say `KAIRO` and *"Every day is a Kairo moment."* and then request an Apple ID — which told a first-time user nothing about what they were signing into. It now carries, in order: the loop in one sentence, the loop again as three lines in the order it happens (*your phone already counts your steps → your character levels from them → your squad sees where you stand today*), who it is for (small groups who already know each other, **wherever they are** — the wedge a public fitness feed does not fit), and the privacy promise: *your squad sees your progress, never your Health data*. That last line is the strongest thing about the product and was previously visible only **after** signing in.

The hero scrolls. It is the only all-prose screen in the app, and at the largest accessibility text sizes five stacked blocks are taller than any iPhone. The three bullets' dots are **sage**, not terracotta: `theme.ts` reserves terracotta for the primary action, and the only action here is Apple's button.

Rendering the screen fires `pitch_seen` — the activation funnel's step 0, and the only event that fires with no session at all. `track` buffers it and `flushTelemetryBuffer` attributes it after sign-in carrying *its own* timestamp, which is the whole reason the pre-auth buffer exists (`docs/beta-measurement.md`).

**Sign in with Apple**, and nothing else in a shipped build. It renders through Apple's own `AppleAuthenticationButton` rather than Kairo's pill, because their Human Interface Guidelines require it — black on the cream ground, since Apple's white style lands within a few points of `surfaceLift` and stops reading as a control. Cancelling the Apple sheet is silent: `apple-error.ts` maps `ERR_REQUEST_CANCELED` to no message at all, because backing out is a choice and an error line next to the button reads as a broken app.

Development builds get a second, quieter path underneath — anonymous sign-in as a ghost button under a **Development build** eyebrow. Not an "or": the two are not alternatives of equal standing, and `__DEV__` compiles the whole block out of anything that reaches TestFlight. Saying which build you are looking at is the true thing to put there.

The portal-side configuration this depends on, and the client secret's ~182-day expiry, are in `docs/sign-in-with-apple.md`.

## 2. Onboarding — "character first, permissions in context" (§5)

`welcome` → `one-sky` → `connect` → `difficulty` → `privacy` → `name`, all under `app/(onboard)/`. **Six beats since 2026-08-30** (deviation #58), where it was two: two value cards open the run, the Health ask sits in the middle, and two choices are collected before the name. Every beat carries the same four-segment rail, so the run always says how much is left — a run of two had no shape worth drawing and a run of six does. The spec's ordering principle, and the reason for it: iOS gives one clean shot at the HealthKit and notification prompts, so stacking every permission ask before any fun front-loads friction that costs signups.

**Health moved from fourth to first on 2026-08-17**, and to *third* on 2026-08-30. Asking for it after sign-in, a character choice and a name meant the first screen a new user landed on was a dashboard of zeroes — the app at its least convincing, at the moment it had just spent all its credit. But asking for it *first* meant the very first thing a brand-new account saw was a permission request, before anything had said what it was for — the worst possible order for the one dialog whose refusal cannot be undone from inside the app. Two value cards now come first and nothing else moved: Health is still asked before the name, so the home tab still lands on real numbers. `redirectTarget`'s `needs-profile` case returns `/welcome`.

**Two answers are collected before the name and written by it**, which is the only arrangement that satisfies both constraints at once. Deviation #22 requires the profile row to commit exactly once, on the last screen, and forbids *asking* anything after that INSERT — anything asked after it flips `resolveRoute` to `'ready'` under an unfinished screen. But `quest_tier_override` and `squad_data_consent_at` are in `profiles`' column-level **UPDATE** grant and not its INSERT grant, so there is nothing to write them to until the row exists. So `/difficulty` and `/privacy` ask early, `useOnboardingAnswers` holds the answers, and `name.tsx` INSERTs the row and then UPDATEs it. Nothing is asked after the insert; the row still commits once. The update is deliberately not awaited before navigating — both columns default to what those screens show selected, so a dropped write leaves the account exactly where an accepting user would be, and blocking the last step of onboarding on a second round trip is the worse trade.

1. **Connect Apple Health** (`connect.tsx`). Explains what Kairo reads and repeats the privacy line, then asks. After the sheet resolves it **reads HealthKit locally and shows today's real step count** — `readStepsToday` in `src/features/health/read.ts`, keyed to the *device* timezone because `profiles.timezone` does not exist yet. This works this early precisely because it needs no server: there is no profile row, so nothing for `health_buckets` to hang from, and the first `sync-health` call still happens after `/name`. The reveal is set exactly as the home screen's hero is — same `Numeral size="hero"`, same `accent[700]`, same display-face unit — so the home tab reads as a promise kept rather than a different screen. Zero steps and a read that throws are treated identically and neither is an error: *"We'll pick up your activity as it comes in."* A connect that actually **failed** is a different case and says so, rather than advancing to the reveal — a failure that reached that copy would be indistinguishable from a quiet phone, and the user would go on with a character powered by nothing. **"Not now" is a deferral, not a refusal** — `PermissionAsks` asks again later. This screen fires `onboarding_started`, which names the start of onboarding rather than any particular screen, plus `health_ask_completed` or `health_permission_failed`.

**Between the grant and the reveal there is a beat** (`HatchingBeat`, deviation #58's 2d). One fact, the figure in accent, a spinner at the foot. It is a **phase of `connect.tsx`, not a route** — the work it covers is the `readStepsToday` call in that screen's `connect()`, and a route boundary in the middle of an in-flight promise buys a back-swipe into a screen whose work has moved on.

The work behind it is real; what `hatching-window.ts` adds is a **floor**, so the sentence can be read rather than flashed for 180ms on a fast phone. That is a genuine trade and the module names it: on a device where the read returns immediately the beat is *paced* rather than caused, and `MIN_VISIBLE_MS` set to 0 removes the pacing entirely. Two details are load-bearing. The window opens when **`connectHealth` resolves, not when the button is tapped** — iOS presents the permission sheet during `connectHealth`, so a beat started at tap would spend its whole minimum behind that sheet and vanish in the frame the user dismissed it. And the card comes down at the **later** of "minimum served" and "read finished", so a slow read is never cut short into a reveal with no number in it. The facts are in `trivia.ts`, picked by a hash of the account so the card cannot swap its own text mid-read; every number in them is either the app's own constant or the size of an action, never a claimed effect size — a test bans a bare `%` outright.

**The connect sequence itself is `src/features/health/connect-health.ts`, shared with `HealthAsk`.** It is five steps, not one — request, register background delivery, kick off an immediate sync, read the state back, record the event — and it lives in one module because it was paraphrased into this screen from a plan that showed only the request, and three of the five went missing silently. The costly omission was background delivery: after a grant, `readHealthPermissionState()` returns `'asked'`, so `nextPermissionAsk` never offers the sheet again and nothing else would ever have registered it. Nothing errors and nothing logs; data just arrives less often. Two callers, one function.
2. **Meet your Kairo, within the first 60 seconds** (§5) — emotional investment before any ask. `name.tsx` is a meeting rather than a form: the bird is already on screen, in its sky, and the only question is what to call it. It is where the profile row is INSERTed — once, on the last screen, with `DEFAULT_SPECIES` in it rather than a route param, because the column is real and a null would be a second way of saying "eagle". This *removed* a step, so the rule below is strengthened rather than merely respected. Profile-row existence (`character_name` set) *is* the onboarding-complete marker (`app/_layout.tsx` gate) — no separate flag to desync. **Every step stays before the name screen** for that reason: deviation #22 deleted the `finishingOnboarding` flag, and anything asked after the INSERT flips `resolveRoute` to `'ready'` under an unfinished screen and needs it back (deviations #27, #35).
3. **The HealthKit disclosure** the sheet shows lists **every** type Kairo requests with what each is for, rendered from `HEALTH_DISCLOSURE` rather than written out: `disclosure.test.ts` fails if it and `read-types.ts` disagree in either direction. Prose could not stay honest — the copy named four types while the app asked for eight, and iOS showed the user the true list either way, which is what made it a trust problem rather than a wording one. The `NSHealthShareUsageDescription` in `app.config.ts` carries the same list and is the one half a test cannot lock, so it changes by hand.
3.5. **Three welcome cards, on Today** (`WelcomePopups`). Onboarding drops you on the home screen, dimmed, and a sheet rises three times: who you are, the one rule of the game, and the ask that makes it social. Once ever, on an MMKV marker — not a `profiles` column, because this is a fact about an install having shown something and no server logic reads it. The marker is claimed on the **first** card rather than the last, so somebody who force-quits half way through is not shown the set again from the top. Only the third card has a second option, because inviting somebody is genuinely optional and pretending otherwise would undo the promise the privacy beat made two screens earlier.
4. **Notifications**, requested only once a squad or a running battle gives them a reason to exist (§14) — not upfront, and after onboarding rather than in it.
5. **Body metrics (height/weight/birth year)** live in **Settings** and are **never asked during onboarding** (roadmap deviation #60; moved off the You tab on 2026-08-30 — they are the player's own record, not a fact worth putting on the screen they hand to a friend). **They are inert, and as of 2026-09-04 the card says so.** It used to read "Add your height and weight for more accurate Body tracking", which was false: HealthKit computes active calories against the body profile held in the *Health app*, before Kairo sees them, and Kairo's `height_cm` / `weight_kg` are a disconnected second copy that no scoring path reads. Birth year is the only one of the three with a consumer at all — the `220 - age` max-heart-rate estimate behind Strain (roadmap deviation #24) — and that consumer is display-only *and* currently unreachable, since `TodayPanel` was unmounted by deviation #59. So the note names no consumer: all three are inert today. The copy lives in `BODY_METRICS_NOTE` so a test can hold it.

### What a new account actually sees (§5, deviations #37/#38)

**The app a first-time user meets is deliberately smaller than the app.** Someone landing on the home tab used to meet eight retention systems at once — level and XP, four ability ratings, a daily score, streaks, raw metrics, a leaderboard, long-horizon commitments and squad program multipliers — before having a single day of data to read any of them against.

`disclosureStage()` in `@kairo/core` decides, from one number: how many days this account has ever scored above zero. Below `DISCLOSURE_THRESHOLD_DAYS` (3) the stage is `core`; at or above it, `full`.

**`core` keeps one loop**, all of it on the Today tab: the bird in its Motion location, its Level and Streak, the day's steps in real units, one quest-backed next step, and **See today's details** — which carries the complete day, all three quest states, the Daily Walk run and its explanation, and the sync line.

**Quests are outside the gate, and are the only thing that is** (deviation #50). A quest is what teaches the loop, so gating it is backwards, and a tab named for the present moment showing one card for three days reads as a broken app rather than a gentle one. **Nothing was taken *out* of the gate to make room** — the subject list below is unchanged.

**`core` hides, and never deletes:** since deviation #59 the list on Today is **one item** — the **Challenge link inside the details sheet**. `StatRail` and the per-stat block behind it are on the **You** tab and keep their gate there; the Strain/Sleep rows and the Challenge-entry card are *deleted* rather than gated, so a `core` and a `full` account otherwise see an identical Today. **And it closes the door, not just the entry point:** `/train` redirects home, because push routing and deep links reach it regardless of what any screen draws. That guard waits for the count to resolve before navigating — the stage reads `core` while it is in flight, and a Challenge push that cold-launches straight into `/train` would otherwise bounce a `full` user home. **Neither the Battle nor quests are on this list, for different reasons.** A Challenge stays gated because it is a trailing-median target over workout sessions a `core` account may have none of, and it is opt-in and off by default — offering it on day one offers depth to somebody who has not produced the data it reads.

**The Battle is deliberately not on this list either.** The goal surfaces it replaced were gated, and a `core` user could genuinely be frozen onto a squad goal with no screen to explain it; an Event has a panel on the Flock tab at every stage, so there is nothing left to hide and hiding it would conceal from a new member what the rest of their squad is already looking at.

Crossing the threshold fires `disclosure_unlocked` once, ever. The gate is on **lifetime** scored days, never a recent window: a recent-activity gate would demote someone returning from a quiet week back into the reduced app, and that is precisely the user the retention measurement is about.

A QA pass that reports Challenges missing on a fresh install is describing the design working — see `docs/mvp-scope.md`.

**MVP scope note:** ships one character class with placeholder art; the other three classes are V1 (§6). The class is internal — `profiles.class` defaults to `'hunter'` and no surface names it. **The character has no in-app noun** as of 2026-08-11 (roadmap deviation #26): it is "your character", never a Hunter. **Your character is a Philippine eagle** (2026-08-27, deviation #55, superseding the *choosing* half of #40). It used to be one of four Philippine endemic species — Pilandok, Tamaraw, Carabao, Philippine Eagle — picked in onboarding and changeable from Profile → Companion; four interchangeable skins meant the app had no character at all. The picker, `/species` and the Companion panel are gone. **Nothing was migrated**: `profiles.species` still holds whatever each account chose, `SPECIES` still registers all four, and `displaySpecies()` resolves the eagle at the render boundary — which is what makes this one line to undo. `profiles.character_body` is dead.

## 3. The daily loop (§2)

```
12:00 AM local  →  Day resets for that player (per-user local day, not a shared server midnight — §2).
Throughout day  →  HealthKit background delivery syncs automatically, free and paid users alike.
Anytime         →  Open the app: Today tab, Sky tab, Flock tab, /train, or the squad's battle.
Any workout     →  Logged on the watch or phone, it syncs as a session and can clear a Challenge.
11:59 PM local  →  Day ends; provisional results shown. No push — see below.
~2:00 AM local  →  Day finalizes (grace window for late phone syncs) — XP lands, and once
                   EVERY member of the squad has finalized that date, the race result is
                   snapshotted into `race_results` and never changes again.
 8:00 AM local  →  The one push of the day: yesterday's result, today's standing, the boss.
Sunday 10 PM    →  AI weekly recap card pushed to all squads (V1+).
```

### One push a day, in the morning (deviation #52)

**Three scheduled pushes became one on 2026-08-25.** The evening pair — "1 hour
left" at 11 PM and "Day ends" at midnight — and the mid-morning "Day starts" are
all retired. What replaces them is a **digest at 08:00 in the recipient's own
timezone**, carrying yesterday's *finished* race result, today's live standing,
and a live Battle's pooled progress.

**08:00, and deliberately not the finalization moment.** A day finalizes about
two hours after the player's local midnight, so a push carrying the finalized
result would arrive at 2am. The two are decoupled: `finalize-days` writes the
result when the day closes, and the dispatcher sends it when its reader is
awake. The cron still fires hourly and twenty-three of those runs send nothing —
every hour of the day is somebody's 08:00.

**Who is offered the ask, as of 2026-09-04.** `shouldAskForNotifications` gated
on having a squad or a running Battle, which was right while the pushes it
enabled were social — and wrong the moment deviation #52 left one scheduled
push. Kairo is solo-first, so that gate excluded the entire solo cohort from
the only re-engagement the app has. The why is widened to include **a first
scored day**: a player with no squad and nothing scored is still not asked, and
a player whose first day scored is. Nothing else about the ask moved — the
primer sheet, the Health-first ordering in `permissions/ask-order.ts`, the
one-ask-per-session latch and the single modal host are untouched, and the
widening deliberately adds a reason rather than a surface, because two sheets
presenting on one root view controller is the defect that ordering function
exists to prevent. `hasScoredDay` comes from the Today tab's own
`useScoredDayCount` key, so it costs no request; a count still in flight reads
false and withholds the ask for a frame rather than presenting it on a guess.
The answer is recorded per answer as `notification_ask_answered` — `granted`,
`declined` or `deferred` — carrying nothing else, since the widening is judged
on grant rate and not on why the player became eligible. The Settings row's
undetermined help line moved with the policy; it had told solo players they
needed a squad to be asked.

**The ask sheet says this, as of 2026-09-04.** It had gone on offering the
three retired pushes — "when a new day starts and when this one is about to
close", under a cap of "three a day … except the two that close out your day,
which arrive at 11 PM and midnight" — on the one screen where somebody decides
whether to spend the single dialog iOS grants per install. `ask-copy.ts` holds
what it says now (one message a day, at 8am, yesterday's result and today's
need), pinned to `DIGEST_HOUR` by a test, and the Settings row lost the same
"day-end reminders" phrasing. Neither surface promises quiet hours: quiet hours
are enforced in `planNotifications`, which only `dispatch-notifications` calls,
so the `event_completed` and `challenge_cleared` pushes `finalize-days` sends
do arrive about two hours after local midnight. Both surfaces say that instead.

**It is capped in the database, not on the phone.** `users_needing_digest()`
excludes anyone already sent today in the same query that works out whose local
clock reads 08:00, and a partial unique index on `notification_log` refuses a
second row even if that query is wrong. A client-side cap would be a race
between the same account's phone and tablet.

Four sentences, not one template with holes: you won yesterday; you placed
yesterday; yesterday is not final yet but here is where you stand today; you
have no squad. **A solo player gets a digest too and it never mentions rank** —
they are racing their own past days, and "1st of 4" against three ghosts would
be a claim about other people that is not true.

Two pushes still fire from something the user did — a Battle completing and a
Challenge clearing — and the max of 3 a day still bounds those.

### Tapping a push lands somewhere specific

Every notification carries a destination, and as of 2026-08-14 the app acts on
it. `dispatch-notifications` sends `screen: 'today'` with the digest;
`finalize-days` sends `screen: 'events'` with the `eventId` that just went down,
and — as of 2026-08-15 — `screen: 'train'` when a Challenge clears. A tap goes
to the Today tab, `/train`, or **that battle's own screen** — the most specific
destination the product has. Pushes sent before a deploy still land: the
pre-rename `goals` payloads and the retired `squad` and `character` ones all
still route, because a tap that goes nowhere is indistinguishable from push
being broken.

Three details are load-bearing rather than incidental:

- The character destination is `/`, the tabs index — which is now the Today
  tab, the character screen having merged into it. `/character` was the
  onboarding species picker and no longer resolves at all (deviation #55).
- A tap that launches the app from terminated is not lost while the session and
  profile resolve. `useLastNotificationResponse()` retains the response, so the
  routing hook reads it when the tabs shell finally mounts, seconds later.
- A push arriving while the app is already open now shows a banner. Before
  `setNotificationHandler`, iOS displayed nothing at all in the foreground —
  which reads exactly like push being broken. That matters more since the
  digest, not less: it is worth showing to somebody already looking at the
  screen, because it carries yesterday's *result*, which the screen does not.

An unrecognised payload is ignored rather than acted on, so a push from a newer
server than the installed build cannot send anyone somewhere that does not exist.

### The numbers say how old they are

Under the TODAY panel on Character, a status line reports when health data last
reached the server: `Synced 4 minutes ago` when healthy, `Last synced 3 hours
ago · Sync now` once it goes stale, and `Couldn't sync. Showing data from 3
hours ago · Try again` when the last attempt failed. `SyncStatus.tsx` renders
it, `sync-status.ts` decides the wording, and retry enters the sync policy as a
`manual` trigger — unthrottled, because it is the escape hatch from exactly the
state it is reporting.

This is not decoration. Between 9 and 11 August 2026 `sync-health` failed on
every call while its bucket write kept committing, so the app displayed real,
climbing step counts against a score of zero and gave no indication anything
was wrong — for two days, to every user. `SyncState` had recorded the failure
the whole time and nothing read it. A figure is now never shown without its
provenance; see the addendum in `docs/qa/kairo-end-to-end-qa-report.md`.

**`Apple Health isn't sending anything yet · Open Settings` is a sixth state, added 2026-08-17** (deviation #39), for an account where syncs are landing and nothing has ever arrived. Someone who declined the Health sheet used to be shown *"Couldn't reach Apple Health"* — an intentional choice rendered as a technical failure. It is a new state rather than new words on the old one, because `failed` exists to catch the outage class above and softening its copy would blind exactly that. It ranks **below** both `failed` and `stale`: an error and a sync that is an hour behind are each the nearer problem, and the second has a retry.

It waits **six hours from the first sync ever completed** before saying anything (`QUIET_GRACE_MS`, anchored on `SyncState.firstSyncedAt`). Without that window it would fire on somebody who connected at 8am with 200 steps and nothing scored yet — the same false accusation, aimed at the opposite user. Its action opens iOS Settings rather than retrying, because every sync in the window already succeeded and there is nothing to run again.

What it cannot say is that the user declined. HealthKit deliberately never reports read-permission denial — that would leak whether someone has a given condition — so "nothing has arrived" is the whole of what is knowable, and "yet" is what keeps it a status rather than a verdict.

Because each player's day runs midnight-to-midnight in *their own* timezone, a squad spans multiple calendar dates at any instant — this is what makes the OFW-in-Dubai-vs-family-in-Cebu use case work at all, and it's why every score, bucket, and battle window is keyed by local date, never server time (see `CLAUDE.md` → Per-user local days).

### Engagement hooks, and how many survive with zero friends (§2)
1. **Morning FOMO** — who's ahead while you slept (solo: how long is the streak now). Since deviation #52 this is the *only* scheduled push, and it now carries a result rather than a provisional standing: yesterday's race is finished and snapshotted by the time it arrives.
2. **The commitment** — a Challenge on `/train`, or the squad's battle with a visible days-remaining count. Only the first works with no squad at all.
3. ~~**Night urgency** — real-time rank notification with a countdown.~~ **Retired 2026-08-25** with the evening pair. Three pushes a day was volume, not urgency; the hook it was meant to be is now the morning digest's, once.
4. **The floor and the curve** (2026-08-15) — the Daily Walk is the same 10,000 steps for everyone, every day, forever; a Challenge is a target set from your own recent sessions that moves as you do. Both are entirely solo, which is the point: three of these four now work with no squad at all.
5. **Three quests, reset every local midnight** (2026-08-25, deviation #50) — the smallest hook in the app and the first one a brand-new account meets, because it is the only one outside the disclosure gate. Entirely solo, and deliberately cheap: three of them together pay less than a third of a strong day.

## 4. The four tabs

`app/(tabs)/_layout.tsx` defines the shell every session lands in after onboarding. Since 2026-08-27 (deviation #54, superseding #50) there are four: **Today · Sky · Flock · You**. `TabPill` is a hand-built bar rather than a stock one. Since 2026-08-30 (deviation #58) it is **frosted glass**, four shares, and it **names only the tab you are on** — the selected item takes half again the width and carries a gradient fill with its word in it, the other three are bare glyphs. That is not a retreat to the spoken-only labels of 2026-08-11: every tab still carries its name as an `accessibilityLabel`, so nothing is lost to a screen reader. What changed is that four labels under four glyphs in a 74pt bar left the type at a size that could not survive the `chrome` scale's 1.4× cap without truncating on every tab at once. It is **flat, with no raised disc**: the raised disc meant *anchor* and the anchor was the character tab, which is gone, and raising an arbitrary one of four is what #50's own reasoning forbids. `NAV_HEIGHT` stays 96, so `TAB_PILL_CLEARANCE` did not move and no screen's bottom padding changed.

`/today` and `/squad` stopped resolving with that rename, so `notificationTarget()` moved in the same commit — `'today'` → `/`, `'squad'` → `/flock`. `dispatch-notifications` still sends `screen: 'today'` and was not redeployed; only the client's reading of the payload moved.

### Today (`index.tsx`)
Today is the **Living Mirror**: KAIRO remains the largest visual, standing in a Motion location derived from live steps against `DAILY_STEP_BASELINE`. Compact Level and personal Streak remain in the scene; the day has one large raw reading (steps), one gentle next step selected from the unchanged three daily quests, and **See today's details**. Details contains Motion steps/distance/Daily Walk run, Body active energy and verified strength minutes when present, verified Mind sleep only when capable and measured, every quest state, relevant sync help, progress help, and the `full`-gated Challenge link. The Sky tab owns the race, You owns Mastery and records, and opening Kairo is never required for activity to count.

The character tab and the old Today tab merged here on 2026-08-27 (deviation #50 split them; the redesign resolved it the other way, by making the day *about* the character), and deviation #59 replaced the list under the hero with the Living Mirror. **Every query on it was already mounted by one of the two screens, on the same key** — deviation #59 removed the leaderboard, recent-day and race-rank reads and added two owner-only ones nothing else needed: today's verified strength evidence and personal records, neither of which reaches a projection or a telemetry payload.

- **Three stats drive it, as of 2026-08-20** (deviation #41, which supersedes §5's and §6's four-stat tables): **Motion** (steps), **Body** (active calories) and **Mind** (sleep). Those are the words on every screen; `AGI`, `STR` and `MND` are the engine keys underneath them and are rendered nowhere, as of deviation #51. Two of them are phone-only and passive; MND needs a sleep source, typically a wearable. END (active minutes) and VIT (hourly movement) are not gone so much as demoted from stats to *modifiers* — active hours lower Motion's bands and verified workout minutes lower Body's, by 5% a step to a cap of 25%, so the signal survives as generosity rather than as points. **A modifier is a threshold shift and never a multiplier**, because a stored multiplier would stack with the squad program's read-time ×1.5 (deviation #10's trap).
- **A wearable is a third route to the ceiling, not a higher one.** Promoting sleep to a stat would otherwise have made a wearable worth 27% of the daily maximum — a permanent leaderboard gradient, in a market where it lands on the people least likely to own one. A day's stat points are therefore scaled by `3 / earnable stats`, so a phone-only Gold + Gold equals a wearable user's Gold + Gold + Gold and **both ceilings are 4,400**. Mind counts as earnable if sleep that scores arrived in the last 14 days: today's data would invert the incentive (skip tracking, score more), and `has_wearable` is sticky, so someone who abandoned a wearable would be penalised twice. The honest cost, which the app says rather than hides: two users with identical steps and calories can score differently.
- Each stat scores independently per day (None/Bronze/Silver/Gold → 0/250/650/1,200 pts since deviation #41, re-derived so that `4 × 900 = 3 × 1,200`) plus a consistency bonus for touching **every stat available to you** — two without a wearable, three with — in the same day (§6). **Tier names are internal to the scoring engine only** — nothing in the UI shows "Bronze/Silver/Gold" (roadmap deviation #23). What the player sees is a numeric **ability rating** built from lifetime per-stat points, plus a guidance line in raw units that names what the effort achieves rather than what it pays ("1,240 more steps tops out your Motion today", or "Your lane · 20 more kcal lifts your Body today"). That line has carried three vocabularies — "for Gold", then "for +400 AGI", now this — each retirement for the same reason: name something the user can recognise.
- **The guidance line names the band the day is actually judged against, as of 2026-08-19** (deviation #41). END and VIT survive as *threshold shifts*: active hours lower Motion's bands and verified workout minutes lower Body's, up to 25%. `nextTierFor` read the unshifted ladder while the scorer read the shifted one, so a day spent moving was told "1,240 more steps" and topped out at 7,500 — arriving early, which reads as a broken score rather than a gift. The line reads `statShifts()`, the same table `computeDailyScore` uses, so the screen and the score cannot quote different ladders. Two things it deliberately does not touch: the **Daily Walk** still reads the *unshifted* Motion ladder (`tiers->>'AGI_base'`), because a public-health baseline must not scale with the user; and Body's hint quotes **no band at all** on a day that carries a workout. The home screen still has no verified-workout figure — widening `useWorkoutSessions` to the three trust columns is a §5 decision that has not been taken — so rather than quoting a ladder the scorer may have lowered by a quarter, Body is dropped from the guidance ranking on such a day and another stat with a real number takes the line. When none is left it reads "Active calories lift your Body today", naming the lever and no figure. Silence beats a confidently wrong number: being told 400 kcal and topping out at 300 is the same "broken score" failure the deviation exists to close. The screen decides this from the *existence* of a session — `workoutDaySignal()` reads `local_date` and nothing else — and an in-flight sessions query silences the same way a known session does, because "I have not been told" is not "there is none".
- **The hero number opening the shelf is the day in real units, not the score, as of 2026-08-15** (roadmap deviation #30). It used to be `daily_scores.total` — a four-digit integer with no unit, no label and no target — and now reads as the day's steps at display size with the unit beside it. The rest of the ledger — distance, calories, active minutes — went with `TodayPanel` on 2026-08-27, became the bird's two observation cards, and moved again on 2026-09-01: deviation #59 deletes the cards and puts every raw figure in the details sheet, ungated. The engine still computes the total — it still ranks the board and feeds XP and the ability ratings — it is simply not something a first-time user was ever able to read. Anyone curious what actually ranks them can still find out, on `app/progress.tsx`'s "Daily score" entry.
- **The stats are glyphs on the rail, not letters** (2026-08-11): a footprint, a flexed arm and a brain, each over its rating. The name survives one tap down, on the expanded bars — icon, "Motion", and "Steps and distance" together — which is where a new player learns the mapping, and in the guidance sentence, which names the stat the same way. That bar printed the `AGI` key until deviation #51: it was teaching a mapping to a three-letter word that appeared on no other screen, and it disagreed with its own screen-reader label, which had always spoken the stat's name.
- **Level** is permanent XP, never resets. Two players at the same level can look different — the character's visual build follows whichever stat dominated their **last 14 days** (`DOMINANCE_WINDOW_DAYS`; the ability ratings are the lifetime figure, the build is the recent one): leaner for Motion, broader silhouette for Body, and for Mind §6's recovery build, inherited from the VIT entry it replaces since §6 was written before sleep was a stat. A rare "All-Rounder" look — unpurchasable, must be earned — when all three stay within 20% of each other.
- **Strain** (roadmap deviation #24, 2026-08-10) is a derived, wearable-only, display-only figure from hourly heart rate — never stored on `daily_scores`, never ranked, never gates anything.
- **The figure is a Philippine eagle, for everybody** (deviation #55). One
  artwork plus a habitat behind it — and one is enough precisely because the
  three responses below are code rather than art. A species is cosmetic and
  reaches nothing in `@kairo/core`; its `affinity` is flavour, naming which stat
  the animal is *about*, never what you earn. Squadmates see it too:
  `squad_leaderboard()` and `event_progress()` both project `species`, so the
  board row and the battle roster draw the bird where the initial disc used to
  be. **Nobody keeps the disc any more** — `displaySpecies(null)` is an eagle,
  so the `Avatar` fallback for accounts predating the choice is gone from all
  six render boundaries, along with `CharacterFigure`'s View primitives.

- **Three things move the figure, and they are independent.** `stage` (level bands) widens and deepens the ground shadow, so levelling shows whatever you grind; `dominance` changes the build's proportions and the shadow's tint per §6; and the **presence ring** carries the ability rating (`src/features/character/aura.ts`) — present from rating 5, stronger at 10, and still always on for the balanced All-Rounder, whose ring means *shape* rather than magnitude. The August QA pass reported the character as static: the first two already existed and were invisible because nothing had scored since the 9th, so level sat at 1 and dominance was null. The ring is the only genuinely new one, and it reuses an element already on screen rather than inventing a third visual language.
- **It answers at every level now, not only at three boundaries (2026-08-25).** The QA finding survived the ring, and only half of it was the missing data: the arithmetic was also almost invisible — 146 points of shadow at level 1 against 200 at level 21, a 37% span across the entire game — and `stage` moves at levels 6, 11 and 21 and nowhere else, so levelling 12 → 13 genuinely changed nothing. `figureResponse()` in `src/features/character/level-response.ts` widens the span past 1.7× and adds a within-band term, with the band boundary still much the bigger jump so the four artworks stay the milestone. It is a tested pure module rather than three expressions inline, precisely so the bands could be widened against assertions rather than by eye — and it grows to a ceiling at level 40, because unbounded growth eventually pushes the figure out of the diorama. **With no cosmetics and no coins in Phase 1, the figure is the reward**, which is what makes this worth doing before any of them.
- A rest day scores 0 and still costs the streak, but the battle card always says how many days are left to make it up (§6) — the app is designed to still be worth opening on a bad day.
- **"How progress works"** (`app/progress.tsx`), linked from the foot of the expanded stat rail — which lives on the **You** tab since 2026-08-27 — and, for a `core` account with no rail to expand, from the foot of Today. It explains the four numbers by the one thing that actually separates them — their timescale: daily score is today, ability ratings are lifetime per stat, level and XP are all-time, streak is the run of days. A route rather than a modal, because `PermissionAsks` owns the single modal the app may present. Offered at the point of expansion rather than beside the hero: expanding the rail *is* the question being asked.

#### The three small things below the fold
**Three quests**, **the Daily Walk**, **the Challenge door**, in that order — they were their own tab between deviations #50 and #54. The quests are what to do about the day; the walk is the floor every day shares; Challenges are the opt-in depth underneath. The gated item is last deliberately — a hidden card at the bottom leaves no hole, where one removed from the middle would.

- **A quest is derived, never stored.** `pickQuests()` in `@kairo/core` is a pure hash of `(account, local date, tier)`, so the local-midnight reset costs no job, no row and no cron: tomorrow simply hashes to a different three. That is the property a Challenge already had, bought the same way and for the same payoff — nothing stateful exists for a retroactive Apple revision to invalidate, because progress is a read-time projection over `health_buckets` and `daily_sleep`. Only the *completion* is stored, because it pays XP and must fire exactly once. A hash rather than a random draw for a reason that bites rather than being a house rule: a random pick would hand the same account a different three on every render, and the user would watch their morning's work disappear.
- **The catalogue is hand-authored, at three tiers, at least six per tier** — with exactly three, every day would show the same three in a different order and the reset would read as a bug. Bars are in raw units the user produces: "Walk 7,000 steps", "Burn 400 kcal", "Sleep 7 hours". Never points and never stat names — a quest is the smallest thing in the app and the first thing a new account meets, so it has to be answerable without knowing anything about Kairo's model.
- **XP is deliberately small.** Three quests cap at 60 together against a realistic 200-point day. A quest is a garnish on the loop, never a cheaper route through it — otherwise the fastest way to level is to clear three easy bars and stop. It reaches `profiles.total_xp` as a **fourth source**, alongside daily scores, Event completions and Challenge completions, and never touches `daily_scores.xp_awarded` (a rescore would replay it away) or the three stat rollups (a cleared quest is not activity in a stat).
- **Difficulty is auto-assigned, and the override wins outright.** The automatic rule counts how many days the account has ever scored — which measures *engagement*, not capability, so it hands a thirty-day account averaging 3,000 steps the same tier as one averaging 15,000. The alternative, a trailing median of daily steps, was rejected because it makes the bar rise as the user improves, which is exactly the conflation the Daily Walk exists to refuse. So the Profile → **Quest difficulty** control is the correction for a rule that is wrong by construction for part of the cohort, and its copy names the automatic rule's real input: *"Kairo picks a difficulty from how long you have been here. If the quests feel wrong, choose your own."* A user who finds their quests too easy learns why, rather than assuming the app measured them and got it wrong.
- **"No reading yet" is not "0 of 420".** A missing sleep row means the night is *unknown*, and a hand-typed night scores nothing at all — so both read as silence rather than as an accusation. `finalize-days` applies the identical gate when it grades, so a night the card called unknown clears nothing on the server either.
- **The race is a sentence, not a card, as of 2026-08-27.** The card is gone: the race has its own tab, and the only part of it that belongs on a screen about your own day is the gap to the bird directly ahead — which the hero sentence names ("Ramon’s is still 1,240 ahead of you"). It ranks the same payload the Sky tab ranks, the same way: by capped steps, on the client, because `squad_leaderboard()` orders by the program-weighted total and ranking once in SQL would silently delete the program feature. With no squad the rivals are your own recent days; past the flag the clause drops entirely, because `cappedSteps` stops at the line and naming a gap would imply extra steps still buy something.
- **What the bird says lives in `kairo-voice.ts`**, a zero-runtime-import module tested in plain Node — the same split as `race-label.ts` and `quest-copy.ts`. Three rules have tests behind them: no score total, no engine key, and a missing figure yields a *shorter* sentence rather than a fabricated one.

### Sky (`sky.tsx`)

The daily race, as **one shared corridor everybody flies** (deviation #56, superseding #46's six parallel lanes). One Bézier from the near corner to the far one, with a flag at the end that sits at `RACE_FINISH_LINE` — which *is* `DAILY_STEP_BASELINE`, which is the Daily Walk, so crossing the line and clearing the walk are the same event. One number the app teaches, read socially here and personally by the streak.

It is always on: there is no creation flow, nothing is stored, and a retroactive Apple revision moves the standings the same way it moves everything else, by being replayed. Ranking is by **capped** steps, so past the flag extra steps buy nothing at all — the cap *is* the anti-cheat, and it needs no fraud detection and no accusation.

- **Six lanes became one because of what the picture answers.** Six parallel bars each showed a quantity; a shared corridor shows a *field*, which is what makes "who is directly ahead of me" answerable at a glance rather than by comparing bar lengths. The mechanics did not move: same payload, same client-side re-rank, same derived finish line, same reciprocal consent gate.
- **The geometry lives in `packages/kairo-core/src/sky-path.ts`**, arc-length parameterised so a racer at 50% is visually halfway along. A naive per-segment parameter makes the second curve visibly faster than the first, so two racers a thousand steps apart would look a different distance apart depending where on the curve they are — the one thing a race picture must never do. It is in the keystone because two renderings read it (the band and the markers), and because a component reaching React Native cannot be loaded by root Vitest at all.
- **Ties are the common case, and `placeRacers` pulls them apart.** `cappedSteps` stops at the line, so two active people are tied on the primary key by construction. On six lanes that was invisible; on one corridor it is two birds on the same pixel. Offsets alternate around the line so a cluster stays centred on it, and the whole function is deterministic — the board refetches on realtime broadcasts, and anything else makes the picture twitch.
- **Drawn in plain React Native, deliberately.** `react-native-svg` would render the path in one element and was rejected on cost: it is a native module, so it moves the EAS fingerprint, spends one of the month's fifteen builds and withholds every OTA update until that build lands. Twenty-four short rounded views rotated to the curve's tangent is the price of keeping the whole redesign shippable over the air.
- **A squadmate who is not sharing is listed below the picture, not drawn on it.** They have no position, and putting them on the corridor would imply one — dropping them looks like they left, drawing them at zero invents a bad day. With sharing off on your own side the sky is empty and a note says why, gated on `isSuccess && !consented` because a query in flight reads `false` and is indistinguishable from a refusal.
- **This screen owns the `race_seen` marker**, once per the user's own local day. It moved here with the picture when the race stopped being a card on Today: the marker measures looking at the race, and this is the only screen that shows one.
- **The freshness line claims only your own numbers.** Squadmates' sync times are not knowable here — the RPC projects totals, not sync times — and a corridor that reads as live while it is hours old is a promise the app has no way to keep.

### Flock (`flock.tsx`)
The optional social layer (§7). Named **Flock** on the surface since 2026-08-27 (deviation #57) — the engine keeps `squads`, `squad_members` and `squad_leaderboard()`, deviation #23's split in a third place. `SquadDataConsentSheet`'s body copy still says "squad", deliberately: it is the text members consented under.

**2d's composition, as of 2026-08-27:** the squad name and date, **your week** as seven discs, the program line, your standing, the mode toggle, the ranked rows, the invite block. The week strip shows *your* last seven days rather than the squad's, and says so — the design draws a squadmate's face per day, which needs a per-day, per-member roster no query returns. It draws no count either: a squad spans timezones, and "three of four are in" is a claim about a moment that does not exist for everybody at once (§2). **The board no longer mounts the race track** — that is the Sky tab, and drawing it in both places would be the same picture twice.

**The tab opens on a consent decision before it opens on anything else, as of deviation #47.** Racing means squadmates see four of your daily totals — steps, distance, active calories, sleep duration — and that is real health data leaving the account, so the ask is a screen with a decline path rather than a line in a policy. It appears *instead of* the create or join form (agreeing is part of joining, exactly as consenting to the squad's program already is), and once per launch for anyone already in a squad, because they joined under a model where their totals were never projected. Declining leaves you on the board; your lane and everyone else's simply carry no position. The gate is **reciprocal and per row** — you see a squadmate's totals only if you are sharing yours — which is what stops declining being strictly dominant, and what stops a single holdout's decision being broadcast to the five people who agreed.

**The race itself is the Sky tab, not this one (deviation #56, superseding #46's six lanes).** What the Flock tab keeps is the board — the ranked rows, in the program-weighted order the RPC returns them in. Two readings of one payload, one fetch: the corridor re-ranks by capped steps on the client, and ranking once in SQL would silently delete the program feature (deviation #11). A squadmate who is not sharing keeps their row here and is **listed below the corridor** on Sky rather than drawn on it — dropping them would look like they left the squad, and drawing them at zero would invent a bad day.

- **Solo Mode is not a degraded state** — it's a first-class mode. **With no squad you race your own recent days as ghost figures** (deviation #46), which is the narrow, deliberate exception to the source design's warning against solo challenge modes: it exists so nobody ever meets an empty tab, and so the mechanic teaches itself before a friend arrives. Days that scored nothing are dropped rather than raced — a new account otherwise lines up against three zeroes, which reads as the feature being broken rather than as an easy win — and with no qualifying history at all you fly the corridor alone. Never an empty sky, and never a fabricated rival. **The ghosts race on the Sky tab, not on the solo board** (deviation #56): the squadless Flock tab drew its own six-lane track until 2026-08-27, and two pictures of one race on two tabs is how they start disagreeing. What that board was for survives — an invite affordance beside a real day. Character progression works with zero squadmates; coins and the shop are V1+ and this beta ships neither (`docs/mvp-scope.md`). **The solo board sells possibility rather than absence, as of 2026-08-17:** the title, the one-sentence explanation of what a squad is, then **Create a squad** / **Have an invite code?**, then your own real row, then **one** empty seat. It previously opened on `1st` at 64pt over `of 1` — an ordinal whose only possible meaning is that you beat nobody — above five empty seats, which is a picture of loneliness drawn five times. One seat is a picture of what a squad looks like, and the actions sit above the board because inviting somebody is the thing to do here, not admiring a rank.
**And the day's race is kept.** When the **last** member of a squad finalizes a date — not the first, because days are per-user local and a squad's race for a date is not over until every member's is — `finalize-days` snapshots the standing into `race_results` and never touches it again. That is the §19 rule the completions already follow: a later Apple revision does not retract anyone's win, and it is why the standing is stored at all, since the projection behind it can no longer answer "who won on 14 March" once the buckets have been revised. The table has **no client grant whatsoever**; `race_result()` reads it under exactly the consent gate above, returning rank and species to anyone in the squad and capped steps only when both sides have agreed. A member who was not sharing is still stored with a real rank, because dropping them would make the history disagree with the board their squad watched all day.

- Joining a squad: an invite link or the 6-character code, typed. Leader can rename, remove members, transfer leadership. Free tier: 6 members / 1 squad; Legendary: 15 members / 3 squads.
- **Inviting is an action, not a code to read aloud.** The invite card has a Share row, and every empty seat is itself the button — the `+` disc and "Invite your squad" were already drawn and did nothing, which is where the social loop stopped. `shareInvite()` uses React Native's own `Share`, deliberately with no clipboard dependency: the iOS sheet already contains Copy, and it puts Messenger and Viber one tap from the code, which matters more here than a "copied" toast. The message names the squad and says what Kairo is, because the recipient is not a user yet — **since 2026-08-17 by naming what they are being asked into** ("we keep each other to a daily walk. It counts steps, never your Health data") rather than describing the leaderboard to somebody with no reason to care about it yet. It is the only Kairo copy a non-user ever reads, which makes it the only place the privacy promise reaches them. Every word is spent against a hard budget: the link and the code line are 84 characters between them and a test holds the whole message under 200, so adding a clause means removing one. **Universal links landed 2026-08-17** (deviation #36). The message now carries `https://kairo-teal-nine.vercel.app/join/<CODE>` *and* the bare code, because a client that mangles the link must still leave six characters to type.

**The link is an accelerator, never an action.** `app/join/[code].tsx` fills the field in and stops: a link can be stale, belong to a full squad, or be tapped by somebody who did not mean to join, and joining is not free on a tier that allows one squad. `JoinSquadForm`'s existing preview then shows the squad's name and program before the tap that commits. Three arrivals it handles, none of them unusual — **signed out or mid-onboarding**, where the gate redirects and the code is stashed in MMKV for an hour and redeemed by `usePendingInvite()` in the tabs layout (which only mounts for a `'ready'` user, so mounting *is* the check); **already in a squad**, which gets a screen naming the one-squad rule rather than a silent redirect to a board nobody asked for; and **a link carrying no usable code**, which renders the form empty with a line saying so.
- What a squadmate can see is aggregates, plus — behind the consent gate above — **four daily totals**: steps, distance, active calories and sleep duration (deviation #47). What they still cannot see is the half of §5 that actually carries routine: **hourly patterns, heart rate, workout sessions, pace, routes and timestamps.** `squad_leaderboard()` sums a day and never selects or groups by the hour column, which is exactly the difference between a total and a movement pattern. The hour-by-hour shape of someone's movement reveals sleep and work patterns and stays owner-only — it stopped being a stat with deviation #41 and did not stop being sensitive, since it still decides Motion's threshold shift.
- **Squad programs** (`squads.program`) are the one "focus" concept left in the app — fixed at squad creation (see `docs/roadmap.md`, 2026-08-07 scope addition).
- **A row is rank and the gap to the row above, never a total, as of 2026-08-15** (roadmap deviation #30). `row-label.ts` composes the accessible name from rank, name, that gap, level and ratings — it stopped saying "N points" because a screen reader naming a figure the screen does not show would describe a different product. The board header still carries the program's boost chip; a row no longer needs one to explain a total it no longer shows.

### You (`profile.tsx`)
Who you are, what you have earned, and the account actions. **2e's composition, as of 2026-08-27:** the XP ring and "Level 12 · Philippine eagle", the streak card, the ability ratings (gated on `full`, moved here from the dissolved character screen with the per-stat block behind them), **"How your Kairo grows"** — an ungated static explainer that says what each stat is *for* and never what you have earned — then body metrics, notifications, quest difficulty, timezone and the account actions. Settings, body-metric soft prompt, and account actions. **Quest difficulty** lives here (deviation #50) — four chips, Automatic plus the three tiers — above Timezone because this one is a choice and that one is an observation.

- **Delete account** (`app/delete-account.tsx`, migration `20260811140000`) is a route rather than an alert, gated on typing `DELETE`. It is the one action with no undo, and a two-tap dialog optimises for the person who already decided while the whole cost lands on the person who had not. It sits below Sign out so the reversible action does not compete with the irreversible one.
- The screen says what *survives*, because "everything is deleted" would be simpler and false: squad leadership passes to the longest-standing member (or the squad goes too, if you were the last), and a battle you started keeps running for everyone else with your name off it. Someone erasing an account to get out of a squad deserves to know the squad continues.

- **Notifications** (`NotificationSettingsCard.tsx`) reports whether they are on, and offers `Linking.openSettings()` when iOS has a denial on file. Re-read on every foreground, because the state can only change in iOS Settings — so returning to the app is the only moment worth checking, and reading once at mount is precisely how the QA pass ended up with a screen describing permissions the user had already revoked. It sits above Timezone deliberately: the zone follows the device and cannot silently be wrong, whereas this can.
- The card does **not** campaign for the permission back. A denial is a decision; the row's job is to make it legible and reversible. `shouldAskForNotifications` still owns the contextual ask, so an undetermined state shows no button here.
- When the permission *is* granted, a **delivery line** sits under the copy: `Delivery: registered.` It reports whether the server has a token it can address — which granting the permission does not prove, and whose absence is otherwise silent. On a development build it appends the APNs environment; on TestFlight it cannot, because that value is read from a provisioning profile App Store distribution strips out, and registration is the better answer anyway (a token cannot exist if the entitlement is wrong). On a simulator it says so, rather than reporting a failure that is not one. It ships in Release on purpose; `__DEV__` would hide it from TestFlight.

## 5. Events (§8, deviations #45/#48/#49) — the Battle, which replaced Goals

Sabotage was the original hook through v1.3; removed 2026-08-09, and Goals replaced it. **Goals were themselves replaced on 2026-08-25 by the Event**, of which one kind ships: the **Battle**. A Battle is what makes the app matter past week three now — a boss a squad fights together, over a window of days, measured in the calories they actually produce.

The change is not a rename. A squad goal was **N-of-M**: everyone had to hit the target individually, so a weak member was a liability and inviting somebody was a risk. A Battle **pools** every participant's contribution into one bar. That reversal is the whole reason the mechanic exists — the strong member carries, and being carried is a reason to be in a squad at all.

It lives on the **Flock tab**, below the race, because a squad's shared fight belongs where the squad is. `app/event/new.tsx` to start one, `app/event/[id].tsx` to see it in full. There is **no personal Battle** — a personal fight is a Challenge, which already exists on `/train`, and the database rejects a squad-less Event outright.

- **Three questions and a computed fourth.** Name it, pick a window, pick a difficulty — Skirmish, Standard or Raid — and the app works out the boss's HP from the squad's own last fortnight, showing the number before you commit to it. The Goal form asked for a points target the user had no way to evaluate before typing it, which made the number arbitrary and made missing it read as the algorithm's fault. This is the fix.
- **The target is snapshotted at creation and never moves.** That is the deliberate opposite of a Challenge, whose target is re-derived on every read. A boss whose HP rose because the squad got fitter mid-fight would silently re-grade every day already counted. **Progress** stays a read-time projection over `health_buckets`, so a retroactive Apple revision still flows through: the target is fixed, the progress is replayed.
- **Difficulty is not a formula on screen.** The multipliers exist and are deliberately unprinted — 0.85 on a card invites a squad to reason about the arithmetic instead of about the fight. Standard is winnable by carrying on as you already were; Raid is where everybody has to push.
- **A brand-new squad still gets a real fight.** With no history the pooled median is zero, so a floor per member per day applies. Without it the boss would be defeated in the same second it was created, which reads as the feature being broken rather than as a gift.
- **The roster is frozen at creation**, and membership changing later does not change what the group committed to.
- **When the bar fills, everybody on the roster is paid** — including a member who contributed nothing. That is the mechanic, not an oversight: paying only contributors would rebuild the per-member rule one layer down, with the weak member visibly carrying a liability tag.
- **One live Battle per squad.** Starting a second is refused with a sentence, not a constraint name. Leaving is the escape hatch and a distinct, visible act; the last member to leave **closes** the fight rather than deleting it, so XP already paid keeps its record.
- **Completion is a one-way latch**, evaluated only once every participant's day has gone `final`. A later downward revision from Apple never revokes a Battle already won. Reward is XP — scaled by the window committed to rather than by how early it landed, and capped.
- **Not disclosure-gated.** A new member sees the fight their squad is already in, which is the one thing a scored-day gate would hide for no good reason.
- **The per-member breakdown carries the same consent gate the race does.** The pooled bar is always visible to everyone on the fight; an individual's own calorie figure appears only where both people have agreed to share daily totals, and reads "not sharing" otherwise. In a squad of **two**, the pooled total can be inverted by subtraction — a known limit with no technical fix, named in the privacy policy rather than papered over.

**Adventure** is the same engine counting metres instead of calories. The schema carries it already so the migration happened once, but nothing can create one yet.

## 5b. Train (§5, deviations #32/#33) — the floor and the curve

Two mechanics, deliberately different in kind, both reached through Today's
details sheet.

**The Daily Walk** lives in the details sheet's Motion section since deviation
#59 — it was a card on the Today tab from #50 until then, and its own card
before that, unchanged in every other respect: 10,000 steps,
every day, forever, with a run of days cleared. It is **flat and permanent** —
it never scales up as the user improves — because it is a public-health number
rather than a personal-progress one, and conflating the two is the specific
error the design names. A missed day breaks the streak and costs nothing else.

It does **not** restate today's step count. The scene above already sets steps at
display size, and the row directly before it already names the run of days. The
walk reads `tiers->>'AGI_base'` precisely because a spread day lowers scoring
Motion's Gold and must not lower a public-health number with it. So `walkNote()`
says the one thing nothing else on the screen says: that the target is fixed.
The run of days is the figure beside it for the same reason — the target cannot
grow, so the run is the only thing that can.

**The run of days is not the personal Streak.** The Streak in the scene's HUD
reads `streaks.current_streak`; the Daily Walk run reads
`dailyWalkState().streak`. They are different values and never share a word —
`walkNote()` says "run", and a test pins it.

**Challenges** live behind `/train`, a stacked route rather than a fourth tab.
Two areas, **both off by default**, each opted into on first visit:

- **Run** — a pace over a minimum distance, e.g. *"5 km under 4:51/km"*.
- **Strength** — active calories in one session, e.g. *"410 kcal in one session"*.

The target is the **median of your own most recent qualifying sessions ±3%**,
over a 90-day window, and it is **derived fresh every time rather than stored**.
That has three consequences worth knowing as a user: it moves **both ways**, so
a quiet stretch lowers it and there is no ratchet to escape; today's session
cannot move the bar it is being judged against; and a workout Apple revises
later flows through correctly with nothing to repair.

The **first** challenge in each area only establishes a baseline — *"Log one run
of 1 km or more"* — and cannot be failed on fitness. Where a user has logged
nothing, the card stays visible and turns instructional (*"Start a strength
workout on your watch or phone before your set — that's how Kairo sees it"*),
because the gap is a habit that has not formed yet, not hardware nobody can
conjure. The accepted cost is that this card reads as unclearable to some beta
users until they change that habit.

Clearing an area pays a flat **40 XP**, once per area per local day, latched in
`finalize-days` alongside events, and sends one push. **Clearing a Challenge
still pays no points**: a run earns Motion through its steps as it always did, and
pace never enters `daily_scores` — the same posture strain takes. What did
change with deviation #41 is that the *session* is no longer inert — a workout
whose source is allowlisted **and** which carries heart-rate evidence
contributes minutes to Body's threshold shift. Both conditions, deliberately: a
quarter of a band is too much to hand to an unverified claim, and the accepted
cost is that a real workout from an obscure app that records no heart rate
shifts nothing and the UI cannot yet explain why.

## 6. Referral — "I'm doing this. Do it with me." (§9, spec'd, not yet built)

**Not in the current implementation** — no referral screens or roadmap phase exist yet; this section documents the intended design so it isn't rediscovered from scratch when the phase starts.

- Reframed away from the old "war declaration" sabotage-era pitch. The share message names the shared commitment, not a challenge: *"[Name] is going for 25 active days this month. Want in?"*
- Highest-converting moment: right when a squad starts a battle — freshly committed and naturally shareable.
- Three-layer rewards: referrer gets coins + long-term recruiter status; referee gets a coin head start, is auto-joined to the squad's running battle (kills Day-1 aimlessness), and starts at Level 2; the whole squad gets 2x XP for 3 days.

## 7. Monetization touchpoints (§10, largely V1+)

Not part of the MVP user journey today beyond what's noted above (coins/shop referenced by the battle-completion and character-progression flows are staged for V1 per `docs/roadmap.md`). See the spec for the full coin economy and Legendary subscription design before building against it.

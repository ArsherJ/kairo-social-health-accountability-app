# User Journey

What a player actually walks through, end to end. Grounded in the current implementation (`app/`, `src/`) and cross-referenced to the spec (`Kairo_Master_Summary.md`, cited as `§n`) and `docs/roadmap.md` for what's shipped vs. still planned.

**Keep this current.** A change to onboarding, the daily loop, the character screen, squads, or goals updates this file in the same pass — see `CLAUDE.md` → Tooling conventions.

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

`app/(onboard)/connect.tsx` → `app/(onboard)/character.tsx` → `app/(onboard)/name.tsx`. The spec's ordering principle, and the reason for it: iOS gives one clean shot at the HealthKit and notification prompts, so stacking every permission ask before any fun front-loads friction that costs signups.

**Health moved from fourth to first on 2026-08-17.** Asking for it after sign-in, a character choice and a name meant the first screen a new user landed on was a dashboard of zeroes — the app at its least convincing, at the moment it had just spent all its credit. `redirectTarget`'s `needs-profile` case now returns `/connect`.

1. **Connect Apple Health** (`connect.tsx`). Explains what Kairo reads and repeats the privacy line, then asks. After the sheet resolves it **reads HealthKit locally and shows today's real step count** — `readStepsToday` in `src/features/health/read.ts`, keyed to the *device* timezone because `profiles.timezone` does not exist yet. This works this early precisely because it needs no server: there is no profile row, so nothing for `health_buckets` to hang from, and the first `sync-health` call still happens after `/name`. The reveal is set exactly as the home screen's hero is — same `Numeral size="hero"`, same `accent[700]`, same display-face unit — so the home tab reads as a promise kept rather than a different screen. Zero steps and a read that throws are treated identically and neither is an error: *"We'll pick up your activity as it comes in."* A connect that actually **failed** is a different case and says so, rather than advancing to the reveal — a failure that reached that copy would be indistinguishable from a quiet phone, and the user would go on with a character powered by nothing. **"Not now" is a deferral, not a refusal** — `PermissionAsks` asks again later. This screen fires `onboarding_started`, which names the start of onboarding rather than any particular screen, plus `health_ask_completed` or `health_permission_failed`.

**The connect sequence itself is `src/features/health/connect-health.ts`, shared with `HealthAsk`.** It is five steps, not one — request, register background delivery, kick off an immediate sync, read the state back, record the event — and it lives in one module because it was paraphrased into this screen from a plan that showed only the request, and three of the five went missing silently. The costly omission was background delivery: after a grant, `readHealthPermissionState()` returns `'asked'`, so `nextPermissionAsk` never offers the sheet again and nothing else would ever have registered it. Nothing errors and nothing logs; data just arrives less often. Two callers, one function.
2. **Character, then name, within the first 60 seconds** (§5) — emotional investment before any ask. `character.tsx` shows the two character bodies and commits nothing; `name.tsx` names the one picked and is where the profile row is INSERTed — once, on the last screen. Profile-row existence (`character_name` set) *is* the onboarding-complete marker (`app/_layout.tsx` gate) — no separate flag to desync. **Every step stays before the name screen** for that reason: deviation #22 deleted the `finishingOnboarding` flag, and anything asked after the INSERT flips `resolveRoute` to `'ready'` under an unfinished screen and needs it back (deviations #27, #35).
3. **The HealthKit disclosure** the sheet shows lists **every** type Kairo requests with what each is for, rendered from `HEALTH_DISCLOSURE` rather than written out: `disclosure.test.ts` fails if it and `read-types.ts` disagree in either direction. Prose could not stay honest — the copy named four types while the app asked for eight, and iOS showed the user the true list either way, which is what made it a trust problem rather than a wording one. The `NSHealthShareUsageDescription` in `app.config.ts` carries the same list and is the one half a test cannot lock, so it changes by hand.
4. **Notifications**, requested only once a squad or a goal-in-flight gives them a reason to exist (§14) — not upfront, and after onboarding rather than in it.
5. **Body metrics (height/weight/birth year)** deferred to a persistent soft prompt in Settings ("Add your height and weight for more accurate STR tracking") rather than blocking onboarding. Height/weight feed active-calorie (STR) accuracy; birth year additionally backs the `220 - age` max-heart-rate estimate behind the Strain figure (roadmap deviation #24) — both stay optional, with sane fallbacks.

### What a new account actually sees (§5, deviations #37/#38)

**The app a first-time user meets is deliberately smaller than the app.** Someone landing on the home tab used to meet eight retention systems at once — level and XP, four ability ratings, a daily score, streaks, raw metrics, a leaderboard, long-horizon goals and squad program multipliers — before having a single day of data to read any of them against.

`disclosureStage()` in `@kairo/core` decides, from one number: how many days this account has ever scored above zero. Below `DISCLOSURE_THRESHOLD_DAYS` (3) the stage is `core`; at or above it, `full`.

**`core` keeps one loop.** The day in real units, the character and its level, the squad gap, the Daily Walk and its streak, the sync line, and a link to *How progress works*. Under the Daily Walk it says what is coming — *"Two more active days and goals, challenges and your full stat breakdown open up."* — because an empty space where a card used to be reads as a missing feature.

**`core` hides, and never deletes:** `TrainEntry`, `GoalCard`, `StatRail` and the per-stat block behind it, and the Strain/Sleep rows. **And it closes the doors, not just the entry points:** `/train` and `/goal/new` redirect home and `SquadGoalPanel` renders nothing, because push routing and deep links reach all three regardless of what the home screen draws. Those guards wait for the count to resolve before navigating — the stage reads `core` while it is in flight, and a Challenge push that cold-launches straight into `/train` would otherwise bounce a `full` user home.

Crossing the threshold fires `disclosure_unlocked` once, ever. The gate is on **lifetime** scored days, never a recent window: a recent-activity gate would demote someone returning from a quiet week back into the reduced app, and that is precisely the user the retention measurement is about.

A QA pass that reports Goals or Challenges missing on a fresh install is describing the design working — see `docs/mvp-scope.md`.

**MVP scope note:** ships one character class with placeholder art; the other three classes are V1 (§6). The class is internal — `profiles.class` defaults to `'hunter'` and no surface names it. **The character has no in-app noun** as of 2026-08-11 (roadmap deviation #26): it is "your character", never a Hunter. **Onboarding asks which of two character bodies you play as** (2026-08-11, deviation #27) before asking for a name; the answer is `profiles.character_body`, and it is cosmetic only.

## 3. The daily loop (§2)

```
12:00 AM local  →  Day resets for that player (per-user local day, not a shared server midnight — §2).
Throughout day  →  HealthKit background delivery syncs automatically, free and paid users alike.
Anytime         →  Open the app: Character tab, Squad tab, /train, or a goal's progress.
Any workout     →  Logged on the watch or phone, it syncs as a session and can clear a Challenge.
11:00 PM local  →  Push: "1 hour left. You're in [rank] place."
11:59 PM local  →  Day ends; provisional results shown.
~2:00 AM local  →  Day finalizes (grace window for late phone syncs) — coins + XP land.
Sunday 10 PM    →  AI weekly recap card pushed to all squads (V1+).
```

### Tapping a push lands somewhere specific

Every notification carries a destination, and as of 2026-08-14 the app acts on
it. `dispatch-notifications` sends `screen: 'squad'` or `'character'` with the
three scheduled triggers; `finalize-days` sends `screen: 'goals'` with the
`goalId` that just completed, and — as of 2026-08-15 — `screen: 'train'` when a
Challenge clears. A tap goes to the squad tab, the character tab, `/train`, or
**that goal's own screen** — the most specific destination the product has.

Three details are load-bearing rather than incidental:

- The character destination is `/`, the tabs index. It is **not** `/character`,
  which is the onboarding body picker — routing a signed-in user there would
  drop them into onboarding and have `redirectTarget()` bounce them out again.
- A tap that launches the app from terminated is not lost while the session and
  profile resolve. `useLastNotificationResponse()` retains the response, so the
  routing hook reads it when the tabs shell finally mounts, seconds later.
- A push arriving while the app is already open now shows a banner. Before
  `setNotificationHandler`, iOS displayed nothing at all in the foreground —
  which reads exactly like push being broken, and 11 PM is precisely when
  someone is likely to have the app in hand.

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

Because each player's day runs midnight-to-midnight in *their own* timezone, a squad spans multiple calendar dates at any instant — this is what makes the OFW-in-Dubai-vs-family-in-Cebu use case work at all, and it's why every score, bucket, and goal window is keyed by local date, never server time (see `CLAUDE.md` → Per-user local days).

### Engagement hooks, and how many survive with zero friends (§2)
1. **Morning FOMO** — who's ahead while you slept (solo: how long is the streak now).
2. **The commitment** — a goal in flight with a visible days-remaining count. Works with no squad at all.
3. **Night urgency** — real-time rank notification with a countdown.
4. **The floor and the curve** (2026-08-15) — the Daily Walk is the same 10,000 steps for everyone, every day, forever; a Challenge is a target set from your own recent sessions that moves as you do. Both are entirely solo, which is the point: three of these four now work with no squad at all.

## 4. The three tabs

`app/(tabs)/_layout.tsx` defines the shell every session lands in after onboarding.

### Character (`index.tsx`)
The RPG avatar and the day's/lifetime scoring surface.

- Four phone-only passive stats drive it: **AGI** (steps), **STR** (active calories), **END** (active minutes), **VIT** (hourly movement consistency — active hours with 250+ steps, not sleep; §5 explains why sleep can't be the phone-only vitality signal). **REC** (sleep) is a wearable-only bonus stat that simply doesn't appear without a wearable — zero penalty (§5, §6).
- Each stat scores independently per day (None/Bronze/Silver/Gold → 0/200/500/900 pts) plus a consistency bonus for touching multiple stats in the same day (§6). **Tier names are internal to the scoring engine only** — nothing in the UI shows "Bronze/Silver/Gold" (roadmap deviation #23). What the player sees is a numeric **ability rating** built from lifetime per-stat points, plus a guidance line in raw units that names what the effort achieves rather than what it pays ("1,240 more steps tops out your Agility today", or "Your lane · 20 more kcal lifts your Strength today"). That line has carried three vocabularies — "for Gold", then "for +400 AGI", now this — each retirement for the same reason: name something the user can recognise.
- **The hero number opening the shelf is the day in real units, not the score, as of 2026-08-15** (roadmap deviation #30). It used to be `daily_scores.total` — a four-digit integer with no unit, no label and no target — and now reads "8,412 steps · 6 active hours" instead, with the full breakdown (distance, calories, active minutes, and Strain/Sleep for wearable users) underneath in `TodayPanel`. The engine still computes the total — it still ranks the board and scores every Goal — it is simply not something a first-time user was ever able to read. Anyone curious what actually ranks them can still find out, on `app/progress.tsx`'s "Daily score" entry.
- **The stats are glyphs on the rail, not letters** (2026-08-11): a footprint, a flexed arm, a stopwatch and a heart-pulse, each over its rating. The abbreviation survives one tap down, on the expanded bars — icon, `AGI`, and "Steps and distance" together — which is where a new player learns the mapping, and in the guidance sentence, which still names the stat in words.
- **Level** is permanent XP, never resets. Two players at the same level can look different — the character's visual build follows whichever stat dominates their lifetime rollup (§6): leaner/faster for AGI, broader silhouette for STR, endurance stance for END, recovery glow for VIT, and a rare "All-Rounder" look — unpurchasable, must be earned — when all four stay within 20% of each other.
- **Strain** (roadmap deviation #24, 2026-08-10) is a derived, wearable-only, display-only figure from hourly heart rate — never stored on `daily_scores`, never ranked, never gates anything.
- **Three things move the figure, and they are independent.** `stage` (level bands) widens and deepens the ground shadow, so levelling shows whatever you grind; `dominance` changes the build's proportions and the shadow's tint per §6; and the **presence ring** carries the ability rating (`src/features/character/aura.ts`) — present from rating 5, stronger at 10, and still always on for the balanced All-Rounder, whose ring means *shape* rather than magnitude. The August QA pass reported the character as static: the first two already existed and were invisible because nothing had scored since the 9th, so level sat at 1 and dominance was null. The ring is the only genuinely new one, and it reuses an element already on screen rather than inventing a third visual language.
- A rest day scores 0 and still costs the streak, but the goal card always says how many days are left to make it up (§6) — the app is designed to still be worth opening on a bad day.
- **"How progress works"** (`app/progress.tsx`), linked from the foot of the expanded stat rail, explains the four numbers by the one thing that actually separates them — their timescale: daily score is today, ability ratings are lifetime per stat, level and XP are all-time, streak is the run of days. A route rather than a modal, because `PermissionAsks` owns the single modal the app may present. Offered at the point of expansion rather than beside the hero: expanding the rail *is* the question being asked.

### Squad (`squad.tsx`)
The optional social layer (§7).

- **Solo Mode is not a degraded state** — it's a first-class mode. Character progression, coins, and shop all work with zero squadmates. **The solo board sells possibility rather than absence, as of 2026-08-17:** the title, the one-sentence explanation of what a squad is, then **Create a squad** / **Have an invite code?**, then your own real row, then **one** empty seat. It previously opened on `1st` at 64pt over `of 1` — an ordinal whose only possible meaning is that you beat nobody — above five empty seats, which is a picture of loneliness drawn five times. One seat is a picture of what a squad looks like, and the actions sit above the board because inviting somebody is the thing to do here, not admiring a rank.
- Joining a squad: an invite link or the 6-character code, typed. Leader can rename, remove members, transfer leadership. Free tier: 6 members / 1 squad; Legendary: 15 members / 3 squads.
- **Inviting is an action, not a code to read aloud.** The invite card has a Share row, and every empty seat is itself the button — the `+` disc and "Invite your squad" were already drawn and did nothing, which is where the social loop stopped. `shareInvite()` uses React Native's own `Share`, deliberately with no clipboard dependency: the iOS sheet already contains Copy, and it puts Messenger and Viber one tap from the code, which matters more here than a "copied" toast. The message names the squad and says what Kairo is, because the recipient is not a user yet — **since 2026-08-17 by naming what they are being asked into** ("we keep each other to a daily walk. It counts steps, never your Health data") rather than describing the leaderboard to somebody with no reason to care about it yet. It is the only Kairo copy a non-user ever reads, which makes it the only place the privacy promise reaches them. Every word is spent against a hard budget: the link and the code line are 84 characters between them and a test holds the whole message under 200, so adding a clause means removing one. **Universal links landed 2026-08-17** (deviation #36). The message now carries `https://kairo-teal-nine.vercel.app/join/<CODE>` *and* the bare code, because a client that mangles the link must still leave six characters to type.

**The link is an accelerator, never an action.** `app/join/[code].tsx` fills the field in and stops: a link can be stale, belong to a full squad, or be tapped by somebody who did not mean to join, and joining is not free on a tier that allows one squad. `JoinSquadForm`'s existing preview then shows the squad's name and program before the tap that commits. Three arrivals it handles, none of them unusual — **signed out or mid-onboarding**, where the gate redirects and the code is stashed in MMKV for an hour and redeemed by `usePendingInvite()` in the tabs layout (which only mounts for a `'ready'` user, so mounting *is* the check); **already in a squad**, which gets a screen naming the one-squad rule rather than a silent redirect to a board nobody asked for; and **a link carrying no usable code**, which renders the form empty with a line saying so.
- What a squadmate can see is an **aggregate only** — never raw step counts, hourly patterns, or timestamps (§5, `squad_leaderboard()` in `CLAUDE.md`). VIT's hour-by-hour shape reveals sleep/work patterns and stays owner-only.
- **Squad programs** (`squads.program`) are the one "focus" concept left in the app — fixed at squad creation, unlike a per-player goal (see `docs/roadmap.md`, 2026-08-07 scope addition).
- **A row is rank and the gap to the row above, never a total, as of 2026-08-15** (roadmap deviation #30). `row-label.ts` composes the accessible name from rank, name, that gap, level and ratings — it stopped saying "N points" because a screen reader naming a figure the screen does not show would describe a different product. The board header still carries the program's boost chip; a row no longer needs one to explain a total it no longer shows.

### Profile (`profile.tsx`)
Settings, body-metric soft prompt, and account actions.

- **Delete account** (`app/delete-account.tsx`, migration `20260811140000`) is a route rather than an alert, gated on typing `DELETE`. It is the one action with no undo, and a two-tap dialog optimises for the person who already decided while the whole cost lands on the person who had not. It sits below Sign out so the reversible action does not compete with the irreversible one.
- The screen says what *survives*, because "everything is deleted" would be simpler and false: squad leadership passes to the longest-standing member (or the squad goes too, if you were the last), and a shared goal keeps running for everyone else with your name off it. Someone erasing an account to get out of a squad deserves to know the squad continues.

- **Notifications** (`NotificationSettingsCard.tsx`) reports whether they are on, and offers `Linking.openSettings()` when iOS has a denial on file. Re-read on every foreground, because the state can only change in iOS Settings — so returning to the app is the only moment worth checking, and reading once at mount is precisely how the QA pass ended up with a screen describing permissions the user had already revoked. It sits above Timezone deliberately: the zone follows the device and cannot silently be wrong, whereas this can.
- The card does **not** campaign for the permission back. A denial is a decision; the row's job is to make it legible and reversible. `shouldAskForNotifications` still owns the contextual ask, so an undetermined state shows no button here.
- When the permission *is* granted, a **delivery line** sits under the copy: `Delivery: registered.` It reports whether the server has a token it can address — which granting the permission does not prove, and whose absence is otherwise silent. On a development build it appends the APNs environment; on TestFlight it cannot, because that value is read from a provisioning profile App Store distribution strips out, and registration is the better answer anyway (a token cannot exist if the entitlement is wrong). On a simulator it says so, rather than reporting a failure that is not one. It ships in Release on purpose; `__DEV__` would hide it from TestFlight.

## 5. Goals (§8) — what replaced Sabotage

Sabotage was the original hook through v1.3; removed 2026-08-09. Goals are what makes the app matter past week three now: a target committed to over a window of days, scored off the same `daily_scores.total` the leaderboard already ranks on, so progress is a read-time projection — never a separately tracked number (see `CLAUDE.md` → Writes are server-authoritative).

`app/goal/new.tsx` to create, `app/goal/[id].tsx` to view progress.

- **Two metrics, and the first question the form asks.** *Daily Walks* is the default: days that cleared 10,000 steps, counted from the tier already stored on `daily_scores` — so "clear the Daily Walk 25 days out of 30" can be judged against the streak already on the home shelf before committing to it. *Points* is the advanced path and stays for anyone who wants it. This is deviation #35, and it is downstream of #30: once the ambient score left every surface outside Goals, a points target became a number nobody could evaluate, which made it arbitrary and made missing it read as the algorithm's fault.
- **Choosing Daily Walks makes the form shorter.** A walk goal counted over most days has no target to type — the bar is "cleared it", not a number — so the field is absent rather than disabled. (It stores `target: 1` as a sentinel, because the column requires a positive value; no surface ever renders it.)
- **Two shapes:** *cumulative* ("20 Daily Walks by 31 December", or "75,000 points") or *consistency* (a bar met on N of M days — the walk, or e.g. "2,500/day, 25 of the next 30 days").
- **Window:** a preset length, a picked end date, or **no end date at all**. Open-ended goals are cumulative-only — enforced at the database level, because "clear the bar eventually" can never become unreachable, so there's nothing for a pace marker to fail against (roadmap deviation #21).
- **Personal or squad-shared.** A squad goal's roster is frozen at creation — "everyone must hit it" only means something against a denominator that can't move mid-window.
- **Fixed at creation** apart from title/description. Abandoning is the escape hatch; it's a distinct, visible act from quietly lowering the bar.
- **Completion is a one-way latch**, evaluated only once a day has gone `final`. A later downward revision from Apple's step count never revokes a goal already met (same principle as streak milestones). Reward is XP (scaled by window length, capped) plus a permanent completed-goal record on the profile — no separate badge table.

## 5b. Train (§5, deviations #32/#33) — the floor and the curve

Two mechanics, deliberately different in kind, reached from the home shelf.

**The Daily Walk** sits on the shelf itself (`DailyWalkCard`): 10,000 steps,
every day, forever, with a streak of days cleared. It is **flat and permanent** —
it never scales up as the user improves — because it is a public-health number
rather than a personal-progress one, and conflating the two is the specific
error the design names. A missed day breaks the streak and costs nothing else.

It does **not** restate today's step count. The hero above it already sets steps
at 64pt, and the guidance line already names the steps still to go — the same
figure, since AGI Gold and the 10,000 baseline are one threshold by
construction. So the card says the two things nothing else on the screen says:
that the target is fixed, and how many days in a row it has been cleared. The
streak is the display figure for the same reason — the target cannot grow, so
the run of days is the only thing that can.

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
`finalize-days` alongside goals, and sends one push. **None of this touches
scoring**: a run still earns AGI through its steps, and pace never enters
`daily_scores` — the same posture strain takes.

## 6. Referral — "I'm doing this. Do it with me." (§9, spec'd, not yet built)

**Not in the current implementation** — no referral screens or roadmap phase exist yet; this section documents the intended design so it isn't rediscovered from scratch when the phase starts.

- Reframed away from the old "war declaration" sabotage-era pitch. The share message names the shared commitment, not a challenge: *"[Name] is going for 25 active days this month. Want in?"*
- Highest-converting moment: right when a player sets a goal — freshly committed and naturally shareable.
- Three-layer rewards: referrer gets coins + long-term recruiter status; referee gets a coin head start, is auto-joined to the squad's active goal (kills Day-1 aimlessness), and starts at Level 2; the whole squad gets 2x XP for 3 days.

## 7. Monetization touchpoints (§10, largely V1+)

Not part of the MVP user journey today beyond what's noted above (coins/shop referenced by the goal-completion and character-progression flows are staged for V1 per `docs/roadmap.md`). See the spec for the full coin economy and Legendary subscription design before building against it.

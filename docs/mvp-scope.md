# What is in the MVP, and what is not

**Cite this file in any QA brief, test plan, or store-facing copy.** It exists
because the August 2026 end-to-end QA pass graded Kairo against a v1.3-era brief
and scored four sections 1/10 for features that had been deliberately removed or
deliberately deferred. That is not a product failure, it is a documentation
failure, and its cost was real: it buried the findings that mattered under
findings about a product that no longer exists.

The rule this file encodes: **a feature is in scope only if it is listed below.**
If a brief describes something that is not here, the brief is stale.

Authorities, in order: `Kairo_Master_Summary.md` (spec v1.4) for intent,
`docs/roadmap.md`'s approved-deviations table for where implementation
deliberately diverges, and this file for what that adds up to today.

---

## In scope — the current build

### In scope, and not on screen yet: progressive disclosure

**Read this before filing anything as missing.** Since 2026-08-17 (deviations
#37/#38), a new account does not see the whole app. `disclosureStage()` in
`@kairo/core` gates on how many days the account has ever scored above zero:
below `DISCLOSURE_THRESHOLD_DAYS` (**3**) the stage is `core`, at or above it
`full`.

Three surfaces are **built, tested, reachable and hidden** until then:

| Surface | Where |
|---|---|
| Challenges — `TrainEntry` and the `/train` route | `src/features/train/` |
| Per-stat ability detail — `StatRail` and the bars it expands | `src/features/character/` |
| Strain and Sleep | `TodayPanel` |

They are **not out of scope, and not deferred.** A QA pass that reports
Challenges missing on a fresh install is describing the design working, and
the correct test is to check them on an account with three scored days — or to
change `DISCLOSURE_THRESHOLD_DAYS`, which is one constant precisely so this
stays cheap to verify and cheap to reverse.

What a `core` account *does* see is the whole of `### Solo, and first-class`
below minus those rows: the day in real units, the character, its level, the
squad gap, the Daily Walk and its streak — **and, since deviation #50, the
Today tab's race card and its three quests**. Quests were built outside the
gate rather than taken out of it; nothing on the table above moved.

### Solo, and first-class
Kairo is **solo-first**. Everything below works with zero friends, and the
squad is a layer on top.

- **Character** — one of **four Philippine endemic species** chosen at
  onboarding (deviation #40, superseding #27), named by you, and changeable any
  time from Profile → Companion: Pilandok, Tamaraw, Carabao, Philippine Eagle.
  **Cosmetic only** — the choice reaches nothing in scoring, and each species'
  "affinity" names the stat it is *about*, never a bonus. Squadmates see it on
  the leaderboard and on an Event roster. It has **no in-app noun**: it is
  "your character", never a Hunter (deviation #26).
- **Three stats from HealthKit** — **Motion** (`AGI`: steps, distance), **Body**
  (`STR`: active calories) and **Mind** (`MND`: sleep), since deviations #41 and
  #51. **Say the words, never the keys.** Body, Motion and Mind are what a
  player reads and what any brief, test plan or store-facing copy must use;
  `AGI`/`STR`/`MND` are engine names that appear in the database and nowhere on
  a screen. END (active minutes) and VIT (hourly movement) are still measured
  and no longer scored: they survive as **threshold shifts**, lowering Body's
  and Motion's bands by up to 25%. Mind needs a sleep source, so it is the one
  stat that can be unreachable — a day's stat points scale by
  `3 / earnable stats` for that reason, and **both daily ceilings are 4,400**. A
  wearable buys a third route to the ceiling, not a higher one. §5 and §6 of the
  spec still describe the four-stat model under its old names and are superseded
  here.
- **Ability ratings** — a numeric rating per stat from lifetime points
  (deviation #23). **Bronze/Silver/Gold still decide every day inside the
  scoring engine and are shown nowhere.**
- **Level and XP**, **streaks** with a shield, and a **strain** figure for
  wearable users that is display-only and never scored (deviation #24).
- **Three visual responses on the figure**: ground shadow by level band, build
  proportions by dominant stat, presence ring by ability rating.

### Squads
- Create or join by six-character code, up to 6 members on the free tier.
- **The Race** — the day drawn as a track, six characters running horizontal
  lanes at one shared finish line, which is `DAILY_STEP_BASELINE` and therefore
  the same 10,000 steps as the Daily Walk (deviation #46). Always on: there is
  no creation flow and nothing is stored. Ranked by **capped** steps, and the
  cap is the anti-cheat — past the line, extra steps buy nothing.
- With no squad, you race **your own recent days** as ghost figures. Days that
  scored nothing are dropped rather than raced.
- The **board** survives underneath the track, Today and Yesterday, weighted at
  read time by the squad's fixed **program** (deviation #11/#12). The race and
  the board are two orderings over one payload.
- Share the invite via the system share sheet; empty seats are the affordance.
- **Invite links** — `https://kairo-teal-nine.vercel.app/join/<code>` opens the app with the code
  filled in (deviation #36). The code is seeded, never auto-submitted, and
  manual entry stays for anyone whose chat client mangles the link.
- Leave, with succession — the squad outlives its leader.

### Events — the Battle, which replaced Goals

**Goals are OUT as of 2026-08-25** (deviation #45). Nothing renders one, no
route reaches one, and the `goals` table is now `challenge_events`. A brief
describing a goal card, `/goal/new` or a squad goal panel is describing a
product that no longer exists.

- **Battle is IN.** One pooled fight per squad, measured in **active
  calories**, over a window the squad picks. One bar, everybody's effort in
  it — the reversal of squad goals' per-member N-of-M (deviation #48), and the
  reason the mechanic exists: the strong member carries, and being carried is a
  reason to be in a squad.
- **Every member on the frozen roster is paid when the bar fills**, including
  one who contributed nothing. That is the mechanic, not a bug to report.
- The boss's HP is **derived from the squad's own trailing fortnight and then
  fixed** (deviation #49). It does not move mid-fight, unlike a Challenge
  target, which is re-derived on every read. Both behaviours are correct; a
  brief that expects one from the other will file the wrong finding.
- Lives on the **Squad tab**, not the character screen, and is **not
  disclosure-gated** — a new member sees the fight their squad is already in.
- **Adventure is OUT**, with a stated reason: it is the same engine with
  `distance_m` instead of calories, and it ships once the engine is proven
  live. The schema carries the kind and the metric already, so the migration
  happened once rather than twice — but nothing can create one, so nothing
  tests one.
- **Personal Events are OUT and will stay out.** `events_need_squad` rejects
  them. A personal fight is a Challenge, which already exists on `/train`.

### Today — the tab, and quests

Since 2026-08-25 (deviation #50) Kairo has **four tabs — Character · Today ·
Squad · You** — and the daily loop lives on the second. The Today tab is, in
order: a **race summary card**, **three quests**, the **Daily Walk**, and the
**Challenge door**. The character screen kept its hero, the TODAY panel, the
sync status and the disclosure note, and shed the last two.

- **Three quests a day**, from a hand-authored catalogue at three difficulty
  tiers. They are **derived, never stored**: a pure hash of (account, local
  date, tier), so the local-midnight reset needs no job and no row, and only
  the *completion* is stored. Metrics are steps, active calories, active hours,
  distance and sleep minutes — all figures the app already reads, so **no quest
  widens what Kairo collects**.
- **XP is deliberately small**: three quests cap at 60 together against a
  `MAX_REALISTIC_DAILY_XP` of 200. A quest is a garnish on the loop, never a
  cheaper route through it.
- **Difficulty is auto-assigned from how long the account has been here** — a
  count of days that scored, which measures engagement rather than fitness —
  with a **manual override in Profile that wins outright**. The override is in
  Phase 1 rather than deferred precisely because the automatic rule is wrong by
  construction for part of the cohort.
- **Quests are outside the disclosure gate**, and are the only thing that is. A
  brand-new account with zero scored days sees the race card, three quests and
  the Daily Walk on day one. **The gate's own subject list did not shrink** —
  Challenges, the stat rail and Strain/Sleep all stay in it.
- **No coins.** A currency with no sink is a countdown to disappointment.
  Quest completion pays XP.

Quest XP is a **fourth source** on `profiles.total_xp`, alongside daily scores,
Event completions and Challenge completions. Any brief describing XP as coming
from days and Events alone is stale.

### Train — the Daily Walk and Challenges
- **Daily Walk** — 10,000 steps a day, **on the Today tab** since deviation #50
  (it was on the home shelf before), with a streak of days cleared. **Flat and permanent**: it never scales up as the user improves,
  because it is a public-health number rather than a personal-progress one. A
  missed day breaks the streak and costs nothing else — there is no penalty.
- **Challenges** — one live target per opted-in area, on `/train`
  (deviation #33):
  - **Run** — a pace over a minimum distance, both moving with the user.
  - **Strength** — active calories in a single session.
- The target is the **median of your own recent qualifying sessions ±3%**,
  derived fresh from stored workouts and never stored as a level. It moves
  **both ways**: a quiet stretch lowers it. The first challenge in each area
  only establishes a baseline and cannot be failed.
- **Both areas are off by default.** A non-runner never sees a Run target.
- Clearing one pays a flat 40 XP, once per area per day, and sends one push.
- **Pace and session calories never touch scoring**, and a Challenge pays no
  points — they are display-and-challenge signals only, the same posture strain
  takes (deviation #24), and a run still earns Motion through its steps. One
  qualification since deviation #41: a workout **session** is no longer inert.
  Minutes from a session whose source is allowlisted *and* which carries
  heart-rate evidence lower Body's bands. The pace and the calories still do
  not.

### Account
- **Sign in with Apple** — the only provider a Release build offers. Moved in
  scope on 2026-08-12, when Developer Program enrolment came through; the app
  side is built and the portal configuration is a checklist in
  `docs/sign-in-with-apple.md`.
- Anonymous sign-in **in development builds only**.
- In-app **account deletion** with cascade (`20260811140000`).
- Notification permission asked in context, with a status row in Profile.

### Privacy, which is a design constraint rather than a feature
Squadmates see scores, ability ratings and streaks. **As of deviation #47 they
also see four daily totals — steps, distance, active calories and sleep
duration — and only behind an explicit consent gate that is per row and
reciprocal:** a member's totals are visible when that member has consented
*and* the viewer has. Consent is asked at squad create and join, with a decline
path, and existing members are asked once per launch because they joined under
the previous model.

What squadmates still can never reach: **hourly movement, heart rate, workout
sessions, pace, routes and timestamps.** `squad_leaderboard()` sums a day and
never selects or groups by the hour column — the difference between a total and
a movement pattern — and `profiles` is owner-readable only.

This paragraph used to say squadmates "can never reach raw steps". That is no
longer true, and a stale privacy claim is the worst kind, so the line is
rewritten rather than annotated. **Still outstanding and blocking launch:** the
privacy policy and the App Store privacy answers are updated in the same pass
before any outsider joins a squad. HealthKit data disclosed to other users
engages App Review guideline 5.1.3.

---

## Out of scope — and why

Each of these has been **decided**, not forgotten. Do not treat their absence as
a regression.

| Not built | Why | Where it is recorded |
|---|---|---|
| **Sabotage** — items, targeting, deployment, feed, protection | **Removed 2026-08-09.** It was the original premise and §20 called it non-negotiable, which is why it took a spec version bump to v1.4 rather than a quiet deletion. Goals replaced it, and the Battle replaced Goals in turn on 2026-08-25. | Deviation #17 |
| **Character morphing, gear slots, Rive animation** | V1. The art is not commissioned; §15 scopes the MVP to *static* placeholder art, and pulling in an animation runtime for a placeholder is the wrong trade. The three responses listed above are what exists. | §15, `CharacterFigure.tsx` |
| **Anything the species choice is not** — per-species evolution art, skins, battle frames, a roster past four, a *mechanical* affinity bonus, and animation beyond React Native `Animated` | Deliberate, and each one for its own reason. One artwork per species is what makes four species affordable, and it works because the figure's three responses are already code — a per-stage or per-dominance set is ~96 assets nobody will maintain. A mechanical affinity would rescore history, since `daily_scores` is replayed from stored buckets, so it is a migration rather than a tweak. No new dependency was added for motion: `react-native-svg`, Rive and Reanimated all stay uninstalled. | Deviation #40, spec §13 |
| **Referrals, "war declarations", reward tiers** | Spec'd, never built. The squad invite code is membership plumbing, not a referral system — it has no attribution and no reward delivery. | §9, roadmap |
| **Coin packs, the shop, Legendary subscription, AdMob rewarded ads, purchase restoration** | **This beta is explicitly non-monetized.** There is no IAP, no paywall, no ad, and therefore no predatory gating — and also nothing proven about purchase, refund, restore or entitlement recovery. Remove all pricing from any release criteria. | §10, deferred to V1+ |
| **Routines** — a scheduled weekly commitment shared with a squad, with each member held to their own Challenge bar | **Designed and deliberately not built** in the 2026-08-15 pass. It was a third mechanic beside Goals and Challenges; Goals have since become the pooled Battle, so two of its three open questions have moved rather than closed — how a Routine-level shield and Challenge-level ease coordinate on one missed week, and where it would surface relative to `SquadEventPanel`. The third, a squad-level `required_members` default, is **gone with N-of-M**. | Deviation #33, spec §9 |
| **Android App Links** | iOS first. An `assetlinks.json` would sit beside the association file in `web/` when Android arrives. | Deviation #36 |
| **Android** | iOS first. | §15 |

---

## Vocabulary

Getting these wrong in a brief produces findings about things that do not exist.

| Say | Not |
|---|---|
| Race | daily leaderboard *(the track is the surface; the board is what it re-ranks)* |
| Event, and **Battle** for the one kind that ships | goal, squad goal, target |
| Challenge | *(only on `/train`, and only for the personal one — never for a squad's Battle)* |
| boss, its HP | goal target, required points |
| your character | Hunter, avatar |
| squad | barkada, party, clan |
| ability rating | tier, Bronze/Silver/Gold *(internal to scoring; no surface renders them)* |
| daily score | points, today's XP |
| program | focus *(`profiles.focus` was dropped; `squads.program` is the only focus concept)* |
| **Today** | the fourth tab. Not "home", not "daily" — the character screen is where the app opens |
| quest | daily task, mission, chore *(three a day, on the Today tab, derived and never stored)* |

The one exception used to be the **art-direction prompts** in
`scripts/generate_swap_assets*.py` and §20's "dark fantasy hunter aesthetic"
brief, which were listed here as an open decision for the art regeneration to
settle. **Deviation #40 settles it**: the direction is flat vector, bold
outlines, colourful, and the subject is an animal. Those prompts are stale like
anything else that says Hunter.

---

## Before calling anything "MVP ready"

Readiness is not a score out of ten; it is this list. Open items as of
2026-08-14:

- [x] **Sign in with Apple in a Release/TestFlight build** — done 2026-08-14,
      exercised on real hardware from a TestFlight install. Both halves that
      live outside git (the App ID capability and the ES256 client secret) are
      in place; the secret's expiry is the thing to diary. See
      `docs/sign-in-with-apple.md`.
- [x] **Push delivery proven end to end** — done 2026-08-14: registration →
      dispatch → APNs receipt → banner → tap routing in all three app states,
      plus a real `dispatch-notifications` run returning
      `{"candidates":1,"sent":1,"failures":[]}`. The client half was **missing
      entirely** until that day — the server had been sending `screen`/`eventId`
      in every push since the engine shipped and nothing read it. Built as
      `src/features/notifications/routing.ts`; the APNs key is uploaded to
      Expo; re-runnable via `supabase/scripts/send-test-push.mjs`. Full account
      in `docs/roadmap.md`.
- [x] **Invite redemption with two real accounts** — done 2026-08-14: redemption
      by code, live board reordering with no pull-to-refresh, `SlotUnlockReveal`
      animating, and `leave_squad()` + rejoin verified against the **hosted**
      auth schema. Re-runnable via
      `supabase/scripts/rehearse-squad-join.mjs`. One gap left open
      deliberately: **leader succession on hosted auth**, which cannot be
      exercised on a live squad without handing it to a throwaway account.
- [ ] **A physical-device pass**: offline, background overnight, reinstall, Dynamic Type, VoiceOver, battery.
- [x] Health ingest reconciles, and says how fresh it is.
- [x] Every requested HealthKit type disclosed, test-locked against the request list.
- [x] In-app account deletion, verified against the live project.
- [x] Reproducible Xcode builds.

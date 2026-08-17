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
#29/#30), a new account does not see the whole app. `disclosureStage()` in
`@kairo/core` gates on how many days the account has ever scored above zero:
below `DISCLOSURE_THRESHOLD_DAYS` (**3**) the stage is `core`, at or above it
`full`.

Four surfaces are **built, tested, reachable and hidden** until then:

| Surface | Where |
|---|---|
| Goals — the home card, `/goal/new`, `SquadGoalPanel` | `src/features/goals/` |
| Challenges — `TrainEntry` and the `/train` route | `src/features/train/` |
| Per-stat ability detail — `StatRail` and the bars it expands | `src/features/character/` |
| Strain and Sleep | `TodayPanel` |

They are **not out of scope, and not deferred.** A QA pass that reports Goals
or Challenges missing on a fresh install is describing the design working, and
the correct test is to check them on an account with three scored days — or to
change `DISCLOSURE_THRESHOLD_DAYS`, which is one constant precisely so this
stays cheap to verify and cheap to reverse.

What a `core` account *does* see is the whole of `### Solo, and first-class`
below minus those four rows: the day in real units, the character, its level,
the squad gap, the Daily Walk and its streak.

### Solo, and first-class
Kairo is **solo-first**. Everything below works with zero friends, and the
squad is a layer on top.

- **Character** — one body chosen at onboarding (deviation #27), named by you.
  It has **no in-app noun**: it is "your character", never a Hunter
  (deviation #26).
- **Four stats from HealthKit** — AGI (steps, distance), STR (active calories),
  END (active minutes), VIT (hourly movement). **REC** (sleep) is a
  wearable-only bonus that simply does not appear without one.
- **Ability ratings** — a numeric rating per stat from lifetime points
  (deviation #23). **Bronze/Silver/Gold still decide every day inside the
  scoring engine and are shown nowhere.**
- **Level and XP**, **streaks** with a shield, and a **strain** figure for
  wearable users that is display-only and never scored (deviation #24).
- **Three visual responses on the figure**: ground shadow by level band, build
  proportions by dominant stat, presence ring by ability rating.

### Squads
- Create or join by six-character code, up to 6 members on the free tier.
- **Daily leaderboard**, Today and Yesterday, weighted at read time by the
  squad's fixed **program** (deviation #11/#12).
- Share the invite via the system share sheet; empty seats are the affordance.
- **Invite links** — `https://kairo-teal-nine.vercel.app/join/<code>` opens the app with the code
  filled in (deviation #36). The code is seeded, never auto-submitted, and
  manual entry stays for anyone whose chat client mangles the link.
- Leave, with succession — the squad outlives its leader.

### Goals — what replaced sabotage
- Measured in **Daily Walks by default**, with points as the advanced path
  (deviation #35). A walk goal counts days that cleared 10,000 steps and
  ignores the score, so its target is answerable from the streak already on
  the home shelf.
- Cumulative or consistency, personal or squad-wide, over a fixed window,
  a date you pick, or open-ended (deviation #21).
- Squad goals are **per-member N-of-M**: each member must hit the target
  individually. Not a pooled total.

### Train — the Daily Walk and Challenges
- **Daily Walk** — 10,000 steps a day, on the home shelf, with a streak of days
  cleared. **Flat and permanent**: it never scales up as the user improves,
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
- **Pace and session calories never touch scoring.** They are display-and-
  challenge signals only, the same posture strain takes (deviation #24) — a run
  still earns AGI through its steps.

### Account
- **Sign in with Apple** — the only provider a Release build offers. Moved in
  scope on 2026-08-12, when Developer Program enrolment came through; the app
  side is built and the portal configuration is a checklist in
  `docs/sign-in-with-apple.md`.
- Anonymous sign-in **in development builds only**.
- In-app **account deletion** with cascade (`20260811140000`).
- Notification permission asked in context, with a status row in Profile.

### Privacy, which is a design constraint rather than a feature
Squadmates see scores, ability ratings and streaks. They can never reach raw
steps, hourly movement, heart rate or timestamps — `squad_leaderboard()` has no
argument that returns them, and `profiles` is owner-readable only.

---

## Out of scope — and why

Each of these has been **decided**, not forgotten. Do not treat their absence as
a regression.

| Not built | Why | Where it is recorded |
|---|---|---|
| **Sabotage** — items, targeting, deployment, feed, protection | **Removed 2026-08-09.** It was the original premise and §20 called it non-negotiable, which is why it took a spec version bump to v1.4 rather than a quiet deletion. Goals replaced it. | Deviation #17 |
| **Character morphing, gear slots, Rive animation** | V1. The art is not commissioned; §15 scopes the MVP to *static* placeholder art, and pulling in an animation runtime for a placeholder is the wrong trade. The three responses listed above are what exists. | §15, `CharacterFigure.tsx` |
| **Referrals, "war declarations", reward tiers** | Spec'd, never built. The squad invite code is membership plumbing, not a referral system — it has no attribution and no reward delivery. | §9, roadmap |
| **Coin packs, the shop, Legendary subscription, AdMob rewarded ads, purchase restoration** | **This beta is explicitly non-monetized.** There is no IAP, no paywall, no ad, and therefore no predatory gating — and also nothing proven about purchase, refund, restore or entitlement recovery. Remove all pricing from any release criteria. | §10, deferred to V1+ |
| **Routines** — a scheduled weekly commitment shared with a squad, with each member held to their own Challenge bar | **Designed and deliberately not built** in the 2026-08-15 pass. It is a third mechanic beside Goals and Challenges, and three questions are open on purpose: how a Routine-level shield and Challenge-level ease coordinate on one missed week, where it surfaces relative to `SquadGoalPanel` and `GoalCard`, and the squad-level `required_members` default. | Deviation #33, spec §9 |
| **Android App Links** | iOS first. An `assetlinks.json` would sit beside the association file in `web/` when Android arrives. | Deviation #36 |
| **Android** | iOS first. | §15 |

---

## Vocabulary

Getting these wrong in a brief produces findings about things that do not exist.

| Say | Not |
|---|---|
| your character | Hunter, avatar |
| squad | barkada, party, clan |
| ability rating | tier, Bronze/Silver/Gold *(internal to scoring; no surface renders them)* |
| daily score | points, today's XP |
| program | focus *(`profiles.focus` was dropped; `squads.program` is the only focus concept)* |

One deliberate exception: the **art-direction prompts** in
`scripts/generate_swap_assets*.py` and §20's "dark fantasy hunter aesthetic"
brief still say Hunter. That is a genuinely open decision for the art
regeneration to settle, not a missed find-and-replace.

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
      entirely** until that day — the server had been sending `screen`/`goalId`
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

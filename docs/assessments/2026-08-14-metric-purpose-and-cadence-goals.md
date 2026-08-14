# Metric Purpose & Cadence Goals — Assessment and Plan

**Status:** Part 1 (below) is the original brainstorm and stands as written.
**Part 2 (end of file) records founder decisions on solo mode** — walking,
strength, running, and the adaptive-challenge engine are settled. **Squad
alignment is still open** and is the next pass. Nothing here overrides
`Kairo_Master_Summary.md` or `docs/roadmap.md`'s approved-deviations table on
its own — this is the staging ground, on the precedent of
`docs/assessments/2026-08-06-onboarding-and-program-selection.md`, which went
through the same "assessment → founder decision → roadmap deviation" path and
carries its own decisions in a "Part 2" the same way.

**The founder's framing, condensed:** the app shows numbers without saying what
they're *for*, and Goals (§8) are too abstract — a goal is just "N points by a
date," disconnected from which activity earned them. Walking is different from
running and gym in one specific way that matters: you can walk every day
indefinitely (it's low-impact, and the app already treats 10,000 steps/day as a
real ceiling — see below), but running and gym need rest days, so a goal built
from them should look like a **weekly schedule**, not an open point total. And
scheduling a routine together is a squad thing, because commitment is easier
to keep when someone else is watching you keep it.

---

## 1. Where this stands today

### 1.1 The "senses" gap is real, but not total

The app already has more sense-making than it might feel like from the inside,
and the gap is narrower — and more specific — than "numbers with no meaning":

- `resolveStatDetail()` (`src/features/character/stat-detail.ts`) already turns a
  raw stat into a sentence in the stat's own unit — "1,240 more steps for +400" —
  rather than a naked number or a tier name.
- `laneEmptyCopy()` (`src/features/character/lane.ts`) already speaks the
  activity, not the stat: *"Your next walk or run fills this bar."*
- `goal-copy.ts`'s `statusLine()` already says "behind pace" instead of a bare
  fraction.
- `program-copy.ts` already frames a squad's program as what it's "actually
  competing on."

What's missing is the layer underneath all of that: **why the app thinks any of
this matters, medically.** The spec itself has this reasoning and never ships
it. §5 explains *why VIT is hourly movement instead of workout volume* —
"sedentary behavior across the day is one of the strongest predictors of
long-term health decline, regardless of how much you exercise in one
session" — in a paragraph a user will never read. The app tells you your VIT is
Gold. It never tells you the sentence above, which is the actual reason to
care about VIT at all. Same shape for AGI: the tier table already treats
**10,000+ steps as the ceiling band** (`Kairo_Master_Summary.md` §6, "AGI —
Steps," Gold = 10,000+), which is the same number the founder is describing as
the walking baseline — the app already has a scientific opinion baked into the
scoring engine and has just never said it out loud.

So: the fix here is not a new mechanic. It's surfacing reasoning the product
already has, next to numbers that already exist.

### 1.2 Goals are activity-blind by construction, and that's the real "vague"

`packages/kairo-core/src/goal.ts` scores a goal off `daily_scores.total` — the
same **blended** number the leaderboard ranks on, deliberately (deviation #18,
so a goal can never leak a raw step count). That has a side effect the founder
is pointing at: a goal has no opinion about *which* stat earns it. A "run 3x a
week" goal, if someone made one today, would in practice also be satisfied by
someone who never ran and instead walked a lot, gymmed, or slept well — because
`total` doesn't know which of AGI/STR/END/VIT/REC produced the points. There is
no way, today, to say "this commitment is about steps" or "this commitment is
about strength."

Two shapes exist — `cumulative` (a running total by a date) and `consistency`
(clear a daily bar on N of M days of a **fixed window**) — and neither has a
notion of a week, a rest day, or a specific weekday. `consistency` gets closest
(N of M) but M is "days in the window," evaluated day-by-day with no repeating
structure — a 30-day window needing 25 days doesn't distinguish "25 in a row"
from "25 with every Sunday off," it just needs 25 out of 30 wins, wherever they
fall. There's no way to say "only Monday, Wednesday, Friday count," and no way
to say "any 3 days a week, forever" without hand-picking an end date.

One more structural fact worth naming: **the open-ended goal shape
(`endsOn: null`) is cumulative-only**, enforced by
`goals_consistency_needs_end` in the schema. That means the current Goal model
*cannot* express "hit 10,000 steps every day, forever, resetting each day" even
if someone tried — open-ended goals don't reset, they accumulate. That's a real
constraint, not an oversight, and it's why §2 below recommends the daily walk
baseline not be built as a `goals` row at all.

### 1.3 The adjacent mechanic already half-built: squad programs

`squads.program` (deviation #12, `packages/kairo-core/src/program.ts`) already
encodes almost exactly the split the founder is describing, one layer down:
`running` boosts AGI, `gym` boosts STR, `walking` boosts VIT, each ×1.5 at
**read time only** on the leaderboard. This is continuous weighting, not a
schedule — a running-program squad doesn't ask anyone to run on specific days,
it just makes steps worth more all week — but it's the existing precedent for
"this squad's whole game is about one stat," and cadence goals (§3 below)
should sit on top of it rather than reinvent the stat mapping. It's also why
`walking` doesn't need a cadence goal of its own: the founder's own framing —
walk every day, no rest days — is what `program: walking` already assumes, and
what the daily baseline in §2 covers solo.

One more precedent worth naming: **N-of-M squad streaks were already spec'd
and deliberately deferred to V1** (roadmap deviation #16 — "§15 lists 'Streak
system + milestones (incl. N-of-M squad streak)' under V1, and only the
roadmap phase ever treated it as MVP"). A weekly cadence commitment — "3 of the
last 6 weeks, everyone hit gym 3x" — is structurally the same shape as an
N-of-M squad streak with a weekly grain instead of a daily one. That's not a
reason not to build it; it's a reason to know this proposal is picking up
scope the roadmap already named and set aside, not inventing something novel
from nothing.

---

## 2. Give metrics a "why" — three cheap moves, no schema change

All three are copy-and-composition work over data that already exists, in the
same modules that already do this job (`stat-detail.ts`, `lane.ts`,
`goal-copy.ts`). None of them touch scoring, storage, or `kairo-core`'s public
shape.

1. **A one-line health rationale per stat**, next to the existing gap-to-next
   guidance. A `STAT_WHY: Record<CoreStat, string>` beside `STAT_UNITS` in
   `stat-detail.ts` — e.g. AGI: *"Steps are one of the strongest single
   predictors of long-term health."* VIT: *"Moving every hour matters more
   than one long workout — sitting still the rest of the day is its own risk,
   independent of exercise."* This is literally the §5 reasoning above,
   shortened to a sentence a character screen can carry.
2. **Name the baseline, not just the rank.** Ability ratings and tiers only
   ever answer "how do I compare" (to my own history, or to my squad). Nothing
   today answers "am I doing enough by an outside standard." Surfacing
   "10,000 steps" as a labeled line — not just the invisible edge of the Gold
   band — gives a number a target that isn't relative to anyone.
3. **Say the day, not just the total.** "3,200 pts" is a game number. "You
   moved through 9 of your day's hours, and hit Gold on steps" is a sentence
   about a day a person actually lived. `resolveStatDetail` already has every
   input this needs; this is a composition change on the character screen, not
   new data.

None of this needs a founder decision — it's in the spirit of copy the app
already ships, and it's the cheapest, highest-leverage piece of this proposal.

---

## 3. Redesign goals around how the activities actually work

Two separate mechanisms, because they solve two different problems and forcing
them into one shape is exactly what made the current Goal feel generic.

### 3.1 Daily Walk — solo, always-on, no window, no schema change

**Recommendation: don't model this as a `goals` row.** §1.2 already showed the
existing shape can't express "every day, forever, resets daily" — open-ended
goals are cumulative and never reset. Trying to bend the Goal abstraction to
fit would mean either a new goal kind for a target that isn't really a
*commitment with an end state* (it never completes, it just repeats) or a
special-cased always-recreated row, both of which are more machinery than the
thing needs.

Instead: a **first-class "Daily Walk" element**, read directly off the AGI
total already synced today and the **existing 10,000-step Gold threshold** —
zero new HealthKit reads, zero new scoring, zero new tables. It's a
presentation layer over data and a threshold that already exist, in the same
way the character screen already reads `resolveStatDetail`. This is the
fastest win in this whole proposal and ships independently of everything
below.

### 3.2 Cadence goals — squad, scheduled, rest days by construction

A new `GoalKind`, provisionally `'cadence'`, for "commit to a routine on a
schedule" — the shape running and gym actually need.

**What it targets.** Unlike today's goals (scored off blended
`daily_scores.total`), a cadence goal targets **one stat**, taken from the
squad's program the same way the leaderboard boost already is:
`running → AGI`, `gym → STR`. This closes the exact gap in §1.2 — "a run goal
that a walk can satisfy" — for free, by reusing a mapping that already exists
rather than inventing a new one.

**The schedule.** Two shapes, matching what the founder described:

| Shape | Reads as | Rest days |
|---|---|---|
| `weekdays: ['mon','wed','fri']` | "Gym on Monday, Wednesday, Friday" | Every other day is structurally outside the goal — never evaluated, never a miss |
| `timesPerWeek: 3` | "Run 3 times a week, any days" | The other 4 days are never asked about — hitting 3 satisfies the week regardless of which 3 |

Both share the property the founder named as the point: **a rest day is not a
missed day.** It's a day the goal never looks at, the same way `consistency`
today never penalizes a day outside its window — this just makes the "outside"
a weekly pattern instead of a date range.

**"Met," two levels.** A day meets the goal if the target stat clears its bar
(reuse `nextTierFor`'s bands, or a custom number the same way `consistency`
takes a custom `target` today). A **week** meets the goal if enough scheduled
days cleared it (all of them, for `weekdays`; the count, for `timesPerWeek`).
The whole goal meets it as **N of M weeks** — the same N-of-M shape
`evaluateSquadGoal` already uses for "everyone must hit it," just counting
weeks instead of members. That symmetry is worth keeping; it means one mental
model covers both axes instead of two.

**Squad-shaped, matching the ask.** Same roster-frozen-at-creation rule as
today's squad goals (§8's "everyone must hit it," deviation on record). A
cadence goal is squad-only in this proposal, on purpose — the founder's own
framing was "challenging each other again to commit," and a schedule kept
alone doesn't need the machinery this adds (see the open decision below,
though — this is worth confirming rather than assuming).

**A fork worth deciding before this gets specced further:** what does
"gym Wednesday" actually *verify*? Two honest options:

- **(a) Cheap, ships fast:** the target stat cleared its bar that day —
  exactly what a cadence goal needs and no more. A phone-only user's STR
  points come from estimated active calories regardless of *why* they moved,
  so "gym on Wednesday" really means "you did something that burned enough
  calories on Wednesday," not "HealthKit saw a strength-training session."
  Honest about what the data already is (the gym-squad accuracy note in
  `program-copy.ts` already admits this same limit today), zero new HealthKit
  surface, buildable on top of what `sync-health` already stores.
- **(b) Higher-fidelity, real scope:** read HealthKit's actual workout
  sessions (`HKWorkoutActivityType.running`, `.traditionalStrengthTraining`,
  etc.) and require a session of the right type on the scheduled day. This is
  closer to what "commit to running Mon/Wed/Fri" *means* in plain language,
  but it's a new read type, new ingest/storage (today's anti-cheat check
  reads workout-session presence transiently and throws it away — see §5's
  "Anti-Cheat Approach" — it was never persisted), and a real Phase-3-sized
  slice of work, not a goal-schema change.

This doc recommends **(a) for a first version** — it's consistent with how
REC/strain and the gym accuracy note already handle "the data is what a phone
can see, and we say so" — with (b) named explicitly as the natural next step
if cadence goals land well and phone-only fidelity turns out to matter. But
this is a real product call, not an engineering default, and is listed below
rather than decided here.

---

## 4. What this would touch, if approved

Sized to name the shape of the work, not to plan it — that's the next pass,
after the open decisions below are closed.

- **§2 (metric "why" lines):** `src/features/character/stat-detail.ts`
  (`STAT_WHY` table), character screen composition. Copy only.
- **§3.1 (Daily Walk):** a component on the character/today screen reading
  existing AGI totals against the existing 10,000 threshold. No `kairo-core`
  change.
- **§3.2 (cadence goals):** the larger piece —
  - `packages/kairo-core/src/goal.ts` — a new `GoalKind`, a schedule type, and
    `evaluateCadenceGoal()` alongside `evaluateGoal()`, tested the way every
    other branch in that file is (table-driven, no clock reads).
  - Schema — `goals` gains schedule columns (or a linked table), a migration
    plus the corresponding `goals_validate()` trigger changes, mirroring how
    deviation #21's date picker widened `goals.ends_on`.
  - `supabase/functions/_shared/goal-plan.ts` — the finalize-days goal pass
    needs to resolve weekly completion, not just window completion.
  - `CreateGoalForm.tsx` — a schedule picker (weekday multi-select or a "times
    a week" stepper) alongside the existing kind/window choices; almost
    certainly its own screen state rather than a third row on the existing
    form, given how much that form already carries per hand-testing
    (deviation #21's "no submit button visible" lesson).
  - `SquadGoalPanel.tsx` / `goal-copy.ts` — new copy for "3 of 6 weeks," a
    weekly rather than daily meter.

## 5. Sequencing

Everything in §2 and §3.1 is small, additive, and ships independently —
reasonable to pull into the current pass. §3.2 (cadence goals) is a real
feature, not a tweak: new `kairo-core` surface, a migration, a planner change,
and new UI, on top of Phase 10 (Goals), which the roadmap already marks
mostly-done ahead of the TestFlight beta. Recommend treating it the way
deviation #16 already treats N-of-M squad streaks — named now, scoped for
after the beta's first read, not squeezed into pre-beta scope. The beta's four
risk questions (`docs/roadmap.md` line 5) don't need cadence goals to be
answered; they'd benefit from real squads using the *existing* goal shape
first, which also tells us whether "too vague" is a common reaction or was
this conversation's.

---

## 6. Open decisions

1. **Verification fidelity for cadence goals (§3.2's fork):** stat-threshold-
   on-scheduled-day (cheap, honest about phone-only limits, ships fast) vs.
   real HealthKit workout-session matching (matches the plain-language
   meaning of "ran on Wednesday," real scope). Recommendation: (a) first.
2. **Solo cadence goals:** this proposal scopes cadence goals to squads only,
   matching "challenging each other again to commit." Worth confirming — some
   users will want "gym 3x/week" as a personal commitment with no squad,
   which the existing personal-goal path already supports for point totals.
3. **Where "Daily Walk" lives:** proposed as a presentation-only element off
   existing AGI data (§3.1), not a `goals` row. Confirming that's the intent
   before any UI work starts, since it changes which files are touched.
4. **Timing:** bundle §2+§3.1 into current work, and treat §3.2 as a V1-scoped
   proposal alongside the already-deferred N-of-M squad streak — or is cadence
   goals wanted sooner, ahead of the beta?

---

# Part 2 — Solo mode: founder decisions (2026-08-14)

Open decision 1 from Part 1 (verification fidelity) is answered by what
follows. Open decisions 2–4 are superseded — solo mode no longer routes
through the `cadence` `GoalKind` sketched in §3.2 at all; see §10. **Squad
alignment (how any of this attaches to a squad) is explicitly not decided
here** — that's the next pass.

## 9. Decisions recorded

- **Walking stays exactly as Part 1 proposed**: a flat, permanent, solo
  baseline at 10,000 steps (§3.1) — presentation over existing AGI data, no
  schema, never scaled up even as a user improves. It is a public-health
  number, not a personal-progress one, and the two must not be conflated.
- **"Gym" is replaced by calisthenics**: push-ups, pull-ups, squats, curl-ups
  — bodyweight, no equipment, feasible at home. This drops the squad `gym`
  program's implicit "you need a gym" framing in favor of something every
  solo user can actually do, which matters because Strength is being
  redesigned as a solo-first challenge before it's a squad one at all.
- **Running is pace-based**, not steps-based, and that is accepted as real
  scope: it requires reading HealthKit **workout sessions** (`.running`
  activity type, with distance and duration), not just the hourly buckets
  `sync-health` stores today. This is the same "(b)" fidelity fork Part 1
  flagged and left open for cadence goals — it is now committed to for Run
  specifically, and accepted as a real ingest change, not a copy change.
  Worth restating the side benefit noted mid-conversation: reading workout
  sessions is also the only reliable way to tell a **run** apart from a
  **walk** at the data layer, since both currently collapse into the same
  AGI steps/distance signal. Solving Run's data need solves that ambiguity
  for free.
- **Rep-counting (push-ups, pull-ups, squats, curl-ups by name) is real and
  buildable, but is a follow-on capability, not part of this pass.** Verified
  against a real shipped app (Puuush): Watch-motion rep counting (CoreMotion
  accelerometer/gyroscope) and camera-based rep/form counting (Apple's Vision
  framework, `VNDetectHumanBodyPoseRequest`) are both proven techniques. The
  one thing that does **not** carry over: HealthKit has no standard field for
  a rep count, so a third-party rep-counting app syncing to Apple Health
  gives Kairo nothing beyond the workout-session-and-calories signal it
  already gets from any workout — **reading another app's rep count is not
  an integration path.** If Kairo wants reps, Kairo has to count them itself,
  via one of two genuinely separate native builds:
  - a **watchOS companion app/extension** (CoreMotion + a rep-detection
    algorithm) — new native platform surface; this codebase has none today
    (iOS-only via Expo, per `CLAUDE.md`);
  - **on-device camera pose detection** (Vision framework) — no third-party
    ML dependency needed, but real bespoke rep/form logic, a live-camera UI,
    its own accuracy validation, and its own privacy story (a camera on a
    body mid-exercise is a more sensitive ask than a step count, even fully
    on-device).

  Both are named as **the most genuinely differentiated idea raised in this
  whole conversation** — neither Stompers nor Charlie (§3's named
  competitors) do verified-form calisthenics — but sized honestly: each is
  its own initiative, not a line item inside this redesign. **When either
  ships, it should slot in exactly where REC and Strain already sit**: a
  bonus/display signal, present only when the capability exists ("no Watch,
  no camera permission → the row simply doesn't appear, zero penalty" — REC's
  own rule, reused), never something competitive rank depends on. That is not
  a formality — an on-device classifier carries real false-positive/negative
  risk that accelerometer step-counting and GPS distance don't, and the app's
  whole anti-cheat posture (§5) leans on signals that are hard to fake. Bonus-
  first is how the app already handles a signal it trusts less than the core
  four stats; there is no reason for rep-counting to be the exception.

## 10. Revised solo-mode shape

Three areas, each different enough in what data backs them that they should
not be forced into one mechanic:

| Area | Metric | Scored signal today | New data need |
|---|---|---|---|
| **Walk** | Steps | AGI, as-is | None — flat 10,000 baseline, presentation only |
| **Strength** | Calisthenics effort | STR (active calories / workout-session presence) | None at first; rep-counting is a later, capability-gated bonus (§9) |
| **Run** | Pace | New — not covered by AGI today | HealthKit workout-session read (distance, duration, `.running` type) |

**None of these are a `GoalKind`.** Part 1's §3.2 sketched cadence goals as a
new `GoalKind` on the existing `goals` table; that no longer fits, because the
mechanic solo mode needs is **adaptive**, not fixed. §8's Goal invariant —
"fixed at creation... changing a target mid-window would silently re-grade
every day already counted" — is deliberate and stays true for user-authored
Goals. What solo mode wants is a target that *moves as the user's level
moves*, which breaks that invariant on purpose. That is a different concept,
not a variant of Goals, and gets its own name: **Challenges.**

## 11. The Challenges engine

System-authored, per-user, per-area (Strength and Run; Walk stays flat and
opts out of this entirely — see §9). Sketch, for the next pass to size
properly:

- A **rolling personal baseline** per area — trailing average effort for
  Strength, trailing average pace for Run — computed the same way
  `dominantStat()` already reasons over a window of stat points
  (`packages/kairo-core/src/dominance.ts`), just a different window and a
  different output.
- The next challenge sits a small, deliberate step above that baseline —
  progressive overload, not an arbitrary jump. Before a baseline exists (a
  brand-new Run user with no tracked runs yet), the challenge is a starter
  target whose job is to *establish* one, not to test the user.
- **It must be able to ease, not just tighten.** A challenge missed
  repeatedly should back off rather than keep climbing. A pure one-way
  ratchet would quietly reintroduce the exact failure mode goals replaced
  sabotage to avoid — §1's "progress is still progress" — by turning a bad
  week into a permanently harder app instead of a forgiven one.
- **Sleep/recovery as a difficulty input is real, but honestly wearable-only.**
  REC and Strain do not exist for a phone-only user — §5 is explicit that the
  REC row "simply doesn't appear — zero penalty" without a wearable. So a
  recovery-aware challenge engine can only ever apply to the subset of users
  a Watch or band covers; for everyone else, the honest behavior is that the
  app has no recovery signal and should not act as if it does. Same
  discipline as the gym-accuracy note in `program-copy.ts`.
- Architecturally this is a small new pure module in `kairo-core` (baseline
  calculation + step-up/step-down rule, table-driven and clock-free like
  everything else there), not an extension of `goal.ts`.

## 12. What's still open

Squad alignment. The one thought worth carrying into that pass, raised mid-
conversation and not yet designed: if Strength/Run targets are personalized,
a squad commitment could read as "everyone clears their **own** current
challenge N times this week" rather than one flat number for the whole
squad — which would resolve the fairness problem the original
`docs/assessments/2026-08-06-onboarding-and-program-selection.md` raised
against a literal "gym program" (mismatched squadmates competing on a target
that isn't equally hard for both of them). Not decided — next pass.

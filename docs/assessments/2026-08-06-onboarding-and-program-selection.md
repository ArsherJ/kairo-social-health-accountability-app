# Onboarding & Program Selection — Assessment and Plan

**Date:** 2026-08-06
**Status:** Decided — Part 1 is the assessment; **Part 2 records the founder's
decisions and the revised plan.** Where they disagree (notably: squad programs
moved from V1 into MVP), Part 2 wins. Nothing here is implemented yet.
**Prompted by:** "Users should choose what program they want to gamify — e.g.
running only, or running + gym. Design the architecture, critique the UX,
separate MVP from later."

This document does four things: audits the onboarding that exists today,
critiques the "program selection" idea against the spec's own design decisions,
recommends a concrete MVP-vs-later split, and lists the decisions only you can
make. Spec references (`§5`, `§15`…) point at `Kairo_Master_Summary.md`;
deviations at the table in `docs/roadmap.md`.

---

## 1. Where onboarding stands today

What is actually built (Phase 1 ✅, hand-verified on the simulator):

```
Sign in (one tap) → Name your Hunter → Character screen
                                        └─ HealthKit sheet, in context
Body metrics → soft prompt in Profile (never a gate)
Notifications → deferred until squad/sabotage exists (not yet built at all)
```

This flow is genuinely good, and better than most fitness apps ship:
character-first inside 60 seconds (§5), the HealthKit ask overlaying the thing
it powers, timezone captured at profile creation, resume-safe via
profile-row-existence as the onboarding marker. Keep all of it.

What is missing — and your instinct here is correct:

1. **The app never asks the user a single question about themselves.** No
   goal, no identity, no "what brought you here." That costs three things:
   a commitment device (self-declared goals measurably improve retention —
   Duolingo, Strava, and Whoop all open with one), a personalization signal
   (the app cannot speak the user's language: a runner and a gym-goer see
   identical copy everywhere), and — most importantly for the beta —
   **segmentation data**. §15's risk question #4 asks whether gym-goers,
   walkers, and desk workers *all* feel the scoring is winnable, and right now
   you cannot tell who is who.
2. **No value proposition before account creation.** The sign-in screen shows
   the brand and tagline only. A referred user arrives pre-sold; an organic
   TestFlight tester sees "Every day is a Kairo moment" and a button.
3. **No path from onboarding into a squad.** A user whose friend said "join my
   squad, code is 483920" must finish onboarding, discover the squad tab, and
   type the code. There is no "have an invite code?" affordance and no
   deferred deep link that carries an invite through onboarding.
4. **No first-sync "aha" moment.** After the HealthKit grant, today's history
   floods in and the stat bars fill — the single best moment in the funnel —
   but nothing announces it ("Today already counted: 4,300 steps → AGI
   Silver").

---

## 2. The "program" idea — a critique

"Choose your program" hides **three different products**. They need to be
separated before any architecture makes sense:

- **Option A — Programs as scoring modes.** The literal reading: "I only
  gamify running" means only running-adjacent stats count toward my score.
- **Option B — Programs as identity/focus.** Scoring is untouched; the app
  *presents itself* through the chosen lens — highlighted stat, copy,
  notifications, and later, suggested challenges.
- **Option C — Programs as squad challenge types.** The *squad* picks the
  game ("running squad"); everyone inside it plays the same game.

### Why Option A is the wrong MVP — four independent reasons

**A1. It breaks the leaderboard, which is the product.** Squad comparability
is the entire competitive loop. If one member scores only AGI and another
scores all four stats, their totals are not comparable; the moment you
normalize them, you have invented a handicapping system — inside an MVP whose
explicit purpose (§15, risk question #4) is to test whether *fairness
perception* survives contact with a real barkada. Self-selected programs are
self-selected difficulty, and the group chat will notice.

**A2. The existing scoring already IS the multi-program answer.** This is the
part of the spec worth defending hardest. The four-stat tier design (§5, §6)
was built precisely so that every lifestyle has a winnable lane:

| "Program" | The lane that already exists |
|---|---|
| Running | AGI gold (steps + distance) + END + VIT ride along for free |
| Gym | STR gold (active calories) — the §5 worked example "gym day, low steps" lands at 2,900 pts |
| Walking / everyday movement | AGI + VIT (hourly consistency) |
| Desk worker trying to move more | VIT is *specifically designed* for them |

A user who only runs and never gyms already scores 2,000+ on a run day. The
consistency bonus rewards breadth without requiring it. In other words: the
product already contains programs — they're called stats — and what's missing
is not mechanics but **the app telling the user which lane is theirs**.

**A3. Phone-only "gym" detection is weak, and the spec knows it.** Principle
#2 (§20) is *zero manual input for competitive metrics*. A phone in a gym
locker or lying on the bench during a lifting session records almost nothing:
no steps, unreliable calorie estimation, and no workout sample unless the user
logs one in Apple Fitness or wears a watch. A "gym program" that claims to
score gym sessions must either accept manual logging (breaking principle #2
and the entire social anti-cheat posture — a manual entry is trivially
fakeable) or require wearables (excluding most of the PH market). STR-as-proxy
is the honest compromise the spec already made. Related open risk: roadmap
Phase 3 flags that `AppleExerciseTime` may be Watch-only in practice — if END
reads zero for phone-only users, the gym-goer's lane narrows to STR alone and
the fairness risk *rises*. The focus data from §4 below is how you'd see that
happening.

**A4. It multiplies the server surface for unproven value.** Scores are
*replayed*, never adjusted (§12) — so a per-user scoring config can't be a
mutable column, it must be a dated history ("which program was active on that
day"), or replays become retroactively wrong the moment someone switches
program. That config then threads through `kairo-core`, `sync-health`,
`finalize-days`, and `squad_leaderboard()`. That's a V1-sized project bolted
onto a beta that exists to answer four questions, none of which need it.

### What is right in the instinct

The gap is real — it's just an *onboarding and identity* gap, not a *scoring*
gap. Asking "what do you want to level up?" costs one screen, produces the
segmentation §15 needs, gives every piece of copy in the app a voice, and — if
the beta later proves people genuinely want scoped competition — becomes the
demand signal that justifies building Option C or A properly.

---

## 3. Recommendation

### MVP: Option B — "Focus areas," a pure identity layer

One new onboarding screen after naming the Hunter:

> **"How do you want to level up?"**
> ▢ Running  ▢ Gym & workouts  ▢ Everyday movement  ▢ Just getting healthier
> *(multi-select chips, skippable, changeable anytime in Profile)*

What it drives in MVP — all cheap, all presentation or telemetry:

- **Character screen:** the focus stat gets a "your lane" treatment and the
  empty state speaks the user's language ("Your next run fills this bar"
  instead of generic copy).
- **HealthKit sheet copy** echoes the choice ("Kairo reads your runs from
  Apple Health to power your Hunter").
- **Telemetry:** the selection (or skip) lands in `app_events` and on the
  profile row, so D7/D21 retention and the fairness interviews can be
  segmented by declared lifestyle. This is the biggest single win: it is beta
  instrumentation disguised as personalization.
- Later, notification copy (streak-at-risk, day-end) once §14 lands.

What it must **not** drive in MVP: scoring, XP, the leaderboard, sabotage —
nothing numeric. One sentence in the UI should say so explicitly, because
managing expectations is the whole trick: *"Every stat still counts. Focus
changes what Kairo highlights for you — not the score."*

Why this is safe where Option A isn't: it's reversible. If the beta funnel
shows drop-off at this screen, delete it — nothing downstream depends on it
structurally.

### V1: Option C — squad programs, riding the featured-stat machinery

This is where the "program" idea earns real mechanics, and the codebase has
already paid for most of it:

- `kairo-core` already implements stat weighting — the weekly featured stat's
  1.5× multiplier. A "Running squad" is structurally *a permanent featured
  stat chosen by the squad*.
- §10 already promises Legendary "custom squad challenges (set your own
  rules)" — squad programs are the simplest coherent version of that perk.
- **The architecture gift:** `daily_scores` stores per-stat points as separate
  columns, and `squad_leaderboard()` is already the only projection squadmates
  ever see. Squad weighting can therefore be applied **at read time in the
  RPC**, over stored per-stat points — no stored score changes, no
  replay-history problem, and one user in three squads (Legendary) sees three
  differently-weighted boards with zero data duplication. Comparability is
  preserved because everyone on a given board carries the same weights.
- One design decision to settle in the V1 spec, not now: stored per-stat
  points are *post*-weekly-multiplier, so squad weights and the weekly
  featured stat interact (stack? replace? squads with a program opt out of
  the rotation?). Flagged so it isn't discovered mid-build.

### V1.5+: Option A — only if the data demands it

Per-user scoring programs, program-scoped leaderboards, or running-specific
quests (weekly mileage, pace goals) become worth considering only when: (a)
focus telemetry shows a large single-focus population, (b) their churn or
interview feedback shows the universal score genuinely doesn't serve them, and
(c) wearable penetration or workout-type data (workouts are already ingested
as `hadWorkout` markers for anti-cheat; the sample carries an activity type
that is currently discarded) can verify the activity passively. Even then,
prefer shipping it as *quests/challenges layered on top* of the universal
score rather than a fork of it.

---

## 4. Proposed MVP onboarding flow, screen by screen

```
1. Sign-in          — ADD 2 lines of value prop under the tagline.
2. Name your Hunter — unchanged.
3. Focus screen     — NEW. Multi-select chips, skippable, ~10 seconds.
4. Character screen — HealthKit sheet as today; copy may echo focus.
5. First-sync moment— one-time callout when the first sync lands:
                      "Today already counted: 4,300 steps → AGI Silver."
6. Squad entry      — low-key "Have an invite code?" affordance on the
                      solo board, NOT an onboarding gate.
```

Design rationale and self-critique:

- **Focus sits after naming, before HealthKit.** The question is
  identity-flavored, so it extends the emotional investment §5's ordering is
  built on, and its answer improves the framing of the very next ask
  (HealthKit). Total cost to the 60-second target: one tap-tap-continue
  screen, roughly 8–12 seconds.
- **The steelman against adding any screen:** every onboarding step costs
  completion percentage, and §5 fought hard to strip friction. Mitigations:
  chips not forms, skippable without penalty, no free text, and a kill
  criterion — if funnel telemetry shows meaningful drop-off at this screen,
  remove it (removal is free because nothing structural depends on it).
- **Squad joining stays out of onboarding.** Solo mode is the designed funnel
  (§7) and the locked slots are the standing ad for it; gating onboarding on
  squad choice would resurrect the cold-start problem Solo Mode exists to
  kill. For the TestFlight beta, squads are hand-assembled anyway. The
  deferred deep link (invite link survives install + onboarding, auto-joins at
  the end) belongs to V1's referral system — spec it there, don't build it
  twice.
- **Class selection stays cut** (§6 v1.3: Hunter only). The focus screen is
  *not* class selection in disguise and should not be framed as one — classes
  are cosmetic flavor arriving in V1; focus is a statement about behavior.

---

## 5. Architecture (documented, not coded)

### MVP — focus areas

| Piece | Change |
|---|---|
| Schema | `profiles.focus_areas` — `text[]`, default `'{}'`, CHECK-constrained to the allowed set. Add the column to the column-scoped INSERT and UPDATE grants. Mind the repo's documented footgun: a column-level `REVOKE` against a table-level `GRANT` is silently a no-op — revoke the table grant, re-grant columns. |
| `kairo-core` | **Untouched.** This is a guardrail, not an accident: if a focus feature ever seems to need a `kairo-core` change, the design has drifted into Option A — stop and re-read §2 of this doc. |
| Route gate | Unchanged. Profile creation stays at the name step (profile-row existence remains the onboarding marker); the focus screen writes an `UPDATE`, and skipping writes nothing. Force-quit between name and focus resumes into the tabs with focus unset — acceptable by construction, because focus is skippable and editable in Profile. |
| Client consumers | Character-screen highlight + empty-state copy; HealthKit sheet copy; Profile edit row; `app_events` rows (`focus_selected` with values / `focus_skipped`) for segmentation. |
| Edge Functions | **No changes.** |

### V1 — squad programs (sketch only, to be spec'd then)

`squads.program` column → `squad_leaderboard()` applies the program's stat
weights at read time over `daily_scores`' per-stat columns → settle the
weekly-featured-stat interaction → `kairo-core` gains one pure function
(weighted total) only if the client must mirror the projection. `sync-health`,
`finalize-days`, `deploy-sabotage`, and all stored scores stay untouched.

---

## 6. MVP vs. later — the split

| Feature | MVP (beta) | V1 | V1.5+ |
|---|---|---|---|
| Focus question in onboarding (multi-select, skippable) | ✅ | | |
| Focus-driven copy + "your lane" stat highlight | ✅ | | |
| Focus in `app_events` → beta segmentation | ✅ | | |
| Sign-in screen value-prop copy | ✅ | | |
| First-sync "today already counted" moment | ✅ | | |
| "Have an invite code?" affordance on solo board | ✅ | | |
| Invite deep link surviving install + onboarding | | ✅ (with referral system) | |
| Squad programs (read-time weighting in leaderboard RPC) | | ✅ (Legendary "custom challenges" perk) | |
| Focus-aware notification copy | | ✅ (with §14 notification system) | |
| Workout-type capture (activity type is already in the ingested samples) | | ✅ (storage only) | |
| Per-user scoring programs / program-scoped boards | | | ⚠️ only if data demands |
| Activity-specific quests (mileage, pace) | | | ✅ candidate |
| Manual workout logging | ❌ never in competitive scoring (§20 principle #2) | | |

---

## 7. What the beta should measure (focus → risk question #4)

The focus data converts §15's fuzziest risk question into numbers:

1. **Segment D7/D21 by declared focus.** If "Gym & workouts" users churn
   faster than "Running" users, the scoring isn't serving them — that is the
   demand signal for V1 squad programs (or evidence the END/`AppleExerciseTime`
   risk materialized).
2. **Declared focus vs. achieved dominant stat.** `dominantStat()` already
   exists. A user who declared Running but is VIT-dominant is being scored as
   someone they don't identify as — sustained mismatch predicts the "not
   winnable for my lifestyle" sentiment before an interview surfaces it.
3. **Recruit against focus.** The stranger squads should deliberately include
   at least one gym-heavy and one walker-heavy member each, and the weekly
   bottom-half voice chats should cross-reference what people *said* they
   wanted to gamify.

---

## 8. What I need from you

Decisions only you can make, in priority order:

1. **The fork (most important).** When you say "choose a program," is it
   enough for MVP that the app *presents itself* through that lens (Option B,
   this doc's recommendation) — or do you specifically want programs to change
   *scoring and competition*? If the latter is a hard requirement, it's a
   V1-scale project and §2's Option A costs apply; I'd then push it toward the
   squad-program shape (Option C) rather than per-user modes.
2. **The focus list.** Proposed: Running · Gym & workouts · Everyday movement
   · Just getting healthier. PH-market candidates worth considering:
   basketball, dance/Zumba, cycling, badminton. Note the detection asymmetry —
   basketball and dance land fine in steps + calories; **cycling barely
   registers steps**, so offering a "Cycling" focus would advertise a lane the
   step-driven AGI/VIT scoring can't actually serve. I'd exclude it until
   there's a plan.
3. **Squad model.** Do you picture mixed-focus barkadas competing on one
   universal score (current design), or same-focus squads ("running squad")?
   The answer sets how hard to push Option C in V1.
4. **Manual logging.** Is passive-only a permanently hard line (§20 principle
   #2), or would you ever accept user-logged workouts for *non-competitive*
   features (quests, personal goals)? Gym-program depth hinges on this.
5. **Wearable share.** Roughly what fraction of your intended beta testers
   wear a watch/band? It bounds REC, workout-type data, and how badly the
   END-may-be-zero risk bites.
6. **Beta timing.** Has recruitment started? If external testers are weeks
   away, the focus screen should ship *before* they join so segmentation
   covers the whole cohort from day one.

---
---

# Part 2 — Founder decisions (2026-08-06) and the revised plan

## 9. Decisions recorded

Answers to §8, verbatim in intent. These are product decisions, not proposals.

| # | Question | Decision |
|---|---|---|
| 1 | Presentation-only, or real scoring change? | **Squad-level shape (Option C) — and it moves into the MVP.** The squad's program is a real game rule, not framing. |
| 2 | Program list | **Running · Gym · Walking.** Other activities (basketball, dance, …) are future planning. |
| 3 | Squad model | **Same-focus squads.** A squad is formed around one program; everyone in it plays that program's game. |
| 4 | Manual logging | **Never.** One source of truth: values tracked by the device. No program may ever depend on user-entered data. (Hardens §20 principle #2 and extends it to programs.) |
| 5 | Wearables | **Dynamic capability detection.** Wearable features (sleep/REC) light up when wearable data arrives; phone-only users see only what a phone can track. Capabilities are *observed from the data*, never asked. |
| 6 | Beta timing | Proceed as recommended — onboarding/program work lands **before external testers join**, so the whole cohort is covered. |

## 10. What changes relative to Part 1

Part 1 put squad programs in V1. Decision #1 pulls them into the MVP. That is
the only timing change, but it forces three design questions that could
previously be deferred — each resolved below with a recommendation:

1. **The weekly featured-stat collision (must be resolved before build).**
   The weekly rotation is not dormant: `computeDailyScore()` defaults to
   `featuredStatFor(localDate)` and `daily_scores` stores **post-multiplier**
   per-stat points. Squad weighting applied at read time on top of those
   stored points would silently stack (a running squad in AGI week = 2.25×).
2. **What game do mixed barkadas play?** Same-focus squads serve the runner
   crew and the gym crew — but the spec's founding use case (§1, §7) is a
   mixed-lifestyle barkada competing on one board.
3. **Program → weight mapping**, including the running-vs-walking problem
   (to a phone, both are steps + distance).

## 11. Revised architecture

### 11.1 Move ALL weighting to read time; store base points

The single most important build decision in this plan:

- `sync-plan` stores **base (pre-multiplier) per-stat points** in
  `daily_scores`; `total` becomes the canonical unweighted day total.
- `squad_leaderboard()` applies the squad's program weights **at read time**
  over the per-stat columns, ranks by the weighted total, and returns it.
- The **weekly featured-stat rotation is retired from stored scoring** for
  MVP. A permanent squad program does the rotation's job better — the
  rotation existed to stop one build dominating the universal game, and in a
  program squad the "dominant build" is the point. `kairo-core` keeps the
  capability (it's pure and tested); if the All-around game wants the
  rotation back at V1, it returns as a read-time projection like everything
  else. The `featured_stat` column stays, written as `null`.

Why this shape: stored scores stay canonical and program-independent, so a
program change (or a user in multiple squads at Legendary) can never corrupt
stored data; score *replay* (§12) never needs to know about programs; and
`sync-health` / `finalize-days` / `deploy-sabotage` remain untouched by
programs entirely.

Migration note: existing `daily_scores` rows hold post-multiplier points.
Pre-beta this is seed/dev data only — rescore or reset it. This is the last
cheap moment for that switch, which is part of why the MVP timing is right.

### 11.2 Program → weights

One primary stat per program, ×1.5 — the exact multiplier shape the featured
stat already used, so the tuning is pre-validated and explainable in a line:

| Program | Boosted stat | Rationale |
|---|---|---|
| Running | **AGI ×1.5** | Steps + distance volume is the runner's currency. END/VIT accrue naturally at ×1 — no double-boost needed. |
| Gym | **STR ×1.5** | Active calories is the only phone-detectable gym signal (§2, A3). |
| Walking | **VIT ×1.5** | Hourly movement consistency is the walker's true differentiator; steps still count at full weight via AGI. Also keeps the three programs on three *distinct* stats — each program has its own meta. |
| All-around | none | The current universal game, unchanged. |

Deliberate properties: **END is never a primary stat** (the
`AppleExerciseTime`-may-be-Watch-only risk means END could read zero for
phone-only users; no program's identity may hang on it). Walking → VIT rather
than AGI is what prevents running squads and walking squads from being
mechanically identical — if you'd rather both boost AGI and differ only in
identity, say so before build; it's a one-row change in a weights table.

### 11.3 What weights do NOT touch

- **Tiers.** Bronze/silver/gold stay computed from raw activity, unweighted.
  A squadmate's gold AGI means the same thing on every board — tiers remain
  an honest measure of what the body did; weights only tilt the *ranking*.
- **XP and progression.** XP is tier-based (+10/25/50) and stays universal.
  Your character is yours across squads and programs; switching squads can
  never re-write your level.
- **Sabotage.** The Banana's −500 applies to the weighted total as-is, flat
  in every program.
- **Consistency bonus.** Unweighted, in every program. This is the guardrail
  that keeps a program squad a *health* game: grinding only your boosted stat
  and ignoring the rest still forfeits up to 800 points. A tilt, not a filter.

### 11.4 Squads: same-focus mechanics

- `squads.program` — text, CHECK-constrained to
  `('all_around','running','gym','walking')`, default `'all_around'`.
- `create_squad(p_name, p_program)` — program chosen at creation, shown as a
  chip row in the create form.
- **Program is fixed at creation for MVP.** Because weighting is read-time,
  changing a program would retroactively re-weight *completed* boards —
  yesterday's displayed winner could change. Freezing per-day program history
  solves that properly but is V1 machinery; for the beta, delete-and-recreate
  is the escape hatch.
- **All-around stays, as the default.** Decision #3 says squads are
  same-focus, and running/gym/walking squads are exactly that — but removing
  the universal game entirely would orphan the founding use case: a mixed
  barkada (§1) where the runner, the gym rat and the tita who walks compete
  on one board. All-around *is* that game and costs nothing (it is the
  current behavior). The create-squad UI can lead with the three focused
  programs and offer All-around as "a bit of everything." **Flagged for
  confirmation — if you truly want only the three focused programs, deleting
  the option is one row; the reverse decision after squads exist is a
  migration.**
- Join flow: the code-entry confirmation shows the squad's name **and
  program** before joining — the program is the game rule, so consent to it
  is part of joining. Personal focus does *not* gate membership (a gym person
  may join their barkada's running squad); at most a soft nudge.
- Leaderboard: program badge on the board header; 🔗 wearable icon per §5.

### 11.5 Personal focus becomes single-select — and routes

With same-focus squads, the onboarding focus question graduates from pure
identity to a **routing signal**:

> **"What do you want to level up?"** — Running / Gym / Walking / A bit of
> everything — single-select, skippable, changeable in Profile.

Single-select replaces Part 1's multi-select: the answer now suggests which
squad type to create or join, and a primary focus keeps that routing
unambiguous. Everything else from Part 1 §4 stands — placement after naming,
before HealthKit; chips; skip; kill criterion; the sign-in value prop; the
first-sync moment; the invite-code affordance.

### 11.6 Dynamic capability layer (decision #5)

Capabilities are observed, never asked — consistent with "one source of
truth: the device."

- **Server:** `sync-health` sets `profiles.has_wearable = true` (sticky) the
  first time a sleep entry arrives — exactly the signal Phase 3 follow-up #2
  anticipated. No onboarding question, no settings toggle.
- **Client:** REC/sleep UI exists only when `has_wearable` is true (§5
  already specifies zero penalty and no empty row otherwise). Phone-only
  users see the four phone stats and nothing else.
- **Cold start is by design:** REC appears after the first night of synced
  sleep — the row *arriving* is the feature, and mirrors §5's wearable-envy
  loop on the leaderboard.
- **Honest copy where capability is weak:** the gym program's phone-only
  detection (STR via estimated calories) is the weakest capability in the
  matrix. The gym-squad creation screen should say so plainly — "Gym tracking
  is most accurate with a watch or band" — which is both true and §5's
  wearable-incentive effect doing its job. No feature may silently pretend a
  capability exists (that is how trust dies and manual-logging pressure
  starts).

## 12. Beta design impact

Same-focus squads change what the beta must answer. Risk question #4 ("is the
universal score fair across lifestyles?") is partly *dissolved by
construction* — same-focus squads remove most cross-lifestyle unfairness —
and is replaced by a sharper one:

> **#4′ — Does each program's game feel alive for its lifestyle?** In
> particular: **is the gym program viable phone-only**, or does STR-by-
> estimated-calories make gym-squad scores feel dead or random?

Recruitment consequences (start during Phase 5, as the roadmap already says):

- At least one squad per program: running, gym, walking — plus the friend
  squads (which will likely be All-around and keep that game honest too).
- Ideally **two gym squads: one wearable-heavy, one phone-only.** The delta
  between them is the direct measurement of #4′, and it decides whether V1
  needs wearable-aware program design or the copy-honesty of §11.6 suffices.
- Segment D7/D21 by squad program *and* personal focus, and keep Part 1 §7's
  declared-focus vs. `dominantStat()` mismatch metric.

## 13. Revised MVP split

Supersedes Part 1 §6 where they differ.

| Feature | MVP (beta) | V1 | V1.5+ |
|---|---|---|---|
| Focus question (single-select, skippable) + focus-driven copy | ✅ | | |
| Sign-in value prop · first-sync moment · invite-code affordance | ✅ | | |
| Base-points storage + read-time weighting in `squad_leaderboard()` | ✅ | | |
| `squads.program` + program picker in create + join preview | ✅ | | |
| Program badge on board · weights table in `kairo-core` (pure) | ✅ | | |
| Weekly featured-stat rotation | **retired from stored scoring** | optional read-time return (All-around) | |
| `has_wearable` set by `sync-health` on sleep arrival | ✅ | | |
| Focus/program telemetry in `app_events` | ✅ | | |
| Program change after creation (per-day program history) | ❌ fixed at creation | ✅ | |
| Invite deep link through install + onboarding | | ✅ (referral) | |
| Custom squad challenges (Legendary) — builds on program machinery | | ✅ | |
| Wearable-aware program depth (workout types, pace, mileage quests) | | | ✅ |
| More programs (basketball, dance, …) | | | ✅ candidates |
| Manual logging | ❌ never (decision #4) | ❌ | ❌ |

**Effort added to the MVP:** roughly **30–40h** — schema + RPC (6–10h),
`sync-plan` base-points switch + rescore of dev data (4–6h), `kairo-core`
weights module (3–4h, pure + tested), squad create/join/board UI (6–8h),
focus screen + copy (6–8h), `has_wearable` signal (2–3h), telemetry (2h).
Lands across Phase 1 (onboarding screen), Phase 3 (`sync-plan`,
`has_wearable`), and Phase 4 (squads/leaderboard). The §16 budget absorbs it
at the top of its 305–430h range; the alternative — discovering after the
beta that the squad game was tested in a shape you don't intend to ship —
costs a second beta.

## 14. Deviations to record when built

For `docs/roadmap.md`'s approved-deviations table at implementation time (not
before — they aren't deviations until code exists):

1. *Spec §6: weekly featured stat rotates the meta* → retired from stored
   scoring; squad programs carry the meta; rotation may return read-time at V1.
2. *Spec §5/§12: `daily_scores` stores post-multiplier points* → stores base
   points; all weighting is a read-time projection in `squad_leaderboard()`.
3. *Spec §7: squads have no type* → `squads.program`, same-focus squads,
   fixed at creation for MVP.

## 15. Remaining confirmations (small, non-blocking)

1. **All-around stays as the default fourth program?** (§11.4 — recommended
   yes; removing it later is trivial, adding it back after launch is not.)
2. **Walking → VIT** rather than a second AGI program? (§11.2.)
3. **Program fixed at creation** acceptable for the beta? (§11.4.)

Silence on these is consent to the recommendation; each is a one-line change
before build starts.

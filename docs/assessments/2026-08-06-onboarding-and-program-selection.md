# Onboarding & Program Selection — Assessment and Plan

**Date:** 2026-08-06
**Status:** Assessment for discussion — nothing here is implemented.
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

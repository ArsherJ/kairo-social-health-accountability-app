# The Race — design

**Date:** 2026-08-25
**Status:** Design approved. Sub-project 1 of 5.
**Parent:** `docs/superpowers/specs/2026-08-25-character-race-pivot-design.md`
**Plan:** `docs/superpowers/plans/2026-08-25-the-race.md`
**Proposes roadmap deviations:** **#46**, **#47**

This is one subsystem of the character race pivot. The parent spec is
authoritative for everything cross-cutting — the thesis, the vocabulary, the
Phase 1 scope line, and the decisions in its §2 table. This document covers only
the Race, states what it deliberately does **not** cover, and records the
decisions taken while planning it that the parent does not contain.

---

## 1. Thesis

> The daily leaderboard becomes a track, and the finish line is the Daily Walk.

A Race is **not an object**. It is a *reading* of a day that already exists:
`squad_leaderboard()` for one local date, ranked by capped steps, drawn as six
horizontal lanes with the Philippine endemic figures running them. There is no
creation flow, no state, and nothing stored — which is what lets it inherit the
replay property the whole engine has. A retroactive Apple revision changes the
standings the same way it changes anything else, by being replayed.

## 2. What this covers, and what it does not

**Covers.** `race.ts` in `@kairo/core` (capping, ranking, tie-breaking, ghost
rivals); the widened `squad_leaderboard()` projection and the consent gate in
front of it; the consent sheet at squad create and join; `race-label.ts`; the
full-screen track on the Squad tab; the solo ghost race.

**Does not cover, and the sibling that does:**

| Out of this subsystem | Where it lives |
|---|---|
| The race **summary card** and its one-line reading | Plan 3, the Today tab |
| `race_results` (parent §7.3) — the stored snapshot | Plan 5 |
| Stat vocabulary on the lane labels | Plan 2 |
| Any Event or Battle on the Squad tab | Plan 4 |
| The daily digest carrying a result | Plan 5 |

**Why `race_results` is deferred out of this subsystem.** Results only need
snapshotting once a *result* is displayed as history, which arrives with the
digest. Building the table before anything reads it is speculative, and
`finalize-days` would have to be touched twice. Plan 5 carries it and records it
under this document's deviation #46.

## 3. Governing decisions inherited from the parent

Restated here because the executor reads this document, not the whole parent.

- **The scoring engine survives untouched.** `tierFor`, `shiftedTierFor`,
  `TIER_POINTS`, `THRESHOLDS`, `computeDailyScore`, the `3 / earnable stats`
  ceiling scaling and `planDay` all behave exactly as before. The race reads raw
  units **alongside** scoring, never instead of it.
- **The finish line is `DAILY_STEP_BASELINE`** (parent §4.1), which is
  `THRESHOLDS.AGI.gold`, which is 10,000. Crossing the line and clearing the
  Daily Walk are therefore the same event, deliberately: one number the app
  teaches, read socially by the race and personally by the streak.
- **Anything reading a *tier* to decide whether the line was crossed reads
  `tiers->>'AGI_base'`, never `tiers->>'AGI'`.** The spread shift lowers AGI's
  whole ladder including Gold, and a race whose finish line moved with the
  user's active hours is exactly the public-health failure `DAILY_STEP_BASELINE`
  exists to prevent.
- **Progress is a read-time projection.** Nothing about the race is stored in
  this subsystem.

## 4. Decisions taken while planning

These are new. The parent does not contain them.

### 4.1 The consent gate is per row and reciprocal, not per squad

Parent §4.5 says "until every member of a squad has consented, that squad's
board shows what it shows today." This subsystem implements it **per row and
reciprocally** instead: a member's raw totals are visible only when *that
member* has consented **and** the viewer has consented.

Three reasons, and the first is the one that matters:

1. **Whole-squad gating leaks the holdout's decision.** Five people who agreed
   see nothing, and the only explanation is that somebody declined. That turns a
   private choice into social pressure, which is the opposite of consent.
2. One holdout blocks five people who all agreed.
3. Per-row lets the feature roll out incrementally rather than waiting on a
   whole squad.

**Reciprocity is what stops a non-consenting viewer free-riding** on everyone
else's disclosure. Without it, declining is strictly dominant: you see six
people's figures and show none of your own.

### 4.2 The board keeps its ordering; the race re-ranks on the client

`squad_leaderboard()` still orders by the program-weighted total (deviation
#11), which is the only way it can apply the squad's program at read time. The
race ranks on **capped steps**, a different ordering, and does it on the client.

**Two orderings, one payload.** Adding raw totals to the RPC does not change
ranking, and quietly reordering there would turn the weighted board into a step
board — so a schema test pins that the returned `rank` sequence is still
monotonic in `total`. This is stated as a decision because the obvious
"improvement" is to rank in SQL once, and that would silently delete the
program feature.

### 4.3 The cap *is* the anti-cheat, and it is not a separate mechanism

Racing on raw steps loses the tier ladder's normalization: inside scoring, a
40,000-step day and a 12,000-step day are both Gold, so shaking a phone buys
almost nothing. A raw-step race would hand that resistance back.

Capping race contribution at the finish line restores it exactly — **past the
line, extra steps buy nothing at all** — and it needs no fraud detection, no
threshold tuning and no accusation. It also makes the common case correct:
two people past the line are tied on the primary key by construction, which is
why the tie-break falls through to the daily score (the thing the engine already
considers a better day) and then to `user_id` (so the order is stable across
refetches and the board does not twitch on every poll).

### 4.4 A day that scored nothing is not raced

A solo player's rivals are their own recent days. Days with zero steps are
**dropped** rather than raced: a new account otherwise lines up against three
zeroes, which reads as the feature being broken rather than as an easy win.

With no qualifying history at all, the player races alone — one lane plus the
existing invite affordance. Never an empty track, and never a fabricated rival.

### 4.5 A non-consenting squadmate stays on the track, without a position

A row whose `steps` is `NULL` is kept on the track and drawn without a lane
position, labelled "not sharing".

Both alternatives state something false: dropping the row looks like the member
left the squad, and drawing them at zero looks like they did nothing today.

## 5. Data model

### 5.1 `profiles.squad_data_consent_at timestamptz`

New, nullable. NULL means never agreed. Added to the column-scoped UPDATE grant
— and the table-level `REVOKE` must precede the column `GRANT`, because a
column-level revoke against a table-level grant is silently a no-op in Postgres.

### 5.2 `squad_leaderboard()` — widened

Gains four trailing columns: `steps integer`, `distance_m numeric`,
`active_kcal numeric`, `sleep_minutes integer`. All four are `NULL` unless both
sides have consented.

It does **not** gain hourly movement, heart rate, workout sessions, pace or
timestamps. The function sums a day and never selects or groups by the hour
column, which is the difference between a total and a movement pattern.

**Dropped by exact argument list and recreated**, never `create or replace` —
the return type changes, and a surviving overload fails nothing until a call
site resolves to it. This is the `create_goal` / `p_metric` trap.

### 5.3 `race.ts` in `@kairo/core`

Pure, zero-dependency, no clock reads, no randomness.
`RACE_FINISH_LINE = DAILY_STEP_BASELINE` — **derived, never written as a
literal**; `10_000` must not appear anywhere in the race code.

## 6. Privacy posture

This subsystem is the pivot's one-way door and the parent flags it as a launch
blocker (§4.5). What becomes squad-visible: **steps, distance, active calories,
sleep duration** — daily totals only. What stays owner-only: **hourly movement,
heart rate, workout sessions, pace, routes, timestamps.**

The consent surface names both lists explicitly, at squad create and squad join,
with a decline path. Existing members are prompted once per launch because they
joined under the previous model.

The privacy policy and the App Store privacy answers are updated in the same
pass. HealthKit data disclosed to other users engages App Review guideline
5.1.3; explicit consent is the defensible posture and an implicit one is not.

**Fallback if join conversion falls materially:** steps and distance only, no
sleep. That removes most of the disclosure and most of the sheet.

## 7. Accessibility — the main build risk

A six-lane track is the character-HUD failure waiting to happen, and this is the
part of the subsystem most likely to cost a TestFlight build.

- **Lanes are flow-based.** No `top` on any lane child. The HUD's
  `+8/+48/+48/+132` constants assumed pill heights nothing enforced and
  overlapped at large Dynamic Type; a track is the same shape of mistake.
- **Each lane is one accessibility element, and both halves are required.** The
  parent gets `accessible` + `accessibilityLabel`; **every direct child** gets
  `accessibilityElementsHidden` **and**
  `importantForAccessibility="no-hide-descendants"`. The documented collapse
  behaviour did not happen on the 2026-08-14 build. Removing either half is how
  the twelve-stops-per-row bug returns.
- **The composition is a tested pure module** (`race-label.ts`), extending
  `row-label.ts`'s pattern rather than forking it.
- **The consent sheet is bounded, scrolls, and wraps its text in a `View` with a
  computed point width.** All three are the 2026-08-17 lessons in a new place:
  `Panel` sets `overflow: 'hidden'`, so an oversized sheet is silently clipped
  *inside* the card — which is how the Health ask lost its "Not now" at XXXL,
  the one control that lets someone decline.
- **Liveness is stated, never implied.** Every lane carries the racer's last
  sync time; a stale lane is visibly marked. HealthKit background delivery is
  opportunistic and the UI must not pretend otherwise.

Verified with `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`
**and a relaunch** — RN caches text measurements, so a size change on a running
app renders correct text inside stale boxes and looks exactly like a layout
regression. Then in Xcode's Accessibility Inspector, which answers *"is this row
one element or twelve"* directly, with no VoiceOver gestures and no build.

## 8. Testing

- `race.ts` — capping, ranking, tie-breaking, ghost construction, non-mutation
  of input, empty board. Pure, in Node.
- **The finish-line cap is asserted through `computeDailyScore`, not through
  `tierFor`.** `tierFor` *is* `shiftedTierFor(stat, raw, 0)`, the one path where
  the shift is absent by definition — a guard written through it cannot catch
  the `AGI` / `AGI_base` confusion, and one already failed to.
- `race-label.ts` — a pure module tested in Node.
- Schema suite (PGlite): the widened RPC's exact row shape, the reciprocal gate
  in all four combinations, that ranking is still by weighted total, and the
  standing assertion that no `public` function body mentions `workout_sessions`.
- Verified live: exactly one `squad_leaderboard` overload survives the drop.
- UI by hand on the simulator. Two real accounts confirm the gate from both
  sides.

## 9. Proposed roadmap deviations

| # | Deviation |
|---|---|
| 46 | The Race is an always-on reading of the day, not a created object; the finish line is `DAILY_STEP_BASELINE` and doubles as the anti-cheat cap |
| 47 | `squad_leaderboard()` widened to daily raw totals behind an explicit **per-row, reciprocal** consent gate (refining parent §4.5's whole-squad rule, §4.1 above); hourly, heart-rate and workout data stay owner-only |

Plan 5 adds the `race_results` half under #46 rather than claiming a number of
its own.

## 10. Open risks

- **The race may still read as a leaderboard.** Horizontal lanes are the
  mitigation; the honest test is a device pass with a real squad, not a
  screenshot. If it does not feel like a race, no amount of Battle and Adventure
  will rescue it — which is exactly why Phase 1 is bounded where it is.
- **Sync cadence is the ceiling on liveness** and cannot be engineered around
  without background-triggering pushes, which are out of scope. Stating
  staleness honestly is the whole mitigation.
- **The consent gate is a funnel step in the highest-drop-off part of the app.**
  §6's fallback exists for this. `squad_data_consent_granted` (plan 5, task 7)
  is how it gets measured rather than guessed.
- **A six-lane track at accessibility text sizes is unproven.** Budget a device
  pass and a possible fallback to a stacked layout above a size threshold.

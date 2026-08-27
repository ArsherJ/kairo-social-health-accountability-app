# Body · Motion · Mind — design

**Date:** 2026-08-25
**Status:** Design approved. Sub-project 2 of 5.
**Parent:** `docs/superpowers/specs/2026-08-25-character-race-pivot-design.md`
**Plan:** `docs/superpowers/plans/2026-08-25-body-motion-mind.md`
**Proposes roadmap deviation:** **#51**

This is one subsystem of the character race pivot. The parent spec is
authoritative for everything cross-cutting. This document covers only the stat
rename, and records what planning it turned up that the parent (§5.5, one
paragraph) does not contain.

---

## 1. Thesis

> The engine keeps its vocabulary; the surface gets the player's.

`CoreStat` stays `'AGI' | 'STR' | 'MND'` everywhere — in `daily_scores`
columns, in `profiles` rollups, in the `tiers` JSON keys, in
`program_weighted_total`'s argument order. What players read becomes **Body**
(`STR`), **Motion** (`AGI`), **Mind** (`MND`).

This is deviation #23's move in a second place. That deviation made
Bronze/Silver/Gold internal to scoring without changing a line of the engine,
for the same reason: the words answered a question the product had stopped
asking. Three-letter RPG stat abbreviations belong to a character sheet, and
after the pivot the app asks somebody to race, not to read one.

## 2. What this covers, and what it does not

**Covers.** `STAT_NAMES` and every surface composing it; the two surfaces that
kept a parallel copy of the words; the squad program blurbs that name a weighted
stat.

**Does not cover:**

| Out of this subsystem | Why |
|---|---|
| Any engine key | The whole point. `CoreStat` does not move. |
| `squads.program`'s `strength` value or its "Strength" label | Names a *game*, not a stat — §4.3 below |
| `ChallengeArea`'s `strength` value or its "Strength" label | Same, and parent §5.5 keeps `/train`'s vocabulary intact |
| `STAT_LABELS` ("Steps and distance", "Active calories", "Sleep duration") | Names activities, not stats. Already correct. |

Nothing in this subsystem depends on another plan, and nothing depends on it. It
is deliberately queued early because it is the cheapest way to make the pivot
legible on a device.

## 3. Governing decisions inherited from the parent

- **Engine keys do not move** (parent §5.5). `STAT_NAMES` is already the single
  source and already covers `Dominance`, which is `CoreStat | 'balanced' | null`.
- The vocabulary table (parent §6): say **Body / Motion / Mind**, not STR / AGI /
  MND — engine keys only.

## 4. Decisions taken while planning

### 4.1 The table has to move before it can be renamed

`STAT_NAMES` lives in `src/ui/StatIcon.tsx`, which imports
`@expo/vector-icons` — and therefore reaches React Native's Flow syntax that
root Vitest cannot parse. **The stat words were untestable.** A rename touching
seven call sites was about to happen with nothing able to fail.

So the table moves first, into a zero-runtime-import `src/ui/stat-names.ts`,
with `StatIcon.tsx` re-exporting it so no call site changes. This is the same
split the codebase already uses twice for the same constraint —
`read-types.ts`/`disclosure.ts` for the HealthKit disclosure, and
`buffer.ts`/`milestone-store.ts` for telemetry.

The consequence is a rule worth writing down: **a module root Vitest tests must
import `@/ui/stat-names.ts`, never `@/ui/index.ts`.** The barrel re-exports
every component, so importing it drags Flow syntax into a Node test.

### 4.2 Two parallel copies existed, and that is why "one table" needed checking

The claim "`STAT_NAMES` is the single source" was true of *composition* and not
of *content*. Two surfaces held their own words:

- **`DOMINANCE_LABELS` in `app/(tabs)/index.tsx`** — its own
  `Record<CoreStat | 'balanced', string>` reading `'Agility build'`,
  `'Strength build'`, `'Mind build'`, `'All-Rounder'`. It is replaced by
  `dominanceName()` in the new module, which covers the whole `Dominance` type
  including the null case, so a parallel table cannot exist to drift.
- **`boostChipLabel` in `src/features/squad/program-copy.ts`** — rendered the
  raw engine key to the player, `AGI ×1.5`, on the squad board header. This was
  the **last surface in the app showing an engine name to a user**, and it is
  the one the rename would most obviously have missed, because it never
  contained a stat *word* to grep for.

### 4.3 Program and Challenge names stay; their blurbs move

`squads.program` has a `strength` value labelled "Strength", and `ChallengeArea`
has a `strength` value labelled "Strength". Neither renames.

**A program's name is not a stat's name.** "Strength" there names the game a
squad chose to play, members consented to it under that name, and renaming it
alongside the stats would be a second, unrequested change to a shared concept.
Parent §5.5 makes the same call for `/train`'s Challenges.

What *is* wrong after the rename is each program's blurb, because a blurb names
the stat the program weights: "Strength and effort count for more" sitting beside
a stat now called Body is exactly the drift this subsystem closes. Each blurb is
rewritten to lead with the weighted stat's new word.

### 4.4 Mind does not move, and saying so prevents a needless edit

`MND` is already spoken as "Mind". **Two words change, not three.** Writing the
change up as "Body · Motion · Mind" suggests three edits and invites somebody to
touch the one line that is already correct — including `LANE_EMPTY_COPY`'s MND
sentence ("Rest is training too. Sleep tonight and Mind starts moving.") and
`RECOVERY_ACCURACY_NOTE`'s doc comment, both of which are right as written.

### 4.5 Only "Agility" is guardable

The regression guard is a test that scans `src` and `app` for the word
**Agility** and expects no matches.

"Strength" is deliberately **not** guarded. It legitimately survives in five
places: the squad program label, the Challenge area label,
`STRENGTH_ACCURACY_NOTE`, and the two `HKWorkoutActivityType` identifiers
`functionalStrengthTraining` and `traditionalStrengthTraining`. A guard on it
would be noise rather than a rule, and a noisy guard gets deleted.

## 5. Code structure

```
src/ui/stat-names.ts        zero runtime imports; STAT_NAMES + dominanceName()
src/ui/stat-names.test.ts   the words, totality over CoreStat, the Agility guard
src/ui/StatIcon.tsx         glyphs only; re-exports the two names
src/ui/index.ts             exports the component and the words from separate files
```

The two-line barrel export is deliberate: a consumer that only wants the words
must be able to reach them without pulling `@expo/vector-icons` into its module
graph.

## 6. Surfaces that inherit the change for free

These already compose `STAT_NAMES` and need no edit — listing them is how the
"one table" claim is checked rather than asserted:

`StatBar`, `StatRail`, `FirstSyncCallout`, `Diorama`, `LeaderboardRow`,
`app/progress.tsx`, and `detailCopy` in `app/(tabs)/index.tsx`.

`first-sync.ts` and `row-label.ts` take `statNames` as an **injected argument**
rather than importing it, which is why both are testable in Node and why neither
appears in this list. That pattern is the reason the rename is cheap.

## 7. Verification

The rename is invisible to automated tests beyond the three above, so the device
pass is the verification:

- The home screen's build line reads `Body build · last 14 days`.
- The stat rail speaks `Body 12`, `Motion 41`, `Mind 3` — checked with VoiceOver
  or the Accessibility Inspector, because the coins carry **no text at all** and
  `STAT_NAMES` is the entire accessible name of a stat there.
- The squad board header chip reads `Motion ×1.5`.
- `/progress` lists Motion, Body and Mind with their reasoning intact.

At `accessibility-extra-extra-extra-large`, after a relaunch. **Body is one
glyph shorter than Strength and Motion two shorter than Agility, so nothing can
newly overflow** — but the rail and the board row are where a stat word sits
closest to a numeral, so those are checked first.

## 8. Proposed roadmap deviation

| # | Deviation |
|---|---|
| 51 | Stat surface names become **Body** (`STR`), **Motion** (`AGI`), **Mind** (`MND`); engine keys unchanged everywhere |

## 9. Open risks

- **"Body" and the `strength` squad program now coexist**, and a member of a
  Strength squad reads "Body counts for more" on their board. That is the
  correct sentence and it is briefly confusing. The alternative — renaming the
  program too — changes a thing members already agreed to, and was rejected.
  Worth watching on the first device pass with a real Strength squad.
- **`docs/Kairo_Master_Summary.md` §5 and §6 name the old words throughout.**
  They are a historical record and are marked superseded in place, not rewritten
  — the same disposition deviation #41 already gave them. A reader who takes
  those tables as current will use the wrong vocabulary, which is why the
  supersede note is extended rather than left implying #41 was the last word.

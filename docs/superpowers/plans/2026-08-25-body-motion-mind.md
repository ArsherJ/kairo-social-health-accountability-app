# Body · Motion · Mind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the three stats the player's vocabulary — **Body** (`STR`), **Motion** (`AGI`), **Mind** (`MND`) — without touching a single engine key.

**Architecture:** `STAT_NAMES` is already the single source for stat words, but it lives in `src/ui/StatIcon.tsx`, which imports `@expo/vector-icons` and therefore cannot be loaded by root Vitest. The rename moves the table into a new zero-import `src/ui/stat-names.ts` — the same split `read-types.ts`/`disclosure.ts` and `buffer.ts`/`milestone-store.ts` already use — so the words become testable, then changes two values. Every surface that already composes `STAT_NAMES` inherits the new words for free; the two surfaces that keep a *parallel* copy are rewritten to derive from it.

**Tech Stack:** TypeScript (zero-dependency `@kairo/core`), React Native / Expo Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-body-motion-mind-design.md` — this subsystem's design, which carries the decisions taken while planning it.
**Parent spec:** `docs/superpowers/specs/2026-08-25-character-race-pivot-design.md` — authoritative for everything cross-cutting. Read both.

## This is plan 2 of 5

Phase 1 of the spec is five independently shippable subsystems. This one depends
on none of the others and nothing depends on it — it is pure surface vocabulary,
and it is deliberately first-in-queue because it is the cheapest way to make the
pivot legible on a device.

| Plan | Scope | Depends on |
|---|---|---|
| 1. The Race | `race.ts`, widened projection, consent gate, lanes on the Squad tab, solo ghost race | — |
| **2. Body · Motion · Mind** (this plan) | `STAT_NAMES` and every surface reading it | — |
| 3. The Today tab | Fourth tab, quests, disclosure change, race hero card | 1 |
| 4. Goals → Events + Battle | Table reshape, `create_event()`, `event_progress()`, pooled grading | — |
| 5. Digest + level response | One push a day, louder level bands on the figure | 1, 3, 4 |

## Global Constraints

- **`packages/kairo-core` stays pure and zero-dependency.** No I/O, no clock reads, no randomness, no new dependencies. **This plan does not modify `@kairo/core` at all** — `CoreStat` stays `'AGI' | 'STR' | 'MND'`, and if a task tempts you to rename a key, that is the mistake this plan exists to avoid.
- **Imports use explicit `.ts` extensions.**
- **`src/ui/Text.tsx` is the only Text.** Import from `@/ui`, never from `react-native`. `allowFontScaling={false}` appears nowhere in this codebase and must not start.
- **Root Vitest has no `@/` alias and cannot parse React Native's Flow syntax.** A module it tests may import `@kairo/core` (a real workspace package — `src/features/train/daily-walk.test.ts` proves it) but must not import anything that reaches `react-native` or `@expo/vector-icons`. That constraint is the whole reason Task 1 splits a file.
- **UI is verified by hand on the simulator**, not by component tests. Pure decision modules are tested in Node. This is the house posture, not a shortcut.
- **Engine keys are never renamed.** `AGI`/`STR`/`MND` stay in `CoreStat`, in `daily_scores` columns, in `profiles` rollups, in `tiers` JSON keys, in `program_weighted_total`. This is the same move deviation #23 made with tier names: the engine keeps its vocabulary, the surface gets the player's.

## Two decisions this plan takes, and why

**Mind does not move.** `MND` is already spoken as "Mind". Only two words change —
`AGI` Agility → **Motion**, `STR` Strength → **Body**. Writing all three into the
task titles would suggest three edits and invite a needless one.

**Squad programs and Challenge areas keep their own names.** `squads.program`
still has a `strength` value labelled "Strength", and `ChallengeArea` still has
`strength` labelled "Strength" (spec §5.5: `/train` keeps *Challenge*). Those are
names of **games**, not names of stats, and renaming them would be a second,
unrequested change. What does change is the sentence underneath a program, which
names the stat it weights — a blurb that says "Strength and effort count for
more" beside a stat now called Body is the drift this plan is closing.

---

### Task 1: `stat-names.ts` — one table, testable, renamed

**Files:**
- Create: `src/ui/stat-names.ts`
- Create: `src/ui/stat-names.test.ts`
- Modify: `src/ui/StatIcon.tsx` (delete the table, re-export from the new module)
- Modify: `src/ui/index.ts` (source the export from the new module)

**Interfaces:**
- Consumes: `CoreStat` and `Dominance` from `@kairo/core`.
- Produces: `STAT_NAMES: Record<CoreStat, string>` with the new values, and `dominanceName(dominance: Dominance): string | null`. Task 2 consumes both. Every existing importer of `STAT_NAMES` — `StatBar.tsx`, `FirstSyncCallout.tsx`, `StatRail.tsx`, `Diorama.tsx`, `LeaderboardRow.tsx`, `app/progress.tsx`, `app/(tabs)/index.tsx` — keeps its import path unchanged and needs no edit.

- [ ] **Step 1: Write the failing test**

Create `src/ui/stat-names.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_STATS } from '@kairo/core';
import { STAT_NAMES, dominanceName } from './stat-names.ts';

describe('STAT_NAMES', () => {
  it('speaks the player vocabulary, not the engine keys (deviation #51)', () => {
    expect(STAT_NAMES).toEqual({ AGI: 'Motion', STR: 'Body', MND: 'Mind' });
  });

  it('is total over CoreStat, so no stat can render as undefined', () => {
    for (const stat of CORE_STATS) {
      expect(typeof STAT_NAMES[stat]).toBe('string');
      expect(STAT_NAMES[stat].length).toBeGreaterThan(0);
    }
  });
});

describe('dominanceName', () => {
  it('names a dominant stat with the player word', () => {
    expect(dominanceName('STR')).toBe('Body');
    expect(dominanceName('AGI')).toBe('Motion');
  });

  it('names the All-Rounder, which is a shape rather than a stat', () => {
    expect(dominanceName('balanced')).toBe('All-Rounder');
  });

  it('has no name for an unstarted or still-loading character', () => {
    // Null is a real state — a character with no points has no build, and
    // saying "All-Rounder" to someone who has done nothing would cheapen the
    // one visual §6 says must be earned.
    expect(dominanceName(null)).toBeNull();
    expect(dominanceName(undefined)).toBeNull();
  });
});

describe('the old vocabulary', () => {
  /** Every .ts/.tsx under the app's own source, excluding tests. */
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        sourceFiles(path, out);
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push(path);
      }
    }
    return out;
  }

  it('has no "Agility" left anywhere in app or src', () => {
    // Guards only the word that must vanish completely. "Strength" is
    // deliberately NOT guarded: it survives as a squad program name, a
    // Challenge area name and two HKWorkoutActivityType identifiers, so a
    // guard on it would be noise rather than a rule.
    const offenders = [...sourceFiles('src'), ...sourceFiles('app')].filter((path) =>
      readFileSync(path, 'utf8').includes('Agility'),
    );
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts src/ui/stat-names.test.ts`
Expected: FAIL — cannot resolve `./stat-names.ts`.

- [ ] **Step 3: Write the module**

Create `src/ui/stat-names.ts`:

```ts
import type { CoreStat, Dominance } from '@kairo/core';

/**
 * The stats said in full, for screen readers and for every line of copy that
 * names one (roadmap deviation #51).
 *
 * **Load-bearing, not decoration.** The coins carry no text at all, so this is
 * the entire accessible name of a stat on the rail — the same status
 * `TabPill`'s `LABELS` map has for the nav.
 *
 * **Body · Motion · Mind, over Strength · Agility · Mind.** The engine keys do
 * not move: `CoreStat` is still `'AGI' | 'STR' | 'MND'`, `daily_scores` still
 * has `agi_points`, `tiers` is still keyed `AGI`/`AGI_base`, and
 * `program_weighted_total` still takes them in that order. This is deviation
 * #23's move in a second place — the engine keeps its vocabulary and the
 * surface gets the player's. RPG stat abbreviations are a genre convention the
 * pivot is deliberately dropping: the app now asks someone to race, not to read
 * a character sheet, and "Body" is a word about the person rather than about
 * the system measuring them.
 *
 * **Why this file exists at all, rather than the table living in `StatIcon.tsx`
 * where it started.** That file imports `@expo/vector-icons`, which drags in
 * React Native's Flow syntax that root Vitest cannot parse — so the words were
 * untestable, and a rename touching seven call sites had nothing to fail
 * against. This module imports one *type* and nothing else, which is the same
 * split `read-types.ts`/`disclosure.ts` and `buffer.ts`/`milestone-store.ts`
 * already use for the same reason. Keep it zero-runtime-import.
 */
export const STAT_NAMES: Record<CoreStat, string> = {
  AGI: 'Motion',
  STR: 'Body',
  MND: 'Mind',
};

/**
 * A character's build, named.
 *
 * Here rather than in a second table on the home screen, which is what it
 * replaces: `DOMINANCE_LABELS` held its own copy of the three stat words plus
 * `'All-Rounder'`, so the rename would have had to land in two places and the
 * second one is the one that gets missed. `Dominance` is
 * `CoreStat | 'balanced' | null`, so a single function covers the whole type
 * and a parallel table cannot drift.
 *
 * Null for an unstarted character *and* for a query still in flight, which are
 * the same thing to a caller that has nothing to draw: naming a build for
 * someone who has done nothing would cheapen the one visual §6 says must be
 * earned.
 */
export function dominanceName(dominance: Dominance | undefined): string | null {
  if (dominance === undefined || dominance === null) return null;
  if (dominance === 'balanced') return 'All-Rounder';
  return STAT_NAMES[dominance];
}
```

- [ ] **Step 4: Delete the old table and re-export**

In `src/ui/StatIcon.tsx`, delete the whole `STAT_NAMES` declaration together with
its doc comment (currently lines 44–56, from `/**\n * The stats said in full` to
the closing `};`), and add this immediately below the `ICONS` declaration:

```ts
/**
 * Re-exported so the seven existing call sites keep one import for a stat's
 * glyph and its name. The table itself lives in `stat-names.ts`, which imports
 * nothing at runtime and can therefore be tested — this file cannot, because
 * `@expo/vector-icons` reaches React Native's Flow syntax.
 */
export { STAT_NAMES, dominanceName } from './stat-names.ts';
```

- [ ] **Step 5: Point the barrel at the source**

In `src/ui/index.ts`, replace the line

```ts
export { StatIcon, STAT_NAMES } from './StatIcon.tsx';
```

with

```ts
export { StatIcon } from './StatIcon.tsx';
export { STAT_NAMES, dominanceName } from './stat-names.ts';
```

Two lines rather than one, and deliberately: a consumer that only wants the
words must be able to reach them without pulling `@expo/vector-icons` into its
module graph. `Diorama.tsx` imports `STAT_NAMES` from `'@/ui/StatIcon.tsx'`
directly and still resolves through the re-export in Step 4 — leave it.

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npx vitest run --config vitest.config.ts src/ui/stat-names.test.ts`
Expected: FAIL on the last case only — `app/(tabs)/index.tsx` still contains
`'Agility build'`. The first four cases PASS. That failure is Task 2's subject
and is left standing on purpose; do not fix it here and do not weaken the test.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/ui/stat-names.ts src/ui/stat-names.test.ts src/ui/StatIcon.tsx src/ui/index.ts
git commit -m "refactor(ui): move stat words to a testable module and rename to Body/Motion"
```

`npm run typecheck` must PASS even though one test case is red — nothing about
the types changed.

---

### Task 2: The two surfaces that kept their own copy

**Files:**
- Modify: `app/(tabs)/index.tsx` (delete `DOMINANCE_LABELS`, call `dominanceName`)
- Modify: `src/features/squad/program-copy.ts` (`boostChipLabel`, the five blurbs)
- Modify: `src/features/squad/program-copy.test.ts` (the blurb assertions, if any)

**Interfaces:**
- Consumes: `STAT_NAMES` and `dominanceName` from Task 1.
- Produces: nothing consumed by a later task.

Every other consumer of `STAT_NAMES` composes it at render time and is already
correct — `StatBar`, `StatRail`, `FirstSyncCallout`, `Diorama`, `LeaderboardRow`,
`app/progress.tsx` and `detailCopy` in the home screen all read the table. These
two do not: one holds a second copy of the words, and the other prints the raw
engine key to the user.

- [ ] **Step 1: Delete the parallel build table**

In `app/(tabs)/index.tsx`, delete this declaration entirely (currently lines
90–100, including its doc comment):

```ts
/**
 * §6's evolution table, said out loud. The silhouette differences are real but
 * subtle on placeholder art, and a character that quietly changes shape reads
 * as a rendering glitch rather than as a reward.
 */
const DOMINANCE_LABELS: Record<CoreStat | 'balanced', string> = {
  AGI: 'Agility build',
  STR: 'Strength build',
  MND: 'Mind build',
  balanced: 'All-Rounder',
};
```

- [ ] **Step 2: Read the build name from the one table**

In the same file, add `dominanceName` to the existing `@/ui/index.ts` import
line, which currently reads:

```ts
import { Avatar, Label, Meter, Numeral, STAT_NAMES, TAB_PILL_CLEARANCE, Text } from '@/ui/index.ts';
```

so that it reads:

```ts
import {
  Avatar,
  Label,
  Meter,
  Numeral,
  STAT_NAMES,
  TAB_PILL_CLEARANCE,
  Text,
  dominanceName,
} from '@/ui/index.ts';
```

Then replace the build line in the `todayHead` block, which currently reads:

```tsx
            {dominance.data != null && (
              <Text style={styles.build}>
                {DOMINANCE_LABELS[dominance.data]} · last {DOMINANCE_WINDOW_DAYS} days
              </Text>
            )}
```

with:

```tsx
            {/* `dominanceName` returns null for an unstarted character *and*
                for a query still in flight, which is the same guard the
                `!= null` check was making by hand — so the name is what the
                condition now reads. One table, not two: the old
                `DOMINANCE_LABELS` held its own copy of the three stat words,
                which is exactly the drift `STAT_NAMES` exists to stop. */}
            {dominanceName(dominance.data) != null && (
              <Text style={styles.build}>
                {dominanceName(dominance.data)} build · last {DOMINANCE_WINDOW_DAYS} days
              </Text>
            )}
```

Note `build` moved out of the table and into the sentence: `'All-Rounder'` never
carried the word, so it lived in three of the four values and not the fourth.
Reading "All-Rounder build" once on screen is the check that this reads well —
if it does not, the fix is a `dominanceBuildLine()` in `stat-names.ts`, not a
second table here.

If `CoreStat` is now unused in this file's imports, remove it; `npm run
typecheck` will say so.

- [ ] **Step 3: Stop printing engine keys in the boost chip**

In `src/features/squad/program-copy.ts`, `boostChipLabel` currently renders the
raw `CoreStat` key — `AGI ×1.5` — on the board header, which is the one place in
the app a player is shown a three-letter engine name. Replace the function:

```ts
/**
 * The boost, said out loud — e.g. `Motion ×1.5`. Null on an untilted board.
 *
 * This is **program information**: what game this squad is playing. It lives on
 * the board header, next to the program name.
 *
 * It used to print the raw `CoreStat` key (`AGI ×1.5`), which was the last
 * surface in the app showing an engine name to a player. `STAT_NAMES` is the
 * one table of stat words (deviation #51) and this reads it rather than
 * inventing a shorter one — a chip is not a reason for a second vocabulary.
 */
export function boostChipLabel(program: SquadProgram | undefined): string | null {
  const stat = program ? boostedStatFor(program) : null;
  return stat === null ? null : `${STAT_NAMES[stat]} ×${PROGRAM_BOOST_MULTIPLIER}`;
}
```

and add `STAT_NAMES` to the file's imports:

```ts
import { STAT_NAMES } from '@/ui/stat-names.ts';
```

Import from `stat-names.ts` directly, not from `@/ui/index.ts`: this module is
tested by root Vitest (`program-copy.test.ts`), and the barrel re-exports
`StatIcon.tsx`, `Text.tsx` and every other component — pulling the barrel in
would drag React Native's Flow syntax into a Node test and break it.

- [ ] **Step 4: Name the weighted stat in each blurb**

Still in `src/features/squad/program-copy.ts`, replace `PROGRAM_OPTIONS`:

```ts
/**
 * Focused programs first. All-around is the default the database applies, but
 * leading with it in the UI would make it the answer most founders pick by
 * inertia — and the beta needs squads on each program to answer §15's
 * per-program risk question at all.
 *
 * **A program's name is not a stat's name.** `strength` stays "Strength" and
 * `running` stays "Running" — those name the *game the squad is playing*, and
 * renaming them alongside the stats (deviation #51) would be a second,
 * unrequested change to a concept members already consented to. What each blurb
 * must do is name the stat it weights in the player's current vocabulary, which
 * is why "Strength and effort count for more" is now wrong and "Body and effort"
 * is right.
 */
export const PROGRAM_OPTIONS: readonly ProgramOption[] = [
  { value: 'running', label: 'Running', blurb: 'Motion counts for more — distance and pace' },
  { value: 'strength', label: 'Strength', blurb: 'Body counts for more — effort and active calories' },
  { value: 'walking', label: 'Walking', blurb: 'Motion counts for more — steps and active hours' },
  {
    value: 'recovery',
    label: 'Recovery',
    blurb: 'Mind counts for more — the one game you win by resting',
  },
  {
    value: 'all_around',
    label: 'All-around',
    blurb: 'A bit of everything — every stat weighs the same',
  },
];
```

Then update the two accuracy notes in the same file so they do not contradict the
new words. `STRENGTH_ACCURACY_NOTE` is about the *measurement* and needs no
change. `RECOVERY_ACCURACY_NOTE` is already about sleep and needs none either.
The doc comment above `RECOVERY_ACCURACY_NOTE` says "Recovery weights Mind" —
still true, leave it. The doc comment above `STRENGTH_ACCURACY_NOTE` says "STR
comes from estimated active energy"; change `STR` to `Body (STR)` so a reader
sees both halves.

- [ ] **Step 5: Run the affected tests**

Run: `npx vitest run --config vitest.config.ts src/features/squad/program-copy.test.ts src/ui/stat-names.test.ts`
Expected: PASS, including the `Agility` guard that was red at the end of Task 1.

If `program-copy.test.ts` asserts a blurb string literally, update the assertion
to the new copy — that test exists to pin that every `SquadProgram` has an
option, not to pin the wording.

- [ ] **Step 6: Verify on the simulator**

```bash
npm run ios
xcrun simctl ui booted content_size accessibility-extra-extra-extra-large
# relaunch the app — RN caches text measurements, so a size change on a running
# app renders correct text inside stale boxes and looks like a layout regression
xcrun simctl io booted screenshot /tmp/stats-xxxl.png
```

Confirm on the screenshot and on the device:
- The home screen's build line reads `Body build · last 14 days` (or `Motion` /
  `Mind` / `All-Rounder build`) and does not wrap into the hero.
- Expanding the stat rail speaks `Body 12`, `Motion 41`, `Mind 3` — check with
  VoiceOver or the Accessibility Inspector, since the coins carry no text.
- The squad board header chip reads `Motion ×1.5` on a walking or running squad.
- `/progress` lists Motion, Body and Mind with their reasoning intact.

**`Body` is one glyph shorter than `Strength` and `Motion` two shorter than
`Agility`, so nothing can newly overflow** — but the rail and the board row are
where a stat word sits closest to a numeral, so look at those two first.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
npm test
git add "app/(tabs)/index.tsx" src/features/squad/program-copy.ts src/features/squad/program-copy.test.ts
git commit -m "feat(ui): speak Body, Motion and Mind on every surface"
```

Expected: both PASS.

---

### Task 3: Documentation

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`
- Modify: `docs/mvp-scope.md`
- Modify: `docs/user-journey.md`
- Modify: `docs/Kairo_Master_Summary.md` (an in-place supersede note only)

Documentation updates are part of the change, not a follow-up.

- [ ] **Step 1: Add deviation #51**

In `docs/roadmap.md`'s approved-deviations table, add row **#51**. Follow the
table's existing style — what the spec said, what was built, and *why*, at
length. It must record:

- Spec says: §5 and §6 name the stats Agility, Strength, Endurance, Vitality and
  Recovery, and deviation #41 reduced them to Agility, Strength and Mind.
- We build: the surface words become **Body** (`STR`), **Motion** (`AGI`) and
  **Mind** (`MND`). Engine keys are unchanged everywhere — `CoreStat`, the
  `daily_scores` columns, the `profiles` rollups, the `tiers` JSON keys and
  `program_weighted_total`'s argument order all still read `AGI`/`STR`/`MND`.
- Why: founder decision 2026-08-25, spec
  `docs/superpowers/specs/2026-08-25-character-race-pivot-design.md` §5.5. This
  is deviation #23's move in a second place — the engine keeps its vocabulary
  and the surface gets the player's — and the reason is the same: three-letter
  RPG abbreviations answer a question the pivot stopped asking. Record three
  build facts: **the table moved before it was renamed**, because it lived in
  `StatIcon.tsx` behind an `@expo/vector-icons` import that root Vitest cannot
  parse, so seven call sites were about to be changed with nothing able to fail;
  **two parallel copies existed** and are the reason a "one table" claim needed
  checking — `DOMINANCE_LABELS` on the home screen held its own three words, and
  `boostChipLabel` printed the raw engine key to the player; and **squad program
  names and Challenge area names deliberately did not move**, because "Strength"
  there names a game rather than a stat, which is why each program's blurb now
  names the weighted stat explicitly.

Numbers #44–#50 and #52 belong to the other four plans. Do not claim them here.

- [ ] **Step 2: Update `CLAUDE.md`**

Add a dated block in the style of the existing ones, immediately after the
deviation #41 three-stat block, since that block's `CoreStat` sentence is what a
reader will hit first:

- **Stat surface names are Body (`STR`) · Motion (`AGI`) · Mind (`MND`) as of
  2026-08-25** (deviation #51). Engine keys are unchanged and must stay so.
- **`src/ui/stat-names.ts` is the single source, and it is zero-runtime-import
  on purpose** — `STAT_NAMES` used to live in `StatIcon.tsx`, which reaches
  `@expo/vector-icons` and therefore React Native's Flow syntax that root Vitest
  cannot parse. `StatIcon.tsx` re-exports it so no call site changed. Do not
  import `@/ui/index.ts` from a module root Vitest tests; import
  `@/ui/stat-names.ts` directly.
- **`dominanceName()` replaced `DOMINANCE_LABELS`**, and a parallel table of stat
  words anywhere is stale by construction — the guard is a test in
  `stat-names.test.ts` that scans `src` and `app` for the word `Agility`.
  "Strength" is deliberately not guarded: it survives as a squad program name, a
  Challenge area name and two `HKWorkoutActivityType` identifiers.

Also update the existing sentence in the accessibility block that reads
"`STAT_NAMES` is the single source for stat words" so it names the new file.

- [ ] **Step 3: Update `docs/mvp-scope.md`**

Add a vocabulary row: say **Body / Motion / Mind**, not STR / AGI / MND — engine
keys only. If the IN-scope list names the stats by their old words, update it.

- [ ] **Step 4: Update `docs/user-journey.md`**

Every walkthrough line that names a stat gets the new word. The character-screen
and squad-board sections are where they cluster.

- [ ] **Step 5: Mark the spec superseded in place**

In `docs/Kairo_Master_Summary.md`, §5 and §6 already carry a "superseded by
deviation #41" note. Extend that note in place — do not renumber sections — to
say the *surface* names are Body, Motion and Mind as of deviation #51, while the
keys in those tables remain the engine's.

- [ ] **Step 6: Run everything and commit**

```bash
npm test
npm run typecheck
git add docs/ CLAUDE.md
git commit -m "docs: record Body, Motion and Mind as the stat surface names"
```

Expected: both PASS. If `npm test` fails, fix the code — not the test.

---

## Definition of done

- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes (all three checks — tsc, workspace tsc, deno check).
- [ ] `grep -rn "Agility" src app` returns nothing.
- [ ] `grep -rn "STAT_NAMES\s*[:=]\s*{" src app packages` returns exactly one match, in `src/ui/stat-names.ts`.
- [ ] `grep -rn "CoreStat" packages/kairo-core/src/types.ts` still shows `'AGI' | 'STR' | 'MND'` — no engine key moved.
- [ ] A simulator screenshot at `accessibility-extra-extra-extra-large`, taken after a relaunch, shows the build line and the boost chip unclipped.
- [ ] VoiceOver (or the Accessibility Inspector) reads the stat rail as Body, Motion and Mind.

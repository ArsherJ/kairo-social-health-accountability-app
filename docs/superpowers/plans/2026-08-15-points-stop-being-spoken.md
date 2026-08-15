# Points Stop Being Spoken — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop rendering `daily_scores.total` anywhere except inside Goals — the home hero, the leaderboard row and the VoiceOver label all lose the raw point figure.

**Architecture:** Pure presentation. No migration, no `kairo-core` scoring change, no RPC change. Every decision that needs testing goes into a pure module tested in Node (`row-label.ts`, a new `row-gap.ts`, `stat-detail.ts`); components only render. `squad_leaderboard()` still returns `total` — the client needs it to rank and to compute gaps, it just stops printing it.

**Tech Stack:** TypeScript, Expo/React Native, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-15-points-stop-being-spoken-design.md`

## Global Constraints

- **`daily_scores.total` is not removed.** It ranks the board, scores every Goal (deviation #18), feeds XP/levels/ratings, and carries `flagged` — the only anti-cheat mechanism (§5, §20 #3). This plan changes rendering only.
- **Goals keep points.** `GoalCard`, `GoalBar`, `SquadGoalPanel`, `goal-copy.ts`, `CreateGoalForm` are **not touched** by this plan.
- **Import `Text` from `@/ui`, never from `react-native`.** They are otherwise identical, which is why the wrong one is easy to reach for.
- **`Text` scale:** `prose` (default) for copy in containers that grow, `chrome` for buttons and meta lines, `fixed` for type locked to drawn geometry. Existing call sites already carry the right one — preserve it when editing a line.
- **Leaderboard row grouping is load-bearing.** The row keeps `accessible` + `accessibilityLabel` **and** every direct child keeps `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`. Neither half is redundant; removing one reintroduces a seventy-swipe board.
- **Run `npm run test:core` and `npx vitest run` for app-workspace tests.** Single file: `npx vitest run <path>`.
- **Ordering vs. the sibling plan:** `2026-08-15-solo-mode-walk-strength-run.md` Task 1 renames the `gym` program to `strength` and edits `program-copy.ts`. This plan touches only a *doc comment* in that file (Task 4), so either order works. Recommended: run this plan first — it is small and independently shippable.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/features/squad/row-gap.ts` | **New.** Pure: given the board's rows, the gap from each row to the row above it. | Create |
| `src/features/squad/row-gap.test.ts` | Tests for the above, including the tie case. | Create |
| `src/features/squad/row-label.ts` | The VoiceOver sentence for a row. Loses `total`, gains `gap`, loses `boost`. | Modify |
| `src/features/squad/row-label.test.ts` | Existing cases **updated**, not appended to. | Modify |
| `src/features/squad/LeaderboardRow.tsx` | Renders a row. Loses the total `Numeral` and the duplicate boost chip. | Modify |
| `src/features/squad/Leaderboard.tsx` | Passes gaps into rows. Header chip already exists — unchanged. | Modify |
| `src/features/squad/program-copy.ts` | `boostChipLabel`'s doc comment justifies it by a comparison that no longer exists. | Modify (comment only) |
| `src/features/character/stat-detail.ts` | Gains `topsOut` so copy can name the milestone without naming a tier. | Modify |
| `src/features/character/stat-detail.test.ts` | Covers `topsOut`. | Modify |
| `app/(tabs)/index.tsx` | Hero becomes the day in real units; `detailCopy` names the milestone; the consistency-bonus line is deleted. | Modify |

---

## Task 1: The row's gap is a tested pure function

The row needs "how far behind the row above am I." `resolveStanding()` already
does this for **your own row only**; the board needs it for every row. It is a
pure list computation with a real edge (ties), so it gets its own module rather
than an inline `reduce` in the component.

**Files:**
- Create: `src/features/squad/row-gap.ts`
- Test: `src/features/squad/row-gap.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `leaderboardGaps(rows: readonly GapRow[]): Map<string, number | null>` where `GapRow = { user_id: string; rank: number; total: number }`. A `null` value means "nothing above this row" (rank 1, or tied with the top).

- [ ] **Step 1: Write the failing test**

```ts
// src/features/squad/row-gap.test.ts
import { describe, expect, it } from 'vitest';
import { leaderboardGaps } from './row-gap.ts';

describe('leaderboardGaps', () => {
  it('gives the leader no gap', () => {
    const gaps = leaderboardGaps([
      { user_id: 'a', rank: 1, total: 3000 },
      { user_id: 'b', rank: 2, total: 2400 },
    ]);
    expect(gaps.get('a')).toBeNull();
  });

  it('measures each row against the row above it', () => {
    const gaps = leaderboardGaps([
      { user_id: 'a', rank: 1, total: 3000 },
      { user_id: 'b', rank: 2, total: 2400 },
      { user_id: 'c', rank: 3, total: 2000 },
    ]);
    expect(gaps.get('b')).toBe(600);
    expect(gaps.get('c')).toBe(400);
  });

  it('gives tied rows a zero gap, not a negative one', () => {
    // squad_leaderboard shares a rank between tied members.
    const gaps = leaderboardGaps([
      { user_id: 'a', rank: 1, total: 3000 },
      { user_id: 'b', rank: 1, total: 3000 },
      { user_id: 'c', rank: 3, total: 2500 },
    ]);
    expect(gaps.get('b')).toBe(0);
    // Measured against the best total above it, not the row literally before.
    expect(gaps.get('c')).toBe(500);
  });

  it('handles an unsorted input', () => {
    const gaps = leaderboardGaps([
      { user_id: 'c', rank: 3, total: 2000 },
      { user_id: 'a', rank: 1, total: 3000 },
      { user_id: 'b', rank: 2, total: 2400 },
    ]);
    expect(gaps.get('c')).toBe(400);
  });

  it('returns an empty map for an empty board', () => {
    expect(leaderboardGaps([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/features/squad/row-gap.test.ts`
Expected: FAIL — `Failed to resolve import "./row-gap.ts"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/squad/row-gap.ts
/**
 * How far each row sits behind the one above it.
 *
 * The board stopped printing absolute totals (see
 * `docs/superpowers/specs/2026-08-15-points-stop-being-spoken-design.md`), so a
 * relative figure is what carries "am I catchable today". Pure and tested here
 * rather than inline in the component because ties are the edge that reads as
 * obviously right and is wrong: `squad_leaderboard` shares a rank between tied
 * members, so "the row above" is not "the previous array element".
 */
export interface GapRow {
  user_id: string;
  rank: number;
  total: number;
}

export function leaderboardGaps(
  rows: readonly GapRow[],
): Map<string, number | null> {
  // Sorted rather than trusted: the caller's order is a render order, and this
  // has to be right even if that changes.
  const ordered = [...rows].sort((a, b) => a.rank - b.rank || b.total - a.total);

  const gaps = new Map<string, number | null>();

  // The row immediately above, not the leader. "600 behind" when the person
  // one place ahead is 600 up is actionable; the same row measured against a
  // runaway leader would read as hopeless and say nothing about the place you
  // are actually contesting. This is the same choice `resolveStanding` already
  // made for the character screen's own standing line.
  //
  // Sorted descending by total within a rank, so `previous` is always >= the
  // current row and the subtraction cannot go negative. A tie yields 0.
  let previous: number | null = null;

  for (const row of ordered) {
    gaps.set(row.user_id, previous === null ? null : previous - row.total);
    previous = row.total;
  }

  return gaps;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/features/squad/row-gap.test.ts`
Expected: PASS, 5 tests.

Note the tie case: `b` is tied with `a`, so `bestAbove` is 3000 when `b` is
visited and the gap is `0` — not `null`, because something *is* level with it,
and not negative.

- [ ] **Step 5: Commit**

```bash
git add src/features/squad/row-gap.ts src/features/squad/row-gap.test.ts
git commit -m "feat: per-row leaderboard gaps, with the tie case pinned"
```

---

## Task 2: The VoiceOver label stops speaking points

**This is the task that must not be skipped or deferred.** `row-label.ts:50`
pushes `"3,200 points"` into the row's accessible name. If the visible total goes
and this stays, VoiceOver users hear a number sighted users cannot see — the
label and the row describe different products.

The row's boost chip is also removed in Task 3, so `boost` leaves the label here
at the same time.

**Files:**
- Modify: `src/features/squad/row-label.ts:23-78`
- Test: `src/features/squad/row-label.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 — the gap arrives as an argument.
- Produces: `RowLabelInput` loses `total: number` and `boost?: string | null`; gains `gap: number | null`. `leaderboardRowLabel(input: RowLabelInput): string` keeps its signature.

- [ ] **Step 1: Update the existing tests**

Open `src/features/squad/row-label.test.ts`. Every existing case builds a
`RowLabelInput` with `total` and some with `boost`. **Change them in place** —
do not add new cases beside the old ones. A passing assertion that still expects
`"points"` would mean the number survived, which is the exact failure this task
exists to prevent.

Replace `total: <n>` with `gap: <n | null>` throughout, delete every `boost:`
key, and update the expected strings. Then add these three cases:

```ts
  it('never says points', () => {
    const label = leaderboardRowLabel({
      rank: 2,
      characterName: 'Ana',
      isSelf: false,
      level: 4,
      gap: 340,
      ratings: {},
      statNames: STAT_NAMES,
    });
    expect(label).not.toContain('points');
  });

  it('says the gap for a row with someone above it', () => {
    const label = leaderboardRowLabel({
      rank: 2,
      characterName: 'Ana',
      isSelf: false,
      level: 4,
      gap: 340,
      ratings: {},
      statNames: STAT_NAMES,
    });
    expect(label).toContain('340 behind');
  });

  it('says nothing about a gap for the leader', () => {
    const label = leaderboardRowLabel({
      rank: 1,
      characterName: 'Ana',
      isSelf: false,
      level: 4,
      gap: null,
      ratings: {},
      statNames: STAT_NAMES,
    });
    expect(label).not.toContain('behind');
  });

  it('says nothing about a gap for a tied row', () => {
    const label = leaderboardRowLabel({
      rank: 1,
      characterName: 'Ana',
      isSelf: false,
      level: 4,
      gap: 0,
      ratings: {},
      statNames: STAT_NAMES,
    });
    // "0 behind" is a sentence no person says, and the row draws nothing in
    // the gap column for a tie — so the label must not invent something the
    // screen does not show. The shared rank already conveys the tie.
    expect(label).not.toContain('behind');
    expect(label).not.toContain('0');
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/features/squad/row-label.test.ts`
Expected: FAIL — TypeScript errors on the unknown `gap` property, plus assertion
failures on the strings.

- [ ] **Step 3: Update the interface**

In `src/features/squad/row-label.ts`, replace the `total` field and delete the
`boost` field:

```ts
  /**
   * Points behind the row above, or null when nothing is above this row.
   *
   * The board stopped printing absolute totals, so this is what the label says
   * instead — and it must match the row exactly. A screen reader that spoke a
   * figure the screen does not show would be describing a different product.
   */
  gap: number | null;
```

Delete these two lines entirely:

```ts
  /** The program boost chip, shown only on your own row. */
  boost?: string | null;
```

- [ ] **Step 4: Update the sentence**

Replace line 50 (`parts.push(\`${input.total.toLocaleString()} points\`);`) with:

```ts
  // Relative, never absolute — and only when there is a gap to speak of. The
  // condition matches the row's render condition exactly rather than
  // approximating it: the leader and a tied row both draw nothing in the gap
  // column, so a label claiming otherwise would describe a different screen.
  // The shared rank is what conveys a tie.
  if (input.gap !== null && input.gap > 0) {
    parts.push(`${input.gap.toLocaleString()} behind`);
  }
```

And delete the boost line further down:

```ts
  if (input.boost) parts.push(input.boost);
```

- [ ] **Step 5: Update the module docstring**

The header still describes what the row draws. Change `and the total.` in the
first paragraph to `and the gap.`, and delete `a boost chip,` from the list of
pieces — both now describe a row that no longer exists.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run src/features/squad/row-label.test.ts`
Expected: PASS. If any old assertion still expects `"points"`, Step 1 was done by
appending instead of editing — go back and fix it.

- [ ] **Step 7: Commit**

```bash
git add src/features/squad/row-label.ts src/features/squad/row-label.test.ts
git commit -m "fix: the spoken leaderboard row stops saying points

Says the gap instead, matching what the row will show. A label that
spoke a figure the screen does not display would be describing a
different product to VoiceOver users."
```

---

## Task 3: The leaderboard row drops the total and the duplicate chip

Two removals. The total `Numeral` is the point of the task; the boost chip goes
because its documented purpose was explaining why the row's total differed from
the character screen's, and neither total exists any more.

**The header keeps its chip.** `Leaderboard.tsx:236-242` already renders
`programLabel(squad.program)` plus `boostChipLabel(squad.program)` on the board
header. That is the spec's "repurpose it as program information" — already built.
Only the row's duplicate goes.

**Files:**
- Modify: `src/features/squad/LeaderboardRow.tsx` (lines 38, 72, 149-155, 180-186, and the `boostChip`/`boostLabel` styles at 232-238)
- Modify: `src/features/squad/Leaderboard.tsx` (pass gaps to rows)

**Interfaces:**
- Consumes: `leaderboardGaps` from Task 1; the updated `RowLabelInput` from Task 2.
- Produces: `LeaderboardRow` gains a required `gap: number | null` prop.

- [ ] **Step 1: Add the `gap` prop and remove the row's boost**

In `LeaderboardRow.tsx`, change the component signature:

```tsx
export function LeaderboardRow({
  row,
  mode,
  gap,
}: {
  row: Row;
  mode: LeaderboardMode;
  gap: number | null;
}) {
  const isLeader = row.rank === 1;
```

Delete line 38 entirely:

```tsx
  const boost = row.is_self ? boostChipLabel(row.program) : null;
```

Delete the now-unused import on line 3 (`import { boostChipLabel } from './program-copy.ts';`).

- [ ] **Step 2: Update the accessibility label call**

In the `accessibilityLabel={leaderboardRowLabel({...})}` block, replace
`total: row.total,` with `gap,` and delete the `boost,` line.

- [ ] **Step 3: Delete the row's boost chip JSX and its styles**

Remove the whole block at 149-155:

```tsx
          {boost && (
            <View style={styles.boostChip}>
              <Text scale="fixed" style={styles.boostLabel}>
                {boost}
              </Text>
            </View>
          )}
```

And delete the `boostChip` and `boostLabel` entries from this file's
`StyleSheet.create` (around lines 232-238). Leave `Leaderboard.tsx`'s
identically-named styles alone — those belong to the header chip, which stays.

- [ ] **Step 4: Replace the trailing total with the gap**

Replace the block at 180-186:

```tsx
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Numeral
          value={row.total}
          size="minor"
          color={row.is_self ? ramp.accent[800] : colors.text}
        />
      </View>
```

with:

```tsx
      {/* Relative, not absolute. The leader has nothing above them, so the
          column is empty rather than showing a zero that reads as a score. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {gap !== null && gap > 0 && (
          <Text scale="fixed" style={styles.gap}>
            −{gap.toLocaleString()}
          </Text>
        )}
      </View>
```

Add the style beside `rank`:

```tsx
  gap: { ...font.body.strong, fontSize: 11.5, color: ramp.neutral[600] },
```

Remove `Numeral` from this file's `@/ui` import if nothing else uses it — check
first, the rank may.

- [ ] **Step 5: Feed gaps in from the board**

In `Leaderboard.tsx`, import and compute once, above the render:

```tsx
import { leaderboardGaps } from './row-gap.ts';
```

```tsx
  // One pass over the board, not a scan per row.
  const gaps = leaderboardGaps(rows);
```

`rows` is whatever array is already mapped into `<LeaderboardRow>`. Pass it
through at the call site:

```tsx
<LeaderboardRow key={row.user_id} row={row} mode={mode} gap={gaps.get(row.user_id) ?? null} />
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS. A failure naming `boost` or `total` on `RowLabelInput` means
Task 2's interface change and this task's call site have drifted.

- [ ] **Step 7: Commit**

```bash
git add src/features/squad/LeaderboardRow.tsx src/features/squad/Leaderboard.tsx
git commit -m "feat: leaderboard rows show rank and gap, not an absolute total

The row's boost chip goes with it: its documented job was explaining why
the row's total differed from the character screen's unweighted one, and
neither total is rendered now. The board header already carries the same
chip, which is where program information belongs."
```

---

## Task 4: `boostChipLabel`'s comment stops citing a vanished comparison

Pure documentation, but it is the kind of stale comment `CLAUDE.md` calls out
specifically — it explains a discrepancy that can no longer be observed, and a
future reader would take it as a live constraint.

**Files:**
- Modify: `src/features/squad/program-copy.ts:43-50`

- [ ] **Step 1: Replace the docstring**

```ts
/**
 * The boost, said out loud — e.g. `AGI ×1.5`. Null on an untilted board.
 *
 * This is **program information**: what game this squad is playing. It lives on
 * the board header, next to the program name.
 *
 * It used to sit on the user's own row instead, to explain why that row's total
 * differed from the character screen's unweighted one. Neither total is rendered
 * any more (see
 * `docs/superpowers/specs/2026-08-15-points-stop-being-spoken-design.md`), so
 * there are no two numbers left to reconcile and the row's copy was removed.
 */
```

- [ ] **Step 2: Confirm nothing else broke**

Run: `npx vitest run src/features/squad/program-copy.test.ts`
Expected: PASS, unchanged — this task edits only a comment.

- [ ] **Step 3: Commit**

```bash
git add src/features/squad/program-copy.ts
git commit -m "docs: boostChipLabel is program info, not a discrepancy note"
```

---

## Task 5: The guidance line names the milestone, not the points

`detailCopy()` says `"1,240 more steps for +400 AGI."` The `+400` is points.

To say *"tops out your Agility today"* the copy has to know whether the next band
is the **top** band — and `StatDetail` does not currently expose that.
`nextTierFor()` knows (it returns `null` at Gold and names the next tier
otherwise), so the fact is available; it just is not carried through. Adding it
keeps the tier name internal, which deviation #23 requires.

**Files:**
- Modify: `src/features/character/stat-detail.ts:16-35, 100-118`
- Test: `src/features/character/stat-detail.test.ts`
- Modify: `app/(tabs)/index.tsx:92-114`

**Interfaces:**
- Consumes: nothing.
- Produces: the `'gap'` variant of `StatDetail` gains `topsOut: boolean`. `points` **stays on the type** — it is derived from `TIER_POINTS`, it is tested, and `resolveStatDetail`'s choice of which stat to mention still depends on band arithmetic.

- [ ] **Step 1: Write the failing test**

Add to `src/features/character/stat-detail.test.ts`:

```ts
  it('marks a gap into the top band as topping out', () => {
    // AGI silver is 5,000 and gold is 10,000, so 8,000 steps is one band short.
    const detail = resolveStatDetail({
      totals: { steps: 8_000, activeKcal: 0, activeMinutes: 0, activeHours: 0, distanceM: 0 },
      lane: 'AGI',
    });
    expect(detail).toMatchObject({ kind: 'gap', stat: 'AGI', topsOut: true });
  });

  it('does not mark a gap into a middle band as topping out', () => {
    // 2,000 steps is inside bronze, so the next band up is silver, not gold.
    const detail = resolveStatDetail({
      totals: { steps: 2_000, activeKcal: 0, activeMinutes: 0, activeHours: 0, distanceM: 0 },
      lane: 'AGI',
    });
    expect(detail).toMatchObject({ kind: 'gap', stat: 'AGI', topsOut: false });
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/features/character/stat-detail.test.ts`
Expected: FAIL — `topsOut` is undefined on the result.

- [ ] **Step 3: Carry the fact through**

In `stat-detail.ts`, add to the `'gap'` variant of the `StatDetail` union:

```ts
      /**
       * The next band is the top one — this is the last step available on this
       * stat today. Carried as a boolean rather than a tier name because
       * Bronze/Silver/Gold are internal to scoring (deviation #23); the copy
       * needs to know *that* it is the last step, never what it is called.
       */
      topsOut: boolean;
```

Add `topsOut` to the local `Open` interface:

```ts
  interface Open {
    stat: CoreStat;
    points: number;
    gap: number;
    topsOut: boolean;
    /** Share of the current band still to go, 0–1. Comparable across stats. */
    remaining: number;
  }
```

In the `for (const stat of CORE_STATS)` loop, set it when pushing:

```ts
    open.push({
      stat,
      points: next.pointsGain,
      gap: next.gap,
      topsOut: next.tier === 'gold',
      remaining: next.gap / bandWidth,
    });
```

And add it to the returned object:

```ts
  return {
    kind: 'gap',
    stat: chosen.stat,
    lane: chosen.stat === lane,
    gap: chosen.gap,
    points: chosen.points,
    topsOut: chosen.topsOut,
    unit: STAT_UNITS[chosen.stat],
  };
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/features/character/stat-detail.test.ts`
Expected: PASS, including every pre-existing case.

- [ ] **Step 5: Rewrite the copy**

In `app/(tabs)/index.tsx`, replace the whole `'gap'` branch of `detailCopy`:

```tsx
    case 'gap': {
      // Named in raw units and in what the effort *achieves* — never in points
      // and never in tier names. This line has carried three vocabularies:
      // "for Gold" (retired by deviation #23, tiers went internal), "for +400
      // AGI" (retired by the points spec), and this one. Each retirement had
      // the same motive: name something the user can recognise.
      const gap = detail.gap.toLocaleString();
      const name = STAT_NAMES[detail.stat];
      const outcome = detail.topsOut
        ? `tops out your ${name} today`
        : `lifts your ${name} today`;
      if (detail.lane) {
        // `·` matches standingCopy's separator above — one rhetorical pattern
        // (clause · clause), one glyph, across this screen's two copy lines.
        // No multiplier is claimed: the lane is marked, never scaled.
        return `Your lane · ${gap} more ${detail.unit} ${outcome}.`;
      }
      return `${gap} more ${detail.unit} ${outcome}.`;
    }
```

`STAT_NAMES` is already exported from `@/ui` — add it to the existing import
from `@/ui/index.ts` at the top of the file if it is not there.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/character/stat-detail.ts src/features/character/stat-detail.test.ts 'app/(tabs)/index.tsx'
git commit -m "feat: the guidance line names the milestone instead of the points

StatDetail carries topsOut so the sentence can say 'tops out your
Agility today' without naming a tier — the bands stay internal to
scoring, per deviation #23."
```

---

## Task 6: The home hero becomes the day in real units

The task the founder actually asked for. `app/(tabs)/index.tsx` renders the day's
total as a `hero` `Numeral` — its own comment calls it "the single most
emphasised element on this screen," and it is a four-digit integer with no unit.

**Files:**
- Modify: `app/(tabs)/index.tsx:340-372`

**Interfaces:**
- Consumes: `buckets.data?.totals` (a `DayTotals`), already fetched by `useTodayBuckets` for the stat coins. No new query.

- [ ] **Step 1: Replace the hero**

Replace the guarded `Numeral` block (the one wrapped in `{!score.isPending && (`)
with a units-bearing line. `DayTotals` gives `steps`, `activeHours`,
`activeMinutes`:

```tsx
          {/* The day in the units it was lived in. This slot used to hold
              `daily_scores.total` — a four-digit integer with no unit, no label
              and no target, which is exactly what a first-time user cannot
              read. The engine still computes it; it ranks the board and scores
              every Goal. It is simply not something to put in 48pt type.

              Guarded on the buckets query, not the score query: this reads
              totals now, and a pending query must render nothing rather than a
              confident zero that jumps to the real figure. */}
          {buckets.data?.totals != null && (
            <View style={styles.heroRow}>
              <Numeral
                value={buckets.data.totals.steps}
                size="hero"
                color={ramp.accent[700]}
                animate
                style={styles.hero}
              />
              <Text scale="fixed" style={styles.heroUnit}>
                steps
              </Text>
            </View>
          )}

          {buckets.data?.totals != null && (
            <Text style={styles.heroMeta}>
              {buckets.data.totals.activeHours} active{' '}
              {buckets.data.totals.activeHours === 1 ? 'hour' : 'hours'} ·{' '}
              {Math.round(buckets.data.totals.activeMinutes)} active min
            </Text>
          )}
```

Steps lead because they are the figure the most users can earn and the one the
Daily Walk baseline is about to give a target to. The exact composition is a
`frontend-design` question (Step 4) — what this step locks in is that **every
number in the hero slot carries its unit.**

- [ ] **Step 2: Delete the consistency-bonus line**

Remove this block entirely:

```tsx
          {bonus > 0 && (
            <Text style={styles.meta}>
              Includes {bonus.toLocaleString()} for consistency
              {(today?.rec_points ?? 0) > 0 ? ' and recovery' : ''}.
            </Text>
          )}
```

Its own comment says it exists because "the four coins visibly do not account
for the hero total." There is no hero total to account for. Delete the `bonus`
variable it read, and any now-unused `styles.meta` — check the file first, other
lines may use it.

The consistency bonus and REC still score exactly as before. They just stop
being narrated as arithmetic.

- [ ] **Step 3: Add the styles**

```tsx
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  heroUnit: { ...font.body.strong, fontSize: 15, color: ramp.neutral[700] },
  heroMeta: { ...font.body.strong, fontSize: 12.5, color: ramp.neutral[700], marginTop: 2 },
```

- [ ] **Step 4: Design pass**

**REQUIRED:** run the `frontend-design` skill over this screen before considering
the task done. Per `CLAUDE.md`, any modified screen under `app/` gets a design
pass so it lands as intentional design rather than RN defaults — and this is the
app's focal element changing shape, from one short integer to several
unit-bearing figures.

Apply its output to the composition above.

- [ ] **Step 5: Verify at large Dynamic Type**

This is a wrapping change, not a swap, so the default size proves little.

```bash
npm run ios
xcrun simctl ui booted content_size accessibility-extra-extra-extra-large
xcrun simctl io booted screenshot /tmp/hero-xxxl.png
xcrun simctl ui booted content_size medium
```

Open the screenshot. Expected: the hero row and its meta line wrap rather than
clip or overlap, and the Today shelf still reads top-to-bottom. **Do not add a
`top` offset to fix a collision** — the HUD above is flow-based on purpose after
the 2026-08-14 device pass, and reintroducing absolute positioning is how that
regression returns.

- [ ] **Step 6: Typecheck and full test run**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 'app/(tabs)/index.tsx'
git commit -m "feat: the home hero says the day in real units, not a point total

'The first time I see it, I don't know what that is for.' The slot held
daily_scores.total in 48pt type with no unit or label. The engine is
unchanged — it still ranks the board and scores every Goal.

The 'Includes N for consistency' line goes with it: it existed only to
reconcile the stat coins against the hero total."
```

---

## Task 7: Verify by search, then document

The claim "points are spoken only inside Goals" is falsifiable by search, and a
missed surface is exactly how this half-lands.

**Files:**
- Modify: `app/progress.tsx`
- Modify: `docs/roadmap.md` (deviations table)
- Modify: `docs/user-journey.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Fix the help sheet's "Daily score" entry**

`app/progress.tsx`'s `ENTRIES[0]` says *"Together they are today's score, and
that is what ranks you on the squad board."* After this plan the score is
rendered nowhere, so the sentence describes something the reader cannot find.

The entry should **stay** — it becomes the one place a curious user can learn
what ranks them, which is more valuable now, not less. Only the assumption that
you can see it is wrong:

```ts
  {
    term: 'Daily score',
    scope: 'Today only',
    body: 'Steps, calories, active minutes and how many hours you moved each earn points behind the scenes. Together they are today’s score — you won’t see the number, but it is what ranks you on the squad board and what your goals are measured against. It resets at midnight in your own timezone — not the squad’s.',
  },
```

Check the other three entries too: "Ability ratings", "Level and XP" and
"Streak" all describe things still on screen, so they should need no change —
confirm rather than assume.

- [ ] **Step 2: Search for surviving point rendering**

```bash
grep -rn "total\b" --include="*.tsx" src app | grep -v "src/features/goals/" | grep -vi "totals\."
grep -rn "points" --include="*.tsx" --include="*.ts" src app | grep -v "src/features/goals/" | grep -v "\.test\." | grep -v "statPoints\|pointsGain\|StatPoints"
```

Every remaining hit must be one of: a Goal surface, a meter denominator
(`MAX_DAILY_SCORE_*` sizing a bar), a `DayTotals` field access, or internal
scoring. Anything else is a surface this plan missed — fix it before continuing.

- [ ] **Step 3: Verify one leaderboard row under VoiceOver**

The row's grouping cost two builds to find and confirm, and Task 2 edits that
exact label — so it is re-verified, not assumed.

Open the squad tab on the simulator with the Accessibility Inspector
(Xcode → Open Developer Tool → Accessibility Inspector, target the simulator).
Expected: one row is **one element**, and its spoken text names rank, name, gap,
level and ratings — and contains no absolute total.

- [ ] **Step 4: Add the roadmap deviation**

Append to the deviations table in `docs/roadmap.md`. It sits directly downstream
of #23 and should say so:

```markdown
| 30 | The day's `daily_scores.total` is the home screen's hero number, and each leaderboard row shows its own total | **Points are spoken only inside Goals.** The home hero is the day in real units; a board row is rank and the gap to the row above; `row-label.ts` speaks the gap, never the total | Founder decision 2026-08-15: "I think we should remove the scoring. The first time I see it, I don't know what that is for." Directly downstream of #23 — the same argument that made Bronze/Silver/Gold internal to scoring, applied to the total itself. **The engine is untouched**: `total` still ranks `squad_leaderboard()`, still scores every Goal (#18), still feeds `xp_awarded`/`total_xp`/levels/ratings, and still carries `flagged`, which via the board is the only anti-cheat mechanism §5/§20 #3 leave standing. What changed is what is rendered. Points survive inside Goals because there the user typed the target themselves, and a number you chose explains itself in a way an ambient daily total never does. Three consequences worth not rediscovering: `row-label.ts` was speaking `"N points"` into the accessible name, so VoiceOver users would have heard a figure sighted users could not see; the "Includes N for consistency" line existed *only* to reconcile the stat coins against the hero total and deleted with no replacement; and the leaderboard row's boost chip was justified by explaining why that row's total differed from the character screen's unweighted one, so with neither total rendered its documented purpose evaporated — the board **header** already carried the same chip, which is where program information belongs. |
```

- [ ] **Step 5: Update `docs/user-journey.md`**

Find the daily-loop section describing what the user sees on opening the app.
The opening beat changes from a point total to the day in real units, and the
squad board's rows change from totals to rank-and-gap. This document is wrong
the moment this ships, so it changes in the same pass.

- [ ] **Step 6: Add the `CLAUDE.md` line**

In the same register as the existing tier and Hunter entries, so a future pass
does not helpfully restore a total to the home screen:

```markdown
**Points are spoken only inside Goals, as of 2026-08-15.** `daily_scores.total`
still ranks the board, scores every Goal, and feeds XP and ratings — nothing
about the engine changed, exactly as with tiers in deviation #23. But no ambient
surface prints it: the home hero is the day in real units, a leaderboard row is
rank and the gap to the row above, and `src/features/squad/row-label.ts` speaks
that gap rather than a total — deliberately, because a screen reader naming a
figure the screen does not show describes a different product. A Goal keeps its
points because the user typed that target. If you find a surface outside
`src/features/goals/` rendering a score total, it is stale — fix it.
```

- [ ] **Step 7: Commit**

```bash
git add app/progress.tsx docs/roadmap.md docs/user-journey.md CLAUDE.md
git commit -m "docs: record points-only-in-goals as deviation #30

The 'How progress works' sheet keeps its Daily score entry — it becomes
the one place a curious user can learn what ranks them — but stops
implying the number is visible."
```

---

## Done when

- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] The grep in Task 7 Step 2 returns no point rendering outside `src/features/goals/`.
- [ ] A leaderboard row is one element under the Accessibility Inspector, and its spoken text has no absolute total.
- [ ] The home shelf reads correctly at `accessibility-extra-extra-extra-large`.
- [ ] `docs/roadmap.md`, `docs/user-journey.md` and `CLAUDE.md` are updated.

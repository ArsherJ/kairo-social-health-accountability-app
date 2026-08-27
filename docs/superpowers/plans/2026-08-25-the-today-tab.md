# The Today Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the present moment a tab of its own — three quests, the Daily Walk, the Challenge door and the race you are currently in — and open it to a brand-new account on day one.

**Architecture:** Quests are **derived, never stored**, exactly as a Challenge is: three are picked per account per local date by a pure function of `(userId, localDate)` over a hand-authored catalogue in `@kairo/core`, so the midnight reset costs nothing and there is no state a retroactive Apple revision can invalidate. Only the *completion* is stored, written by `finalize-days` from final days and rolled into `profiles.total_xp` as a fourth source. On the client, a fourth orbit disc appears in `TabPill` and `app/(tabs)/today.tsx` takes the four daily cards off the character screen's shelf. The disclosure gate is untouched — same constant, same threshold test, same retention measurement, same list of gated surfaces; quests are simply built outside it, and the Challenge door keeps the `full` wrapper it had on the character screen.

**Tech Stack:** TypeScript (zero-dependency `@kairo/core`), Postgres/Supabase (plpgsql, `security definer`, column-level grants), Deno Edge Functions, React Native / Expo Router, Vitest, PGlite.

**Spec:** `docs/superpowers/specs/2026-08-25-the-today-tab-design.md` — this subsystem's design, which carries the decisions taken while planning it.
**Parent spec:** `docs/superpowers/specs/2026-08-25-character-race-pivot-design.md` — authoritative for everything cross-cutting. Read both.

## This is plan 3 of 5

| Plan | Scope | Depends on |
|---|---|---|
| 1. The Race | `race.ts`, widened projection, consent gate, lanes on the Squad tab, solo ghost race | — |
| 2. Body · Motion · Mind | `STAT_NAMES` and every surface reading it | — |
| **3. The Today tab** (this plan) | Fourth tab, quests, race hero card | 1 |
| 4. Goals → Events + Battle | Table reshape, `create_event()`, `event_progress()`, pooled grading | — |
| 5. Digest + level response | One push a day, louder level bands on the figure | 1, 3, 4 |

**Depends on plan 1** for exactly two things, both in Task 7: `rankRacers` /
`RACE_FINISH_LINE` from `@kairo/core`, and `LeaderboardRow.steps` being present
and nullable. Tasks 1–6 and 8–9 have no dependency on plan 1 and can run first.

**Deliberately out of this plan:** the goal surfaces. `GoalCard`, `/goal/new` and
`SquadGoalPanel` keep their disclosure gate untouched here and are deleted
wholesale by plan 4. Removing a gate from a card that is about to be deleted is
work that can only produce a merge conflict.

## Global Constraints

- **`packages/kairo-core` stays pure and zero-dependency.** No I/O, no clock reads, no randomness. Every function takes what it needs as an argument. Quest selection is therefore a *hash*, never `Math.random()` — a random pick would give the same account different quests on every render.
- **Imports use explicit `.ts` extensions.**
- **`src/ui/Text.tsx` is the only Text.** Import from `@/ui`, never from `react-native`. `allowFontScaling={false}` appears nowhere in this codebase and must not start.
- **The Daily Walk baseline is `DAILY_STEP_BASELINE`, imported, never written as a literal.** `10_000` must not appear anywhere in the code this plan adds. The Daily Walk card moves tabs; its number does not change and never scales with the user.
- **Never `create or replace` a function whose signature changes.** Drop by exact argument list first — a surviving overload fails nothing until a call site resolves to it.
- **A column-level `REVOKE` against a table-level `GRANT` is silently a no-op.** Revoke the table grant, then re-grant the allowed columns in full.
- **A migration touching a table an Edge Function writes ships with that function's redeploy**, and `supabase/scripts/smoke-sync.mjs` runs after. This plan's migration creates a table `finalize-days` writes, so the redeploy is mandatory, not optional.
- **Applying a migration on this machine** means `./supabase/scripts/remote-sql.sh -f <file>` (port 5432 is blocked, Docker unavailable), wrapped in `begin; … commit;`, then inserting the `supabase_migrations.schema_migrations` row by hand.
- **Edge Function handlers stay thin.** Every decision lives in a `*-plan.ts` module tested in plain Node; `index.ts` only authenticates, reads, plans, writes.
- **UI is verified by hand on the simulator**, not by component tests.
- **Accessibility grouping is explicit:** a parent gets `accessible` + `accessibilityLabel` **and** every direct child gets `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`. Both halves. Neither is redundant.
- **Hide on `stage`, navigate on `resolved && stage`.** The stage reads `core` while the count is in flight, which is correct for hiding a card and wrong for a redirect.

## Two refinements of the spec, decided here

**1. Quest tier is engagement, not capability — and that is the spec's choice,
recorded rather than silently improved.** Spec §5.3 says tier is "auto-assigned
from the account's trailing scored days". A count of scored days measures how
long someone has been here, not how far they walk, so a thirty-day account
averaging 3,000 steps is assigned the same tier as one averaging 15,000. The
alternative — a trailing median of daily steps, the pattern `challenge.ts` uses
— was considered and **not** taken, because it makes the quest bar move with the
user, which is the exact conflation the Daily Walk exists to refuse and which
the spec's own §5.3 restates one paragraph later. The manual override in Profile
is the escape hatch for the mismatched case, and it is why the override is in
Phase 1 rather than deferred.

**2. `recalculate_user_xp` gains a fourth source, and plan 4 rewrites the same
function.** That function is a full recompute, not an increment, so it is written
out whole every time it changes. Whichever of plans 3 and 4 lands second **must
read the deployed body first** (`./supabase/scripts/remote-sql.sh "select
prosrc from pg_proc where proname = 'recalculate_user_xp'"`) and include the
other plan's source in its own migration. Landing them in either order is fine;
landing the second one blind silently drops a whole XP source and every affected
account's level falls on the next write. Task 3 Step 3 states this in the
migration itself.

---

### Task 1: `quest.ts` — the catalogue, the tier, the daily pick

**Files:**
- Create: `packages/kairo-core/src/quest.ts`
- Create: `packages/kairo-core/src/quest.test.ts`
- Modify: `packages/kairo-core/src/index.ts` (add one export line)

**Interfaces:**
- Consumes: nothing. Pure, and deliberately imports nothing from the rest of the package — a quest reads raw units, never points or tiers.
- Produces: `QUEST_CATALOGUE`, `QUESTS_PER_DAY`, `questTier()`, `pickQuests()`, `questProgress()`, `questMet()`, and the types `QuestId`, `QuestTier`, `QuestMetric`, `QuestDef`, `QuestDay`, `QuestState`. Tasks 2, 4, 6 and 7 consume all of these.

**Why the catalogue lives in `@kairo/core` and not in the feature folder.**
`finalize-days` grades quests and imports `_shared/core.ts`, so the definitions
must be reachable from the server; the *sentences* are the app's and live in
`quest-copy.ts` (Task 2). That is exactly the split `challenge.ts` and
`challenge-copy.ts` already use.

- [ ] **Step 1: Write the failing test**

Create `packages/kairo-core/src/quest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  QUESTS_PER_DAY,
  QUEST_CATALOGUE,
  pickQuests,
  questMet,
  questProgress,
  questTier,
  type QuestDay,
} from './index.ts';

const day: QuestDay = {
  steps: 0,
  activeKcal: 0,
  activeHours: 0,
  distanceM: 0,
  sleepMinutes: null,
};

describe('QUEST_CATALOGUE', () => {
  it('has enough at every tier that a day is a choice, not a rerun', () => {
    for (const tier of ['starter', 'steady', 'strong'] as const) {
      const forTier = QUEST_CATALOGUE.filter((q) => q.tier === tier);
      expect(forTier.length).toBeGreaterThanOrEqual(QUESTS_PER_DAY * 2);
    }
  });

  it('has unique ids, because an id is what a completion stores', () => {
    const ids = QUEST_CATALOGUE.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pays XP that cannot rival a day of real activity', () => {
    // MAX_REALISTIC_DAILY_XP is 200. Three quests must stay a garnish on the
    // day, not a substitute for it — otherwise the cheapest way to level is to
    // clear three easy bars and stop.
    const dearest = Math.max(...QUEST_CATALOGUE.map((q) => q.xp));
    expect(dearest * QUESTS_PER_DAY).toBeLessThanOrEqual(60);
  });
});

describe('questTier', () => {
  it('starts a new account on the easiest tier', () => {
    expect(questTier({ trailingScoredDays: 0 })).toBe('starter');
    expect(questTier({ trailingScoredDays: 6 })).toBe('steady');
  });

  it('moves up with time on the app, not with how far the user walks', () => {
    expect(questTier({ trailingScoredDays: 7 })).toBe('steady');
    expect(questTier({ trailingScoredDays: 28 })).toBe('strong');
  });

  it('lets a manual override win outright', () => {
    // The override exists because the auto rule measures engagement rather
    // than capability, so it is wrong for a long-standing gentle user by
    // construction. A rule that could veto the override would make it a hint.
    expect(questTier({ trailingScoredDays: 90, override: 'starter' })).toBe('starter');
    expect(questTier({ trailingScoredDays: 0, override: 'strong' })).toBe('strong');
  });

  it('treats a NaN count as a new account rather than throwing', () => {
    expect(questTier({ trailingScoredDays: Number.NaN })).toBe('starter');
  });
});

describe('pickQuests', () => {
  it('gives the same account the same three quests all day', () => {
    const a = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady' });
    const b = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady' });
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it('gives a different set tomorrow, which is the whole reset mechanism', () => {
    const today = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady' });
    const tomorrow = pickQuests({ userId: 'u1', localDate: '2026-08-26', tier: 'steady' });
    expect(today.map((q) => q.id)).not.toEqual(tomorrow.map((q) => q.id));
  });

  it('gives two accounts different quests on the same day', () => {
    const one = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady' });
    const two = pickQuests({ userId: 'u2', localDate: '2026-08-25', tier: 'steady' });
    expect(one.map((q) => q.id)).not.toEqual(two.map((q) => q.id));
  });

  it('never repeats a quest inside one day', () => {
    const picked = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'strong' });
    expect(new Set(picked.map((q) => q.id)).size).toBe(QUESTS_PER_DAY);
  });

  it('picks only from the requested tier', () => {
    const picked = pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'starter' });
    expect(picked.every((q) => q.tier === 'starter')).toBe(true);
  });

  it('returns exactly three', () => {
    expect(pickQuests({ userId: 'u1', localDate: '2026-08-25', tier: 'steady' })).toHaveLength(
      QUESTS_PER_DAY,
    );
  });
});

describe('questProgress', () => {
  const stepQuest = QUEST_CATALOGUE.find((q) => q.metric === 'steps')!;

  it('measures the day in the quest\'s own raw unit', () => {
    const state = questProgress(stepQuest, { ...day, steps: stepQuest.target / 2 });
    expect(state.value).toBe(stepQuest.target / 2);
    expect(state.fraction).toBeCloseTo(0.5);
  });

  it('clamps the bar rather than overflowing it', () => {
    const state = questProgress(stepQuest, { ...day, steps: stepQuest.target * 9 });
    expect(state.fraction).toBe(1);
  });

  it('treats a missing sleep row as unknown, never as zero', () => {
    // Null is not zero — the same rule `rawFor` in stat-detail.ts follows. A
    // fabricated 0 would render a sleep quest as "0 of 420 minutes" on a night
    // Kairo simply has no reading for, which reads as an accusation.
    const sleepQuest = QUEST_CATALOGUE.find((q) => q.metric === 'sleep_minutes')!;
    const state = questProgress(sleepQuest, { ...day, sleepMinutes: null });
    expect(state.value).toBeNull();
    expect(state.fraction).toBe(0);
    expect(state.met).toBe(false);
  });
});

describe('questMet', () => {
  const stepQuest = QUEST_CATALOGUE.find((q) => q.metric === 'steps')!;

  it('clears inclusively, at exactly the target', () => {
    expect(questMet(stepQuest, { ...day, steps: stepQuest.target })).toBe(true);
    expect(questMet(stepQuest, { ...day, steps: stepQuest.target - 1 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:core -- --run src/quest.test.ts`
Expected: FAIL — the module does not exist, so the import from `./index.ts` cannot resolve `QUEST_CATALOGUE`.

- [ ] **Step 3: Write the module**

Create `packages/kairo-core/src/quest.ts`:

```ts
/**
 * Quests — three small things to do today (roadmap deviation #50).
 *
 * **Derived, never stored.** The three quests an account sees are a pure
 * function of `(userId, localDate, tier)`, so the local-midnight reset costs no
 * job, no row and no cron: tomorrow's date simply hashes to a different three.
 * That is the same property a Challenge has, and it buys the same thing — there
 * is nothing stateful for a retroactive Apple revision to invalidate, because
 * progress is replayed from `health_buckets` like everything else. Only the
 * *completion* is stored, because it pays XP and must fire exactly once.
 *
 * Quests read **raw units** — steps, kcal, minutes, metres — never points and
 * never tiers. A quest that said "score 1,200 AGI" would be a target the user
 * cannot go outside and do, which is the exact failure the points spec
 * (2026-08-15) removed from every other surface.
 *
 * Pure and zero-dependency: no I/O, no clock reads, and **no randomness**. The
 * pick is a hash, not `Math.random()` — a random pick would hand the same
 * account a different three on every render, and the user would watch their
 * morning's work disappear.
 */

export type QuestTier = 'starter' | 'steady' | 'strong';

/**
 * What a quest counts. Every value is a raw figure the app already reads for
 * some other reason — `aggregateBuckets` produces the first four and
 * `daily_sleep` the fifth — so no quest widens what Kairo collects.
 */
export type QuestMetric =
  | 'steps'
  | 'active_kcal'
  | 'active_hours'
  | 'distance_m'
  | 'sleep_minutes';

export type QuestId = string;

export interface QuestDef {
  /**
   * Stable forever: this is what `quest_completions.quest_id` stores, and a
   * renamed id orphans every completion already banked against it. Retire a
   * quest by deleting the row and leaving the id unused, never by reusing it
   * for a different bar.
   */
  id: QuestId;
  tier: QuestTier;
  metric: QuestMetric;
  /** The bar, in the metric's own raw unit. Cleared inclusively. */
  target: number;
  xp: number;
}

/** Three a day (spec §5.3). Three is a glance; five is a chore list. */
export const QUESTS_PER_DAY = 3;

/**
 * The authored set.
 *
 * Hand-written rather than generated, and that is a stated ongoing cost (spec
 * §13) rather than an oversight: a generated quest cannot be checked for being
 * absurd on a rest day, and the whole point of the tab is that a new user reads
 * three things they could actually do before lunch.
 *
 * **At least six per tier**, so `pickQuests` has something to choose between —
 * with exactly three, every day would show the same three in a different order
 * and the reset would read as a bug. The test pins `QUESTS_PER_DAY * 2`.
 *
 * XP is small on purpose. `MAX_REALISTIC_DAILY_XP` is 200; three quests cap at
 * 60 together, so clearing all three is worth about a third of a strong day.
 * A quest is a garnish on the loop, never a cheaper route through it.
 */
export const QUEST_CATALOGUE: readonly QuestDef[] = [
  // --- starter: a first week. Every bar here is clearable by a normal day
  //     out, so the tab teaches the loop rather than gating it.
  { id: 'starter-steps-3000', tier: 'starter', metric: 'steps', target: 3_000, xp: 10 },
  { id: 'starter-steps-5000', tier: 'starter', metric: 'steps', target: 5_000, xp: 15 },
  { id: 'starter-hours-3', tier: 'starter', metric: 'active_hours', target: 3, xp: 10 },
  { id: 'starter-hours-4', tier: 'starter', metric: 'active_hours', target: 4, xp: 15 },
  { id: 'starter-kcal-150', tier: 'starter', metric: 'active_kcal', target: 150, xp: 10 },
  { id: 'starter-distance-2000', tier: 'starter', metric: 'distance_m', target: 2_000, xp: 15 },
  { id: 'starter-sleep-360', tier: 'starter', metric: 'sleep_minutes', target: 360, xp: 15 },

  // --- steady: the middle of the app. Bars sit near a good ordinary day.
  { id: 'steady-steps-7000', tier: 'steady', metric: 'steps', target: 7_000, xp: 15 },
  { id: 'steady-steps-9000', tier: 'steady', metric: 'steps', target: 9_000, xp: 20 },
  { id: 'steady-hours-6', tier: 'steady', metric: 'active_hours', target: 6, xp: 15 },
  { id: 'steady-kcal-300', tier: 'steady', metric: 'active_kcal', target: 300, xp: 15 },
  { id: 'steady-kcal-400', tier: 'steady', metric: 'active_kcal', target: 400, xp: 20 },
  { id: 'steady-distance-5000', tier: 'steady', metric: 'distance_m', target: 5_000, xp: 20 },
  { id: 'steady-sleep-420', tier: 'steady', metric: 'sleep_minutes', target: 420, xp: 15 },

  // --- strong: for accounts that have been here a month. Still bounded well
  //     under a maxed day, because a quest must never become the goal.
  { id: 'strong-steps-12000', tier: 'strong', metric: 'steps', target: 12_000, xp: 20 },
  { id: 'strong-steps-15000', tier: 'strong', metric: 'steps', target: 15_000, xp: 20 },
  { id: 'strong-hours-8', tier: 'strong', metric: 'active_hours', target: 8, xp: 20 },
  { id: 'strong-kcal-500', tier: 'strong', metric: 'active_kcal', target: 500, xp: 20 },
  { id: 'strong-kcal-650', tier: 'strong', metric: 'active_kcal', target: 650, xp: 20 },
  { id: 'strong-distance-8000', tier: 'strong', metric: 'distance_m', target: 8_000, xp: 20 },
  { id: 'strong-sleep-450', tier: 'strong', metric: 'sleep_minutes', target: 450, xp: 20 },
];

/** Scored days before the middle tier, and before the top one. */
export const QUEST_TIER_STEADY_DAYS = 7;
export const QUEST_TIER_STRONG_DAYS = 28;

/**
 * Which tier of quest this account sees.
 *
 * **The auto rule measures engagement, not capability**, and that is the spec's
 * choice recorded rather than quietly improved: `trailingScoredDays` is a count
 * of days that scored, so a long-standing gentle user is assigned the same tier
 * as a long-standing athlete. The alternative — a trailing median of daily
 * steps, the pattern `challenge.ts` uses — was rejected because it makes the
 * bar rise as the user improves, which is the exact conflation the Daily Walk
 * exists to refuse.
 *
 * `override` is therefore not a nicety, it is the correction for a rule that is
 * wrong by construction for part of the cohort, and it **wins outright**. A
 * rule that could veto it would make it a hint.
 */
export function questTier(input: {
  trailingScoredDays: number;
  override?: QuestTier | null;
}): QuestTier {
  if (input.override) return input.override;
  const days = input.trailingScoredDays;
  // `NaN >= n` is false, so a failed count falls to 'starter' without a branch
  // of its own — the same guard `disclosureStage` uses.
  if (days >= QUEST_TIER_STRONG_DAYS) return 'strong';
  if (days >= QUEST_TIER_STEADY_DAYS) return 'steady';
  return 'starter';
}

/**
 * FNV-1a, 32-bit. A hash rather than a PRNG because this module takes no seed
 * state and returns no generator — every call must be answerable from its
 * arguments alone, which is what makes "the same three all day" a property of
 * the function rather than of a cache.
 */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    // `Math.imul` keeps the multiply in 32 bits; a plain `*` loses precision
    // past 2^53 and the hash stops being uniform.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Today's three, for this account.
 *
 * Selection is a rotation over the tier's list rather than three independent
 * draws: independent draws collide, and "you have two of the same quest" is the
 * kind of bug that reads as the whole feature being broken. The stride is
 * co-prime-ish by construction — `1 + (h % (n - 1))` can never be `0` and never
 * be `n` — so stepping `QUESTS_PER_DAY` times cannot revisit a slot as long as
 * the tier has more entries than a day needs, which the catalogue test pins.
 */
export function pickQuests(input: {
  userId: string;
  /** The player's own local date, `YYYY-MM-DD`. */
  localDate: string;
  tier: QuestTier;
}): QuestDef[] {
  const pool = QUEST_CATALOGUE.filter((q) => q.tier === input.tier);
  if (pool.length <= QUESTS_PER_DAY) return [...pool];

  const seed = hash(`${input.userId}:${input.localDate}`);
  const start = seed % pool.length;
  const stride = 1 + (seed % (pool.length - 1));

  const picked: QuestDef[] = [];
  const seen = new Set<number>();
  let index = start;
  while (picked.length < QUESTS_PER_DAY) {
    if (!seen.has(index)) {
      seen.add(index);
      picked.push(pool[index]!);
    }
    index = (index + stride) % pool.length;
  }
  return picked;
}

/**
 * A day, in the raw units a quest counts.
 *
 * `sleepMinutes` is `number | null` and the others are not, deliberately:
 * `aggregateBuckets` always produces a number for the first four (zero is a
 * real, measured zero), while a missing `daily_sleep` row means the night is
 * *unknown*. Collapsing that to 0 would render a sleep quest as "0 of 420" on a
 * night Kairo has no reading for, which reads as an accusation rather than as
 * silence — the same rule `rawFor` in `stat-detail.ts` follows.
 */
export interface QuestDay {
  steps: number;
  activeKcal: number;
  activeHours: number;
  distanceM: number;
  sleepMinutes: number | null;
}

export interface QuestState {
  /** The raw figure so far, or null when the metric has no reading. */
  value: number | null;
  /** 0–1, clamped. What the bar draws. */
  fraction: number;
  met: boolean;
}

function rawFor(metric: QuestMetric, day: QuestDay): number | null {
  switch (metric) {
    case 'steps':
      return day.steps;
    case 'active_kcal':
      return day.activeKcal;
    case 'active_hours':
      return day.activeHours;
    case 'distance_m':
      return day.distanceM;
    case 'sleep_minutes':
      return day.sleepMinutes;
  }
}

export function questProgress(quest: QuestDef, day: QuestDay): QuestState {
  const value = rawFor(quest.metric, day);
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return { value, fraction: 0, met: false };
  }
  return {
    value,
    fraction: Math.min(1, value / quest.target),
    met: value >= quest.target,
  };
}

/** Cleared inclusively, at exactly the target. */
export function questMet(quest: QuestDef, day: QuestDay): boolean {
  return questProgress(quest, day).met;
}
```

- [ ] **Step 4: Export it**

In `packages/kairo-core/src/index.ts`, add after the `export * from './challenge.ts';` line:

```ts
export * from './quest.ts';
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npm run test:core -- --run src/quest.test.ts`
Expected: PASS, all cases.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add packages/kairo-core/src/quest.ts packages/kairo-core/src/quest.test.ts packages/kairo-core/src/index.ts
git commit -m "feat(core): derive three daily quests from a hand-authored catalogue"
```

---

### Task 2: `quest-copy.ts` — a quest, said in a sentence

**Files:**
- Create: `src/features/quests/quest-copy.ts`
- Create: `src/features/quests/quest-copy.test.ts`

**Interfaces:**
- Consumes: `QuestDef`, `QuestState` from Task 1.
- Produces: `questHeadline(quest: QuestDef): string`, `questProgressLine(quest: QuestDef, state: QuestState): string`, `questLabel(quest: QuestDef, state: QuestState): string`. Task 7 consumes all three.

Same job and same reason as `challenge-copy.ts`: the definitions are the
engine's, the sentences are the product's, and a quest that reads as three
different targets across the card, the list and the screen reader is worse than
no quest at all.

- [ ] **Step 1: Write the failing test**

Create `src/features/quests/quest-copy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { QuestDef, QuestState } from '@kairo/core';
import { questHeadline, questLabel, questProgressLine } from './quest-copy.ts';

const steps: QuestDef = {
  id: 'steady-steps-7000',
  tier: 'steady',
  metric: 'steps',
  target: 7_000,
  xp: 15,
};
const sleep: QuestDef = {
  id: 'steady-sleep-420',
  tier: 'steady',
  metric: 'sleep_minutes',
  target: 420,
  xp: 15,
};
const state = (over: Partial<QuestState> = {}): QuestState => ({
  value: 0,
  fraction: 0,
  met: false,
  ...over,
});

describe('questHeadline', () => {
  it('names the thing to do, in the unit it is done in', () => {
    expect(questHeadline(steps)).toBe('Walk 7,000 steps');
  });

  it('says hours and minutes as words a person uses', () => {
    expect(questHeadline(sleep)).toBe('Sleep 7 hours');
    expect(questHeadline({ ...sleep, target: 450 })).toBe('Sleep 7h 30m');
  });

  it('says distance in kilometres, not metres', () => {
    expect(questHeadline({ ...steps, metric: 'distance_m', target: 5_000 })).toBe(
      'Cover 5 km',
    );
  });
});

describe('questProgressLine', () => {
  it('counts up to the bar', () => {
    expect(questProgressLine(steps, state({ value: 4_210, fraction: 0.6 }))).toBe(
      '4,210 of 7,000',
    );
  });

  it('says cleared once the bar is met, rather than a ratio past it', () => {
    expect(questProgressLine(steps, state({ value: 9_000, fraction: 1, met: true }))).toBe(
      'Cleared',
    );
  });

  it('says nothing has arrived rather than printing a zero it did not measure', () => {
    // A null value is an unknown night, not a bad one — see QuestDay.
    expect(questProgressLine(sleep, state({ value: null }))).toBe('No reading yet');
  });
});

describe('questLabel', () => {
  it('is one utterance: what, how far, what it pays', () => {
    expect(questLabel(steps, state({ value: 4_210, fraction: 0.6 }))).toBe(
      'Walk 7,000 steps. 4,210 of 7,000. 15 XP.',
    );
  });

  it('leads with the outcome once cleared', () => {
    expect(questLabel(steps, state({ value: 9_000, fraction: 1, met: true }))).toBe(
      'Walk 7,000 steps. Cleared. 15 XP.',
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts src/features/quests/quest-copy.test.ts`
Expected: FAIL — cannot resolve `./quest-copy.ts`.

- [ ] **Step 3: Write the module**

Create `src/features/quests/quest-copy.ts`:

```ts
import type { QuestDef, QuestMetric, QuestState } from '@kairo/core';

/**
 * How a quest is described to the person doing it.
 *
 * One module because three surfaces say it — the card, the progress line and
 * the composed accessible name — and the same argument `challenge-copy.ts` and
 * `program-copy.ts` both make: a target that reads three ways is worse than no
 * target.
 *
 * Named in the unit the user *produces*, never in points and never in stat
 * names. A quest is the smallest thing in the app and it is the first thing a
 * new account meets, so it has to be answerable without knowing anything about
 * Kairo's model.
 *
 * Pure and tested in Node — it imports only types, so root Vitest can load it.
 */

/** The verb each metric takes. Copy, so it lives here rather than in the core. */
const VERBS: Record<QuestMetric, string> = {
  steps: 'Walk',
  active_kcal: 'Burn',
  active_hours: 'Move in',
  distance_m: 'Cover',
  sleep_minutes: 'Sleep',
};

/** Minutes as a person says them. 420 is "7 hours", 450 is "7h 30m". */
function durationWords(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${hours}h ${rest}m`;
}

/** Metres as kilometres, trimmed. 5,000 is "5 km", 7,500 is "7.5 km". */
function distanceWords(metres: number): string {
  const km = metres / 1_000;
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

function targetWords(quest: QuestDef): string {
  switch (quest.metric) {
    case 'steps':
      return `${quest.target.toLocaleString()} steps`;
    case 'active_kcal':
      return `${quest.target.toLocaleString()} kcal`;
    case 'active_hours':
      return `${quest.target} ${quest.target === 1 ? 'hour' : 'hours'}`;
    case 'distance_m':
      return distanceWords(quest.target);
    case 'sleep_minutes':
      return durationWords(quest.target);
  }
}

export function questHeadline(quest: QuestDef): string {
  return `${VERBS[quest.metric]} ${targetWords(quest)}`;
}

/**
 * The line under the headline.
 *
 * Three states, not two. `null` is an unknown reading — a night with no
 * `daily_sleep` row — and saying "0 of 420 minutes" there would accuse someone
 * of not sleeping when the truth is that Kairo cannot see it. The same
 * distinction `rawFor` in `stat-detail.ts` draws, in a second place.
 */
export function questProgressLine(quest: QuestDef, state: QuestState): string {
  if (state.met) return 'Cleared';
  if (state.value === null) return 'No reading yet';

  switch (quest.metric) {
    case 'active_hours':
      return `${state.value} of ${quest.target}`;
    case 'distance_m':
      return `${distanceWords(state.value)} of ${distanceWords(quest.target)}`;
    case 'sleep_minutes':
      return `${durationWords(state.value)} of ${durationWords(quest.target)}`;
    default:
      return `${state.value.toLocaleString()} of ${quest.target.toLocaleString()}`;
  }
}

/**
 * The whole card as one utterance.
 *
 * A quest card draws a headline, a bar, a figure and an XP chip. Left as
 * separate accessibility elements, three quests are twelve stops — the
 * leaderboard's failure in miniature, which is why `row-label.ts` exists and
 * why this does too. Sentences rather than commas, because these are three
 * independent facts rather than one list.
 */
export function questLabel(quest: QuestDef, state: QuestState): string {
  return `${questHeadline(quest)}. ${questProgressLine(quest, state)}. ${quest.xp} XP.`;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run --config vitest.config.ts src/features/quests/quest-copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/quests/quest-copy.ts src/features/quests/quest-copy.test.ts
git commit -m "feat(quests): say a quest in the unit it is done in"
```

---

### Task 3: `quest_completions` and the fourth XP source

**Files:**
- Create: `supabase/migrations/20260827090000_quests.sql`
- Modify: `supabase/tests/schema.test.ts` (add a describe block)

**Interfaces:**
- Consumes: nothing from Tasks 1–2 — the table stores an opaque `quest_id` text, so the catalogue can change without a migration.
- Produces: `public.quest_completions(user_id, local_date, quest_id, xp_awarded, created_at)`, owner-readable, service-role-writable; `profiles.quest_tier_override text`; `recalculate_user_xp` summing a fourth source. Tasks 4, 6 and 7 consume these.

- [ ] **Step 1: Write the failing schema test**

Add to `supabase/tests/schema.test.ts`, following the file's existing harness
conventions for creating users and asserting under the non-owner `authenticated`
role:

```ts
describe('quest_completions (deviation #50)', () => {
  it('is readable by its owner and by nobody else', async () => {
    await db.query(
      `insert into public.quest_completions (user_id, local_date, quest_id, xp_awarded)
       values ($1, $2, 'steady-steps-7000', 15)`,
      [alice, today],
    );

    const mine = await asUser(alice, (sql) =>
      sql(`select quest_id from public.quest_completions`),
    );
    expect(mine.rows).toHaveLength(1);

    const theirs = await asUser(bob, (sql) =>
      sql(`select quest_id from public.quest_completions`),
    );
    expect(theirs.rows).toHaveLength(0);
  });

  it('refuses a client write, because XP is server-authoritative', async () => {
    await expect(
      asUser(alice, (sql) =>
        sql(
          `insert into public.quest_completions (user_id, local_date, quest_id, xp_awarded)
           values ($1, $2, 'strong-steps-15000', 500)`,
          [alice, today],
        ),
      ),
    ).rejects.toThrow();
  });

  it('latches once per quest per day, so cron overlap cannot double-pay', async () => {
    await db.query(
      `insert into public.quest_completions (user_id, local_date, quest_id, xp_awarded)
       values ($1, $2, 'steady-steps-7000', 15)
       on conflict (user_id, local_date, quest_id) do nothing`,
      [alice, today],
    );
    await db.query(
      `insert into public.quest_completions (user_id, local_date, quest_id, xp_awarded)
       values ($1, $2, 'steady-steps-7000', 15)
       on conflict (user_id, local_date, quest_id) do nothing`,
      [alice, today],
    );
    const { rows } = await db.query(
      `select count(*)::int as n from public.quest_completions where user_id = $1`,
      [alice],
    );
    expect(rows[0].n).toBe(1);
  });

  it('rolls quest XP into profiles.total_xp as a fourth source', async () => {
    const before = await db.query(`select total_xp from public.profiles where id = $1`, [alice]);
    await db.query(
      `insert into public.quest_completions (user_id, local_date, quest_id, xp_awarded)
       values ($1, $2, 'steady-kcal-400', 20)`,
      [alice, today],
    );
    const after = await db.query(`select total_xp from public.profiles where id = $1`, [alice]);
    expect(after.rows[0].total_xp).toBe(before.rows[0].total_xp + 20);
  });

  it('keeps every other XP source intact — the recompute is never an increment', async () => {
    // recalculate_user_xp is written out whole every time it changes, so the
    // failure mode of this migration is silently dropping a source. Assert the
    // body still names all of them.
    const { rows } = await db.query(
      `select prosrc from pg_proc where proname = 'recalculate_user_xp'`,
    );
    expect(rows[0].prosrc).toMatch(/daily_scores/);
    expect(rows[0].prosrc).toMatch(/goal_completions|event_completions/);
    expect(rows[0].prosrc).toMatch(/quest_completions/);
  });
});

describe('profiles.quest_tier_override', () => {
  it('lets the owner set their own tier and rejects an unknown one', async () => {
    await asUser(alice, (sql) =>
      sql(`update public.profiles set quest_tier_override = 'starter' where id = $1`, [alice]),
    );
    await expect(
      asUser(alice, (sql) =>
        sql(`update public.profiles set quest_tier_override = 'godlike' where id = $1`, [alice]),
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "quest_completions"`
Expected: FAIL — `relation "public.quest_completions" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260827090000_quests.sql`:

```sql
-- Quests (roadmap deviation #50).
--
-- Three small things a day, on the Today tab. The quests themselves are
-- **derived, never stored** — `pickQuests()` in @kairo/core is a pure function
-- of (user id, local date, tier), so the local-midnight reset needs no job, no
-- row and no cron. Only the completion is recorded here, because it pays XP and
-- must fire exactly once.
--
-- Progress against a quest is a read-time projection over health_buckets and
-- daily_sleep, storing no number of its own — the same property goal progress
-- and challenge targets already have, and for the same reason: a retroactive
-- Apple revision flows through by replay rather than by correction.
--
-- `quest_id` is opaque text on purpose. The catalogue lives in TypeScript, so a
-- new quest costs no migration; the price is that a *renamed* id orphans the
-- completions banked against it, which is why QuestDef's comment forbids reuse.

begin;

-- ---------------------------------------------------------------------------
-- 1. quest_completions — the one-way latch
-- ---------------------------------------------------------------------------

create table public.quest_completions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The player's own local date. A quest belongs to a day, and days are
  -- per-user (§2) — this is not a UTC date and must never be compared to one.
  local_date date not null,
  quest_id text not null check (length(btrim(quest_id)) between 1 and 64),
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, local_date, quest_id)
);

comment on table public.quest_completions is
  'One-way latch, service-role writes only. Written by finalize-days from FINAL days, with on conflict do nothing so overlapping cron runs cannot double-pay. A later downward revision from Apple never revokes a completion (§19 rule), which is the same posture goal_completions takes.';

comment on column public.quest_completions.quest_id is
  'An id from QUEST_CATALOGUE in packages/kairo-core/src/quest.ts. Opaque here on purpose: adding a quest costs no migration. Never reuse an id for a different bar — completions already banked against it would silently describe the wrong target.';

create index quest_completions_user_idx on public.quest_completions (user_id, local_date desc);

-- ---------------------------------------------------------------------------
-- 2. The manual tier override
-- ---------------------------------------------------------------------------
--
-- questTier()'s automatic rule keys off trailing scored days, which measures
-- engagement rather than capability — so it is wrong by construction for a
-- long-standing gentle user, and this is the correction rather than a nicety.
-- NULL means "use the automatic rule", which is what every account starts on.

alter table public.profiles
  add column quest_tier_override text
    check (quest_tier_override in ('starter', 'steady', 'strong'));

comment on column public.profiles.quest_tier_override is
  'Player-chosen quest difficulty, from Profile. NULL means questTier() decides from trailing scored days. The override wins outright — a rule that could veto it would make it a hint.';

-- A column-level REVOKE against a table-level GRANT is silently a no-op in
-- Postgres, so the table grant goes and the allowed columns are re-granted in
-- full. This list is the previous migration's plus one.
--
-- NOTE FOR THE MERGE: if plan 1's 20260826090000_race_projection.sql has
-- already been applied, `squad_data_consent_at` belongs in this list too.
-- Check with:
--   select column_name from information_schema.column_privileges
--    where table_name = 'profiles' and privilege_type = 'UPDATE';
revoke update on public.profiles from anon, authenticated;

grant update (
  character_name,
  character_body,
  species,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  exclude_from_recap,
  trains_run,
  trains_strength,
  quest_tier_override
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table public.quest_completions enable row level security;

create policy quest_completions_select_own on public.quest_completions
for select to authenticated
using (user_id = (select auth.uid()));

-- `revoke all` then re-grant SELECT, rather than revoking the four DML verbs.
-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on new public tables to
-- `authenticated`, and ALL includes TRUNCATE — which RLS does not restrict.
revoke all on public.quest_completions from anon;
revoke all on public.quest_completions from authenticated;
grant select on public.quest_completions to authenticated;

-- ---------------------------------------------------------------------------
-- 4. total_xp gains a fourth source
-- ---------------------------------------------------------------------------
--
-- **Read the deployed body before editing this function.** It is a full
-- recompute written out whole, not an increment, so whichever migration lands
-- second silently drops the other's source unless it carries it forward. Plan 4
-- renames goal_completions to event_completions in this same function. Confirm
-- with:
--   ./supabase/scripts/remote-sql.sh \
--     "select prosrc from pg_proc where proname = 'recalculate_user_xp'"
-- and include whatever sources are actually there.
--
-- Quest XP is deliberately NOT written into daily_scores.xp_awarded: a rescore
-- replays that column from tier points and would silently wipe it. That is the
-- same reason goal XP sits in its own table.

create or replace function public.recalculate_user_xp(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  select coalesce((select sum(xp_awarded) from public.daily_scores
                   where user_id = p_user_id), 0)
       + coalesce((select sum(xp_awarded) from public.goal_completions
                   where user_id = p_user_id), 0)
       + coalesce((select sum(xp_awarded) from public.quest_completions
                   where user_id = p_user_id), 0)
    into v_total;

  update public.profiles
  set total_xp = v_total,
      level = floor(sqrt(v_total::numeric / 25)) + 1
  where id = p_user_id
    and (total_xp is distinct from v_total
         or level is distinct from floor(sqrt(v_total::numeric / 25)) + 1);
end;
$$;

revoke execute on function public.recalculate_user_xp(uuid) from public, anon, authenticated;

create function public.quest_completions_xp_rollup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_user_xp(old.user_id);
    return old;
  end if;
  perform public.recalculate_user_xp(new.user_id);
  return new;
end;
$$;

create trigger quest_completions_xp_rollup_trigger
after insert or update or delete on public.quest_completions
for each row execute function public.quest_completions_xp_rollup();

commit;
```

- [ ] **Step 4: Run the whole schema suite and confirm it passes**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts`
Expected: PASS, including the pre-existing cases — the `profiles` column grants
are pinned in more than one place, and Step 3's `revoke update` is exactly the
kind of edit that breaks them.

- [ ] **Step 5: Apply against the live project**

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260827090000_quests.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version) values ('20260827090000')"
```

Then confirm the XP function still names every source:

```bash
./supabase/scripts/remote-sql.sh "select prosrc from pg_proc where proname = 'recalculate_user_xp'"
```

Expected: the body mentions `daily_scores`, `goal_completions` (or
`event_completions`, if plan 4 landed first) **and** `quest_completions`. A
missing source here drops every affected account's level on the next write.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260827090000_quests.sql supabase/tests/schema.test.ts
git commit -m "feat(db): store quest completions and roll them into total XP"
```

---

### Task 4: `finalize-days` grades quests

**Files:**
- Create: `supabase/functions/_shared/quest-plan.ts`
- Create: `supabase/functions/_shared/quest-plan.test.ts`
- Modify: `supabase/functions/finalize-days/index.ts`

**Interfaces:**
- Consumes: `QUEST_CATALOGUE`, `pickQuests`, `questTier`, `questMet`, `QuestDay` from Task 1 via `_shared/core.ts`; `quest_completions` from Task 3.
- Produces: `planQuestCompletions(input): QuestCompletionRow[]`. Nothing later consumes it.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/quest-plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pickQuests, questTier } from './core.ts';
import { planQuestCompletions } from './quest-plan.ts';

const userId = 'user-1';
const localDate = '2026-08-25';

/** A day that clears everything, so the tests are about the *rules*. */
const generousDay = {
  steps: 99_000,
  activeKcal: 9_000,
  activeHours: 24,
  distanceM: 99_000,
  sleepMinutes: 600,
};

const emptyDay = {
  steps: 0,
  activeKcal: 0,
  activeHours: 0,
  distanceM: 0,
  sleepMinutes: null,
};

describe('planQuestCompletions', () => {
  it('latches exactly the three quests that day offered, and no others', () => {
    const tier = questTier({ trailingScoredDays: 10 });
    const expected = pickQuests({ userId, localDate, tier }).map((q) => q.id);

    const rows = planQuestCompletions({
      userId,
      localDate,
      trailingScoredDays: 10,
      tierOverride: null,
      day: generousDay,
      alreadyCompleted: new Set(),
    });

    expect(rows.map((r) => r.quest_id).sort()).toEqual([...expected].sort());
  });

  it('grades against the tier the OVERRIDE names, not the automatic one', () => {
    // The override lives on profiles and the handler reads it. Grading against
    // the automatic tier would pay a user for quests they were never shown —
    // the single worst failure this module can have, because a completion
    // latches and the card it belongs to does not exist.
    const rows = planQuestCompletions({
      userId,
      localDate,
      trailingScoredDays: 90,
      tierOverride: 'starter',
      day: generousDay,
      alreadyCompleted: new Set(),
    });
    const shown = pickQuests({ userId, localDate, tier: 'starter' }).map((q) => q.id);
    expect(rows.map((r) => r.quest_id).sort()).toEqual([...shown].sort());
  });

  it('pays nothing on a day that cleared nothing', () => {
    expect(
      planQuestCompletions({
        userId,
        localDate,
        trailingScoredDays: 10,
        tierOverride: null,
        day: emptyDay,
        alreadyCompleted: new Set(),
      }),
    ).toEqual([]);
  });

  it('skips a quest already banked, so a re-run pays once', () => {
    const tier = questTier({ trailingScoredDays: 10 });
    const [first] = pickQuests({ userId, localDate, tier });

    const rows = planQuestCompletions({
      userId,
      localDate,
      trailingScoredDays: 10,
      tierOverride: null,
      day: generousDay,
      alreadyCompleted: new Set([first!.id]),
    });

    expect(rows.map((r) => r.quest_id)).not.toContain(first!.id);
    expect(rows).toHaveLength(2);
  });

  it('carries the quest\'s own XP, never a figure the handler chose', () => {
    const tier = questTier({ trailingScoredDays: 10 });
    const shown = pickQuests({ userId, localDate, tier });
    const rows = planQuestCompletions({
      userId,
      localDate,
      trailingScoredDays: 10,
      tierOverride: null,
      day: generousDay,
      alreadyCompleted: new Set(),
    });
    for (const row of rows) {
      expect(row.xp_awarded).toBe(shown.find((q) => q.id === row.quest_id)!.xp);
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/quest-plan.test.ts`
Expected: FAIL — cannot resolve `./quest-plan.ts`.

- [ ] **Step 3: Write the module**

Create `supabase/functions/_shared/quest-plan.ts`:

```ts
import { pickQuests, questMet, questTier, type QuestDay, type QuestTier } from './core.ts';

/**
 * The quest half of the `finalize-days` pass, kept free of I/O so it can be
 * tested in plain Node with no Deno, no Docker and no database.
 *
 * The handler reads the finalized day's raw totals and the account's tier; this
 * module decides which of the three quests that day offered were cleared.
 * Nothing here writes, and nothing here re-implements the quest rules —
 * `pickQuests()` and `questMet()` in `@kairo/core` are the single
 * implementation, called by both this and the client (deviation #18's rule in a
 * new place).
 */

export interface QuestCompletionRow {
  user_id: string;
  local_date: string;
  quest_id: string;
  xp_awarded: number;
}

/**
 * Which of this user's quests the finalized day cleared.
 *
 * **The tier must be the one the user was shown**, which is why
 * `tierOverride` is a required argument with no default: grading against the
 * automatic tier for someone who set an override would pay them for quests that
 * were never on their screen, and a completion latches. `questTier()` applies
 * the same precedence the client does — the override wins outright.
 *
 * `alreadyCompleted` is the cheap filter, not the guarantee: the insert carries
 * `on conflict do nothing` and the primary key is what makes a double-latch
 * impossible under overlapping cron runs.
 */
export function planQuestCompletions(input: {
  userId: string;
  localDate: string;
  trailingScoredDays: number;
  tierOverride: QuestTier | null;
  day: QuestDay;
  alreadyCompleted: ReadonlySet<string>;
}): QuestCompletionRow[] {
  const tier = questTier({
    trailingScoredDays: input.trailingScoredDays,
    override: input.tierOverride,
  });

  const rows: QuestCompletionRow[] = [];
  for (const quest of pickQuests({
    userId: input.userId,
    localDate: input.localDate,
    tier,
  })) {
    if (input.alreadyCompleted.has(quest.id)) continue;
    if (!questMet(quest, input.day)) continue;
    rows.push({
      user_id: input.userId,
      local_date: input.localDate,
      quest_id: quest.id,
      xp_awarded: quest.xp,
    });
  }
  return rows;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/quest-plan.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Wire it into the handler**

In `supabase/functions/finalize-days/index.ts`, add the import beside the
existing `goal-plan.ts` one:

```ts
import { planQuestCompletions } from '../_shared/quest-plan.ts';
```

Then add this function beside `settleGoals`:

```ts
/**
 * Latch any quests this user's newly-final day cleared.
 *
 * **After the score is final and before the goal pass**, for the same reason
 * goals run last: quest XP lands in `profiles.total_xp` through
 * `recalculate_user_xp`, and a goal completion recomputes the same figure — so
 * running quests first means the goal pass's recompute already includes them
 * rather than needing a second one.
 *
 * The day's raw totals are summed here rather than read from `daily_scores`,
 * because a quest counts raw units and `daily_scores` stores points and tiers.
 * The service role bypasses RLS, so this is a plain select rather than another
 * security-definer function to review.
 */
async function settleQuests(
  candidate: { user_id: string; local_date: string },
): Promise<void> {
  const [{ data: bucketRows, error: bucketError }, { data: sleepRow }] = await Promise.all([
    admin
      .from('health_buckets')
      .select('steps, active_kcal, distance_m, active_minutes')
      .eq('user_id', candidate.user_id)
      .eq('local_date', candidate.local_date),
    admin
      .from('daily_sleep')
      .select('minutes')
      .eq('user_id', candidate.user_id)
      .eq('local_date', candidate.local_date)
      .maybeSingle(),
  ]);

  if (bucketError) throw new Error(`quest bucket read failed: ${bucketError.message}`);
  const buckets = bucketRows ?? [];
  if (buckets.length === 0) return;

  const day = {
    steps: buckets.reduce((n, b) => n + Number(b.steps ?? 0), 0),
    activeKcal: buckets.reduce((n, b) => n + Number(b.active_kcal ?? 0), 0),
    distanceM: buckets.reduce((n, b) => n + Number(b.distance_m ?? 0), 0),
    // An "active hour" is a bucket clearing VIT_ACTIVE_HOUR_STEPS, exactly as
    // `aggregateBuckets` counts it — not a count of buckets with any movement.
    activeHours: buckets.filter((b) => Number(b.steps ?? 0) >= 250).length,
    // Null, never 0: a missing row is an unknown night, and a fabricated zero
    // would make every sleep quest permanently unclearable-looking.
    sleepMinutes: sleepRow ? Number(sleepRow.minutes) : null,
  };

  const { data: profileRow } = await admin
    .from('profiles')
    .select('quest_tier_override')
    .eq('id', candidate.user_id)
    .maybeSingle();

  // Lifetime scored days, matching what the client's own tier read counts —
  // the two must agree or the server grades quests the user never saw.
  const { count: scoredDays } = await admin
    .from('daily_scores')
    .select('local_date', { count: 'exact', head: true })
    .eq('user_id', candidate.user_id)
    .gt('total', 0);

  const { data: doneRows } = await admin
    .from('quest_completions')
    .select('quest_id')
    .eq('user_id', candidate.user_id)
    .eq('local_date', candidate.local_date);

  const rows = planQuestCompletions({
    userId: candidate.user_id,
    localDate: candidate.local_date,
    trailingScoredDays: scoredDays ?? 0,
    tierOverride: (profileRow?.quest_tier_override ?? null) as
      | 'starter'
      | 'steady'
      | 'strong'
      | null,
    day,
    alreadyCompleted: new Set((doneRows ?? []).map((r: { quest_id: string }) => r.quest_id)),
  });

  if (rows.length === 0) return;

  // `ignoreDuplicates` is the one-way latch, exactly as for goals: two
  // overlapping cron runs must pay once.
  const { error } = await admin
    .from('quest_completions')
    .upsert(rows, { onConflict: 'user_id,local_date,quest_id', ignoreDuplicates: true });
  if (error) throw new Error(`quest latch failed: ${error.message}`);
}
```

Then call it from the per-candidate loop, **immediately before** the existing
`// ---- goals ----` section:

```ts
    // ---- quests ---------------------------------------------------------
    //
    // Before the goal pass, so the goal pass's XP recompute already includes
    // whatever quests just paid. No notification: quests are three small
    // things, and one push per cleared quest is precisely the volume
    // deviation #52 exists to remove.
    try {
      await settleQuests(candidate);
    } catch (error) {
      // Wrapped separately, for the goals reason: a failed quest latch must
      // never stop a day from becoming final. The day is the durable thing.
      console.error('[finalize-days] quest settle failed', candidate.user_id, error);
    }
```

- [ ] **Step 6: Deploy and smoke**

The migration in Task 3 created a table this function writes, so **the two ship
together**. Applying one without the other is what took scoring down for two
days in August 2026.

```bash
npx vitest run --config vitest.config.ts supabase/functions/
npm run typecheck
supabase functions deploy finalize-days --project-ref zniopywbwenrzxezolwv
node supabase/scripts/smoke-sync.mjs
```

Expected: tests PASS, typecheck PASS (including `deno check`), deploy succeeds,
smoke run reports a real sync against the deployed function.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/quest-plan.ts supabase/functions/_shared/quest-plan.test.ts supabase/functions/finalize-days/index.ts
git commit -m "feat(finalize-days): latch cleared quests and pay their XP"
```

---

### Task 5: The fourth tab

**Files:**
- Modify: `src/ui/TabPill.tsx`
- Modify: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/today.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a mounted `/today` route and a four-disc nav. Tasks 6 and 7 fill the screen.

- [ ] **Step 1: Add the disc**

In `src/ui/TabPill.tsx`, make four changes and no others.

Add the label and the icon:

```ts
const LABELS: Record<string, string> = {
  index: 'Character',
  today: 'Today',
  squad: 'Squad',
  profile: 'You',
};

const ICONS: Record<string, 'user' | 'users' | 'sun'> = {
  index: 'user',
  today: 'sun',
  squad: 'users',
  profile: 'user',
};
```

`sun` is Feather's, at the same 2px stroke as `user` and `users` — the family
and the weight do not move. The hairline/solid split is total in both
directions: chrome is Feather, character data is MaterialCommunityIcons.

Change the order array:

```ts
  // Squad stays leftmost and You stays rightmost, so no existing thumb target
  // moves to the other end of the bar. Today slots between the character and
  // the profile, which is where a new place belongs: next to the two you
  // already visit, not at an edge.
  const order = ['squad', 'index', 'today', 'profile'];
```

And resize, because four discs at the old sizes overflow a 320pt screen:

```ts
/** Glyph sizes, tuned to the disc they sit in — 52pt orbit, 68pt centre. */
const ORBIT_ICON = 20;
const CENTRE_ICON = 24;
```

```ts
  orbit: { width: 52, height: 52, marginBottom: space.sm, ...shadow.md },
  centre: { width: 68, height: 68, ...shadow.lg },
```

and change the bar's `gap` from `space.lg` to `space.md`.

The arithmetic, stated because it is the thing that fails on a small screen:
`3 × 52 + 68 + 3 × 16 = 272`, against 320pt on the narrowest supported device.
`NAV_HEIGHT` stays 96 and `TAB_PILL_CLEARANCE` therefore stays unchanged — the
discs got smaller, not the bar.

**The character keeps the raised disc and is no longer geometrically centred.**
That is deliberate: the raised disc means *anchor*, not *middle*, and with four
items a raised third-of-four would be arbitrary. Do not add a second raised disc
for Today — two anchors is no anchor.

- [ ] **Step 2: Register the screen**

In `app/(tabs)/_layout.tsx`, add the screen between `index` and `profile`:

```tsx
        <Tabs.Screen name="index" options={{ title: 'Character' }} />
        <Tabs.Screen name="today" options={{ title: 'Today' }} />
        <Tabs.Screen name="squad" options={{ title: 'Squad' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
```

The `Tabs.Screen` order is the navigator's; `TabPill`'s `order` array is the
bar's. They are allowed to differ and already do — `TabPill` reorders `squad`
ahead of `index` today.

- [ ] **Step 3: Create the route**

Create `app/(tabs)/today.tsx`:

```tsx
import { currentLocalDate } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { Label, Screen } from '@/ui/index.ts';

/**
 * Today — the present moment (roadmap deviation #50).
 *
 * A tab rather than a shelf on the character screen, because the character
 * screen's subject is *the character* and everything below its hero was a
 * different subject sharing a scroll. Splitting them is what makes room for
 * quests without making the home screen longer than a thumb.
 *
 * **The tab is ungated; the Challenge door on it is not.** The disclosure gate
 * (deviation #37) is completely unchanged by this screen — same constant, same
 * threshold test, same `total > 0` filter, same list of gated surfaces.
 * Quests are simply *built* outside it: gating the thing that teaches the loop
 * is backwards, and a tab named for the present moment showing one card for
 * three days reads as a broken app rather than as a gentle one. A Challenge is
 * the opposite case — a trailing-median target derived from workout sessions a
 * new account may have none of — so `TrainEntry` keeps its `full` wrapper and
 * `/train` keeps its redirect.
 *
 * The race card, three quests and the Daily Walk are all ungated, so a day-one
 * account meets three live things here. That is what §4.4's concern actually
 * asked for.
 */
export default function Today() {
  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);
  const localToday = profile.data?.timezone
    ? currentLocalDate(new Date(), profile.data.timezone)
    : undefined;

  return (
    <Screen>
      <Label>Today</Label>
      {/* Task 6 adds the race card, the Daily Walk and the Challenge door;
          Task 7 adds the quests. `localToday` is threaded to all of them —
          every card here is keyed to the player's own local date (§2) and
          none of them may read the clock themselves. */}
    </Screen>
  );
}
```

- [ ] **Step 4: Verify by hand**

```bash
npm run ios
xcrun simctl ui booted content_size accessibility-extra-extra-extra-large
# relaunch the app before screenshotting — RN caches text measurements
xcrun simctl io booted screenshot /tmp/nav-four-xxxl.png
```

Confirm on the screenshot: four discs, none clipped at either edge, the raised
character disc still reads as the anchor, and the bar still clears the home
indicator. Then rotate through all four tabs and confirm none of the existing
three moved to a different edge.

Open Xcode's Accessibility Inspector and confirm the bar reports four `tab`
elements named Character, Today, Squad and You.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/ui/TabPill.tsx "app/(tabs)/_layout.tsx" "app/(tabs)/today.tsx"
git commit -m "feat(nav): add the Today tab as a fourth orbit disc"
```

---

### Task 6: Move the daily cards, and add the race card

**Files:**
- Modify: `app/(tabs)/today.tsx`
- Modify: `app/(tabs)/index.tsx`
- Create: `src/features/squad/RaceCard.tsx`
- Modify: `src/features/squad/race-label.ts` (add one function)
- Modify: `src/features/squad/race-label.test.ts` (add one describe block)

**Interfaces:**
- Consumes: `rankRacers`, `RACE_FINISH_LINE`, `RacerInput` from `@kairo/core` (plan 1 Task 1); `LeaderboardRow` widened with `steps` (plan 1 Task 3); `raceLaneLabel` (plan 1 Task 5).
- Produces: `raceCardLine(input): string` and `<RaceCard />`.

**This is the task that depends on plan 1.** If plan 1 has not landed, do Tasks
1–5 and 8–9 first and come back.

- [ ] **Step 1: Write the failing test for the card's line**

Add to `src/features/squad/race-label.test.ts`:

```ts
import { raceCardLine } from './race-label.ts';

describe('raceCardLine', () => {
  it('leads with position and says how far the flag still is', () => {
    expect(raceCardLine({ rank: 3, racers: 6, stepsToFinish: 2_400, finished: false })).toBe(
      '3rd of 6 · 2,400 steps to the flag',
    );
  });

  it('says finished rather than a distance of zero', () => {
    expect(raceCardLine({ rank: 1, racers: 6, stepsToFinish: 0, finished: true })).toBe(
      '1st of 6 · finished',
    );
  });

  it('speaks a solo race as a race, not as a rank of one', () => {
    // With no squad the rivals are the player's own past days (plan 1), so a
    // "1st of 1" would be both true and absurd. The count includes ghosts.
    expect(raceCardLine({ rank: 2, racers: 4, stepsToFinish: 900, finished: false })).toBe(
      '2nd of 4 · 900 steps to the flag',
    );
  });

  it('says one step, singular, at exactly one', () => {
    expect(raceCardLine({ rank: 2, racers: 3, stepsToFinish: 1, finished: false })).toBe(
      '2nd of 3 · 1 step to the flag',
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts src/features/squad/race-label.test.ts -t "raceCardLine"`
Expected: FAIL — `raceCardLine` is not exported.

- [ ] **Step 3: Add the function**

Append to `src/features/squad/race-label.ts`:

```ts
export interface RaceCardLineInput {
  rank: number;
  /** Everyone on the track, ghosts included. */
  racers: number;
  /** Capped steps still to go. Zero once the line is crossed. */
  stepsToFinish: number;
  finished: boolean;
}

/**
 * The Today tab's one-line reading of the race.
 *
 * Position first, then the distance left, because that is the order the
 * question arrives in — "where am I" then "how much further". Same
 * clause · clause shape as the home screen's standing and detail lines, and
 * the same `·` glyph, so the app has one rhetorical pattern rather than three.
 *
 * It never names a score. The gap on a leaderboard row is already the only
 * competitive figure the app prints (deviation #23's successor), and a second
 * number here would be the points total arriving through a side door.
 */
export function raceCardLine(input: RaceCardLineInput): string {
  const where = `${ordinal(input.rank)} of ${input.racers}`;
  if (input.finished) return `${where} · finished`;
  const steps = input.stepsToFinish;
  return `${where} · ${steps.toLocaleString()} ${steps === 1 ? 'step' : 'steps'} to the flag`;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run --config vitest.config.ts src/features/squad/race-label.test.ts`
Expected: PASS, including plan 1's existing cases.

- [ ] **Step 5: Build the card**

Create `src/features/squad/RaceCard.tsx`:

```tsx
import { View } from 'react-native';
import { RACE_FINISH_LINE, rankRacers, type RacerInput } from '@kairo/core';
import { Meter, Panel, Text, space } from '@/ui/index.ts';
import { colors, ramp } from '@/theme.ts';
import { raceCardLine } from './race-label.ts';

/**
 * The race, as one card on the Today tab.
 *
 * The full track lives on the Squad tab (plan 1). This is the summary the spec
 * asks for — your position, how far the flag is, and the rivals as a strip —
 * and it reads the **same query** the track does. One payload, two renderings;
 * do not add a second fetch.
 *
 * One accessibility element, both halves of the grouping fix. The card draws a
 * line, a bar and up to five rival pips, which ungrouped is seven stops for a
 * card whose whole content is one sentence.
 */
export function RaceCard({ racers }: { racers: readonly RacerInput[] }) {
  const ranked = rankRacers(racers);
  const me = ranked.find((r) => r.isSelf);
  if (!me) return null;

  const line = raceCardLine({
    rank: me.rank,
    racers: ranked.length,
    stepsToFinish: RACE_FINISH_LINE - me.cappedSteps,
    finished: me.finished,
  });

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <Panel variant="lift">
      <View accessible accessibilityLabel={`Today's race. ${line}`} style={{ gap: space.sm }}>
        <Text {...hidden} scale="chrome">
          {line}
        </Text>
        <View {...hidden}>
          <Meter fraction={me.progress} color={ramp.accent[500]} height={12} />
        </View>
        {/* The rivals, as a strip. Positions only — no names and no figures:
            the track on the Squad tab is where a rival is a character, and
            repeating that here would make the card the same size as the thing
            it summarises. */}
        <View {...hidden} style={{ flexDirection: 'row', gap: space.xs }}>
          {ranked
            .filter((r) => !r.isSelf)
            .map((r) => (
              <View
                key={r.userId}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: r.finished ? colors.accent : ramp.neutral[300],
                  opacity: r.isGhost ? 0.5 : 1,
                }}
              />
            ))}
        </View>
      </View>
    </Panel>
  );
}
```

Read `src/ui/index.ts` and `src/ui/Meter.tsx` before writing this and use the
real prop names — `Meter`'s `fraction`/`color`/`height` and `Panel`'s
`variant` are the expected ones, but match what exists rather than what is
written here.

- [ ] **Step 6: Fill the Today tab**

Rewrite `app/(tabs)/today.tsx`'s body to compose the cards. The four queries
below are all already in TanStack's cache from the character and squad screens,
so this screen adds no requests:

```tsx
import { currentLocalDate } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { useTodayBuckets } from '@/features/character/queries.ts';
import { useMySquad, useSquadLeaderboard } from '@/features/squad/queries.ts';
import { RaceCard } from '@/features/squad/RaceCard.tsx';
import { DailyWalkCard } from '@/features/train/DailyWalkCard.tsx';
import { TrainEntry } from '@/features/train/TrainEntry.tsx';
import { Label, Screen } from '@/ui/index.ts';

export default function Today() {
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const buckets = useTodayBuckets(userId, profile.data?.timezone);
  const squad = useMySquad(userId);
  const board = useSquadLeaderboard(squad.data?.id, 'current');

  const localToday = profile.data?.timezone
    ? currentLocalDate(new Date(), profile.data.timezone)
    : undefined;

  // A row whose `steps` is null has not consented (plan 1, deviation #47) and
  // cannot be placed on a track. It is dropped from the *card* rather than
  // drawn without a position, because a summary has no room to explain a
  // withheld lane — the full track on the Squad tab does that job.
  const racers = (board.data ?? [])
    .filter((r) => r.steps !== null)
    .map((r) => ({
      userId: r.user_id,
      characterName: r.character_name,
      species: r.species,
      steps: r.steps ?? 0,
      total: r.total,
      isSelf: r.is_self,
    }));

  return (
    <Screen>
      <Label>Today</Label>

      {racers.length > 0 && <RaceCard racers={racers} />}

      {/* Quests go here — Task 7. */}

      {/* The one number in Kairo that never moves, and the run of days against
          it. It moved tabs; the number did not change and never scales with
          the user. It sits under the race because the race is *today* and the
          walk is the floor every day shares. */}
      <DailyWalkCard
        userId={userId}
        timeZone={profile.data?.timezone}
        today={localToday}
        todaySteps={buckets.data?.totals?.steps}
      />

      {/* The door to Challenges — **the one gated thing on this tab**, and it
          keeps the wrapper it had on the character screen. A Challenge target
          is a trailing median over workout sessions a `core` account may have
          none of, so offering it on day one offers depth to somebody who has
          not produced the data it reads.

          Last on the tab deliberately: a hidden card at the bottom leaves no
          hole, where one removed from the middle would.

          `stage`, not `resolved && stage` — this hides a card, it does not
          navigate. Hiding early and revealing is a reveal; the redirect in
          `/train` is the one that has to wait. */}
      {disclosure.stage === 'full' && (
        <TrainEntry userId={userId} timeZone={profile.data?.timezone} today={localToday} />
      )}
    </Screen>
  );
}
```

`useDisclosure` is therefore mounted on this screen. Add it beside the other
hooks — it resolves to the same TanStack key the character screen already uses,
so it costs no extra request and the two screens cannot disagree in one frame:

```tsx
import { useDisclosure } from '@/features/character/useDisclosure.ts';
```

```tsx
  const disclosure = useDisclosure(userId);
```

- [ ] **Step 7: Take the cards off the character screen**

In `app/(tabs)/index.tsx`, delete the `<DailyWalkCard …>` block and the
`{disclosure.stage === 'full' && (<TrainEntry …>)}` block from the shelf,
together with their comments. **The `full` wrapper moves with `TrainEntry`** —
it is reproduced on the Today tab in Step 6, not dropped. Replace them with one line where the walk card
was:

```tsx
          {/* The Daily Walk and the Challenge door moved to the Today tab on
              2026-08-25 (deviation #50). This screen's subject is the
              character; everything below the hero was a different subject
              sharing a scroll. `GoalCard` below is still here and is deleted
              by the Events plan — do not pre-empt it. */}
```

Leave `TodayPanel`, `SyncStatus`, `GoalCard` and the disclosure note where they
are. Remove any import that `npm run typecheck` now reports as unused.

- [ ] **Step 8: Verify by hand**

```bash
npm run ios
xcrun simctl ui booted content_size accessibility-extra-extra-extra-large
# relaunch before screenshotting
xcrun simctl io booted screenshot /tmp/today-xxxl.png
```

Confirm: the race card renders for an account in a squad where both sides have
consented; it renders for a solo account only once Task 7 of plan 1 supplies
ghosts, and renders nothing rather than an empty card before that; the Daily
Walk and Challenge cards look identical to how they looked on the home screen;
and the character screen is now short enough that the hero and the TODAY panel
are both above the fold on a 6.1" device.

Open the Accessibility Inspector and confirm the race card is **one** element.

- [ ] **Step 9: Commit**

```bash
npm run typecheck
git add "app/(tabs)/today.tsx" "app/(tabs)/index.tsx" src/features/squad/RaceCard.tsx src/features/squad/race-label.ts src/features/squad/race-label.test.ts
git commit -m "feat(today): move the daily cards to their own tab and lead with the race"
```

---

### Task 7: The quest list

**Files:**
- Create: `src/features/quests/queries.ts`
- Create: `src/features/quests/QuestList.tsx`
- Modify: `app/(tabs)/today.tsx`
- Modify: `src/features/profile/queries.ts` (widen the profile row type)
- Modify: `app/(tabs)/profile.tsx` (the tier override control)

**Interfaces:**
- Consumes: `pickQuests`, `questTier`, `questProgress`, `QuestTier` from Task 1; `questHeadline`, `questProgressLine`, `questLabel` from Task 2; `quest_completions` and `profiles.quest_tier_override` from Task 3.
- Produces: `useTodayQuests(userId, timeZone)`, `<QuestList />`.

- [ ] **Step 1: Widen the profile row**

In `src/features/profile/queries.ts`, add `quest_tier_override` to the selected
columns and to the row type:

```ts
  /**
   * The player's chosen quest difficulty, or null to let `questTier()` decide
   * from trailing scored days. Null is the normal case, not an error case.
   */
  quest_tier_override: 'starter' | 'steady' | 'strong' | null;
```

Read the file first and match its existing column-list style — it is one string
constant in this codebase's other query modules.

- [ ] **Step 2: Write the query module**

Create `src/features/quests/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import {
  pickQuests,
  questProgress,
  questTier,
  type QuestDay,
  type QuestDef,
  type QuestState,
  type QuestTier,
} from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';

export const questCompletionsKey = (userId: string | undefined, localDate: string | undefined) =>
  ['quests', 'completions', userId ?? 'none', localDate ?? 'none'] as const;

/**
 * Which of today's quests have already latched.
 *
 * Server-written and read here only so a cleared quest keeps its tick after
 * finalization — before that, the card reads `met` from live progress. Two
 * sources for one boolean is deliberate: the latch is what pays XP and lags the
 * day by about two hours, and a card that showed nothing until then would look
 * broken all afternoon.
 */
export function useQuestCompletions(userId: string | undefined, localDate: string | undefined) {
  return useQuery({
    queryKey: questCompletionsKey(userId, localDate),
    enabled: Boolean(userId && localDate),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('quest_completions')
        .select('quest_id')
        .eq('local_date', localDate!);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.quest_id as string);
    },
  });
}

export interface TodayQuest {
  quest: QuestDef;
  state: QuestState;
}

/**
 * Today's three, with their live progress.
 *
 * **No fetch of its own for the quests themselves** — `pickQuests()` is pure,
 * so the three are computed from the account id and the local date. That is
 * the whole reason quests need no table and no midnight job.
 *
 * The tier read here MUST match the one `finalize-days` grades against
 * (`quest-plan.ts`): the same override precedence and the same lifetime scored
 * day count. If the two disagree, the server pays for quests that were never on
 * screen, and a completion latches.
 */
export function useTodayQuests(input: {
  userId: string | undefined;
  localDate: string | undefined;
  scoredDays: number;
  tierOverride: QuestTier | null;
  day: QuestDay | undefined;
  completedIds: readonly string[];
}): TodayQuest[] {
  if (!input.userId || !input.localDate) return [];

  const tier = questTier({
    trailingScoredDays: input.scoredDays,
    override: input.tierOverride,
  });

  const day: QuestDay = input.day ?? {
    steps: 0,
    activeKcal: 0,
    activeHours: 0,
    distanceM: 0,
    sleepMinutes: null,
  };

  return pickQuests({ userId: input.userId, localDate: input.localDate, tier }).map((quest) => {
    const state = questProgress(quest, day);
    return {
      quest,
      // A latched completion wins over live progress: a downward Apple
      // revision must never un-tick a quest the account was already paid for,
      // which is §19's rule and the reason completions latch at all.
      state: input.completedIds.includes(quest.id) ? { ...state, met: true, fraction: 1 } : state,
    };
  });
}
```

- [ ] **Step 3: Build the list**

Create `src/features/quests/QuestList.tsx`:

```tsx
import { View } from 'react-native';
import { Meter, Panel, Text, space } from '@/ui/index.ts';
import { colors, ramp } from '@/theme.ts';
import { questHeadline, questLabel, questProgressLine } from './quest-copy.ts';
import type { TodayQuest } from './queries.ts';

/**
 * Three quests, each one accessibility element.
 *
 * The grouping is explicit and both halves are load-bearing: the parent gets
 * `accessible` + `accessibilityLabel`, and every direct child gets
 * `accessibilityElementsHidden` **and**
 * `importantForAccessibility="no-hide-descendants"`. The documented collapse
 * behaviour did not happen on the 2026-08-14 build; removing either half is how
 * the twelve-stops-per-row bug returns.
 *
 * Flow-based layout throughout — no `top` on any child. Three stacked cards
 * with a bar in each is exactly the shape that overlapped when the character
 * HUD pinned its pills at fixed offsets.
 */
export function QuestList({ quests }: { quests: readonly TodayQuest[] }) {
  if (quests.length === 0) return null;

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View style={{ gap: space.sm }}>
      {quests.map(({ quest, state }) => (
        <Panel key={quest.id}>
          <View accessible accessibilityLabel={questLabel(quest, state)} style={{ gap: space.sm }}>
            <View
              {...hidden}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
            >
              {/* `flex: 1` so the headline takes the width it needs and the XP
                  chip is pushed to the end — never a fixed width, which is
                  what tears at large Dynamic Type. */}
              <Text scale="chrome" style={{ flex: 1 }}>
                {questHeadline(quest)}
              </Text>
              <Text scale="chrome" style={{ color: colors.subtle }}>
                {quest.xp} XP
              </Text>
            </View>

            <View {...hidden}>
              <Meter
                fraction={state.fraction}
                color={state.met ? colors.accent : ramp.neutral[400]}
                height={8}
              />
            </View>

            <Text {...hidden} scale="chrome" style={{ color: colors.subtle }}>
              {questProgressLine(quest, state)}
            </Text>
          </View>
        </Panel>
      ))}
    </View>
  );
}
```

- [ ] **Step 4: Mount it**

In `app/(tabs)/today.tsx`, replace the `{/* Quests go here — Task 7. */}`
placeholder. Add the imports and the composition:

```tsx
import { useScoredDayCount } from '@/features/character/queries.ts';
import { useQuestCompletions, useTodayQuests } from '@/features/quests/queries.ts';
import { QuestList } from '@/features/quests/QuestList.tsx';
```

```tsx
  const scoredDays = useScoredDayCount(userId);
  const completions = useQuestCompletions(userId, localToday);

  const quests = useTodayQuests({
    userId,
    localDate: localToday,
    // `?? 0` while the count is in flight puts a first-frame account on the
    // starter tier, which is the safe direction: showing an easy quest and
    // then a harder one is a correction, where the reverse is a bar
    // disappearing out from under someone mid-walk.
    scoredDays: scoredDays.data ?? 0,
    tierOverride: profile.data?.quest_tier_override ?? null,
    day: buckets.data?.totals && {
      steps: buckets.data.totals.steps,
      activeKcal: buckets.data.totals.activeKcal,
      activeHours: buckets.data.totals.activeHours,
      distanceM: buckets.data.totals.distanceM,
      sleepMinutes: null,
    },
    completedIds: completions.data ?? [],
  });
```

```tsx
      <QuestList quests={quests} />
```

Read `src/features/character/buckets.ts` first and use `DayTotals`' real field
names — `steps`, `activeKcal`, `activeHours` are the expected ones and the
distance field may be named differently. If `DayTotals` carries no distance,
sum it in `useTodayBuckets` rather than adding a second query, and if that is
more than a one-line change, drop the `distance_m` quests from the catalogue
instead — a quest nobody can see progress on is worse than one fewer quest.

`sleepMinutes` is `null` here on purpose for now: `useTodayVitals` is what reads
it, and it is mounted on the character screen rather than this one. Wire it in
the same step if the query is cheap to share (it is — TanStack shares the cache
on the same key); otherwise the sleep quests read "No reading yet" all day,
which is honest but useless, and the fix is to mount `useTodayVitals` here.

- [ ] **Step 5: Add the tier override to Profile**

In `app/(tabs)/profile.tsx`, add a control that writes
`profiles.quest_tier_override` through the existing `useUpdateProfile` mutation.
Three options plus "Automatic" (null). Model it on whatever selection control
that screen already uses; if it uses none, use three `Button`s with
`variant="secondary"` and the current one as `variant="primary"`.

Copy: heading **Quest difficulty**, body *"Kairo picks a difficulty from how
long you have been here. If the quests feel wrong, choose your own."* That
sentence is doing real work — it names the automatic rule's actual input, which
is engagement rather than fitness, so a user who finds their quests too easy
understands why rather than assuming the app measured them and got it wrong.

- [ ] **Step 6: Verify by hand**

```bash
npm run ios
xcrun simctl ui booted content_size accessibility-extra-extra-extra-large
# relaunch before screenshotting
xcrun simctl io booted screenshot /tmp/quests-xxxl.png
```

Confirm: three quest cards, no headline clipped mid-word, no XP chip pushed off
the card, bars aligned. Change the tier override in Profile and confirm the
three quests change immediately. Confirm a brand-new account (no scored days)
sees three starter quests rather than an empty tab.

Then open the Accessibility Inspector and confirm **each quest card is one
element**, not four.

- [ ] **Step 7: Commit**

```bash
npm run typecheck
npm test
git add src/features/quests/ "app/(tabs)/today.tsx" "app/(tabs)/profile.tsx" src/features/profile/queries.ts
git commit -m "feat(quests): three a day on the Today tab, with a difficulty override"
```

---

### Task 8: The gate keeps exactly what it kept

**Files:**
- Modify: `src/features/character/useDisclosure.ts` (the doc comment)
- Verify only, no edit: `app/train.tsx`, `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed later.

**This task is mostly a task about what *not* to change**, and it is a real task
for that reason: a reader arriving from the parent spec's §4.4 will see
`StatRail` and Strain/Sleep named as what the gate keeps, read the list as
exhaustive, and delete the `/train` redirect. Spec §4.6 settles it the other way
— **Challenges stay gated** — and this task is where that decision is enacted
and recorded in the code.

Do not touch `disclosure.ts`, `DISCLOSURE_THRESHOLD_DAYS`, its test, or
`useScoredDayCount`. Do not touch `TrainEntry`'s wrapper on the Today tab. Do
not touch the goal gates — plan 4 deletes those surfaces entirely.

- [ ] **Step 1: Confirm `/train`'s redirect is intact and say why it stays**

In `app/train.tsx`, this line must still be present and unmodified:

```tsx
  if (disclosure.resolved && disclosure.stage === 'core') return <Redirect href="/" />;
```

Its existing comment already explains `resolved`. **Append** this paragraph to
that comment block — do not replace what is there:

```tsx
  // Unchanged by the Today tab (deviation #50). Quests left the gate;
  // Challenges did not, and the parent spec's §4.4 list is read as
  // illustrative rather than exhaustive — its own §5.3 says Challenges keep
  // their behaviour unchanged, and the redirect is part of that behaviour. A
  // Challenge target is a trailing median over workout sessions a `core`
  // account may have none of, where a quest is the thing that teaches the loop.
```

- [ ] **Step 2: Confirm the `core` note on the character screen still reads true**

`app/(tabs)/index.tsx`'s disclosure note promises "goals, challenges and your
full stat breakdown open up". After this plan, all three of those are still
gated — goals until plan 4 deletes them, challenges permanently, the stat
breakdown permanently. **The copy is correct as written; leave it.**

Plan 4 rewrites it when `GoalCard` goes. Editing it here to say the same thing
in different words would be re-wording one sentence twice.

Quests are deliberately absent from that sentence: they are not something that
"opens up", they are on screen from day one.

- [ ] **Step 3: Update the hook's doc comment**

In `src/features/character/useDisclosure.ts`, the doc comment lists the callers
as "the home screen, `/train`, `/goal/new`, `SquadGoalPanel`". That list gains
one — the Today tab now calls it for `TrainEntry` — and the gated-surface list
was never written down at all, which is what let the wider reading look
plausible. **Append** this paragraph after the existing "Hide on `stage`,
navigate on `resolved && stage`" one, and add the Today tab to the caller list:

```
 * **What the gate keeps, written down as of 2026-08-25 (deviation #50):** the
 * stat rail and its expanded per-stat block, the Strain/Sleep rows in
 * `TodayPanel`, `TrainEntry`, and `/train`'s own redirect. That list is
 * UNCHANGED by the Today tab — quests are simply built outside it, which is a
 * fact about a new surface rather than a change to this rule.
 *
 * The distinction, because it is the one a reader will want to undo: a quest is
 * what teaches the loop, so gating it is backwards. A Challenge is a trailing
 * median over workout sessions a `core` account may have none of, and it is
 * opt-in and off by default — offering it on day one offers depth to somebody
 * who has not yet produced the data it reads.
```

- [ ] **Step 4: Verify by hand**

Create a fresh account, or clear an existing one's scored days, and confirm:

- The Today tab shows the race card, three quests and the Daily Walk on day one,
  and **no Challenge door**.
- The character screen still hides the stat rail and the Strain/Sleep rows, and
  still shows the "goals, challenges and your full stat breakdown" note.
- A Challenge push tapped from a cold launch on a `core` account lands on
  `/train` and is redirected home — and on a `full` account lands on `/train`
  and **stays there**. That second case is the one the `resolved` guard exists
  for and the one a regression here would break silently.
- Cross the threshold (three scored days) and confirm the Challenge door appears
  on the Today tab without a relaunch.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
npm test
git add src/features/character/useDisclosure.ts app/train.tsx
git commit -m "docs(disclosure): write down what the gate keeps, and keep Challenges in it"
```

---

### Task 9: Documentation

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`
- Modify: `docs/mvp-scope.md`
- Modify: `docs/user-journey.md`

Documentation updates are part of the change, not a follow-up.

- [ ] **Step 1: Add deviation #50**

In `docs/roadmap.md`'s approved-deviations table, add row **#50** in the table's
existing style — what the spec said, what was built, and *why*, at length. It
must record:

- The fourth tab, and that `TabPill` is a hand-built four-disc orbit nav rather
  than a stock tab bar: the discs shrank from 60/74 to 52/68 and the gap from
  `space.lg` to `space.md` so four fit a 320pt screen, and **the character
  keeps the raised disc without being geometrically centred**, because a raised
  disc means anchor rather than middle.
- Quests as **derived, never stored** — `pickQuests()` is a pure hash of
  `(userId, localDate, tier)`, which is what makes the local-midnight reset cost
  no job and no row, and which inherits the replay property from the same place
  a Challenge does. Only the completion is stored, in `quest_completions`,
  written by `finalize-days` from final days with `on conflict do nothing`.
- **The tier rule measures engagement, not capability**, and that this was the
  spec's choice made explicit rather than silently improved — with the trailing
  step median named as the rejected alternative and the reason (it makes the bar
  scale with the user, which is what the Daily Walk exists to refuse). The
  Profile override is the correction for a rule that is wrong by construction
  for part of the cohort, which is why it ships in Phase 1.
- **The client's tier read and `quest-plan.ts`'s must agree**, or the server pays
  for quests that were never on screen and the completion latches.
- **`recalculate_user_xp` gained a fourth source and is a full recompute written
  out whole**, so plans 3 and 4 both rewrite it and the second one must carry
  the first's sources forward. Name the check:
  `select prosrc from pg_proc where proname = 'recalculate_user_xp'`.
- **The disclosure gate is unchanged, including its subject list**, and the
  parent spec's §4.4 reads the other way — record the narrowing and its reason.
  §4.4 names `StatRail` and Strain/Sleep as what the gate keeps; read as
  exhaustive that takes Challenges out of it, and §5.3 of the same document says
  Challenges keep their behaviour unchanged. The redirect is part of that
  behaviour, so the list is read as illustrative. §4.4's stated motive — a Today
  tab showing only the Daily Walk for three days — is served without it: the
  race card, three quests and the walk are all ungated. Quests are outside the
  gate because a quest teaches the loop; a Challenge is a trailing median over
  workout sessions a `core` account may have none of.

Numbers #44–#49 and #51–#52 belong to the other four plans. Do not claim them here.

- [ ] **Step 2: Update `CLAUDE.md`**

Add a dated block in the style of the existing ones:

- **Kairo has four tabs as of 2026-08-25** (deviation #50) — Character · Today ·
  Squad · You. `TabPill` is hand-built; the disc sizes and the bar gap are load
  bearing and were computed against a 320pt screen.
- **A quest is derived, never stored.** `pickQuests()` is a pure hash of
  `(userId, localDate, tier)` — no table, no midnight job, and nothing stateful
  for a retroactive revision to invalidate. Only `quest_completions` is stored.
  **A `quest_id` is permanent**: renaming one orphans every completion banked
  against it.
- **The client and `finalize-days` must resolve the same quest tier.** Both call
  `questTier()` with the same lifetime scored-day count and the same
  `profiles.quest_tier_override`, and the override wins outright. A disagreement
  pays XP for a quest that was never on screen.
- **`recalculate_user_xp` is a full recompute written out whole.** It now sums
  four sources. Read the deployed body before editing it — a migration that
  omits a source drops it silently and every affected account's level falls on
  the next write.
- **The disclosure gate keeps the stat rail, the Strain/Sleep rows,
  `TrainEntry` and `/train`'s redirect** — the list is now written down in
  `useDisclosure`'s doc comment, because it never was, and that is what let a
  wider reading look plausible. Quests are outside it; nothing was taken out of
  it. The constant, the `total > 0` filter, the `resolved && stage` navigation
  rule and the retention measurement are all unchanged.

- [ ] **Step 3: Update `docs/mvp-scope.md`**

Add quests and the Today tab to the IN list. Add a vocabulary row: the fourth
tab is **Today**. State that quest XP is a fourth source on `profiles.total_xp`,
so any brief describing XP as coming from days and goals alone is stale.

- [ ] **Step 4: Update `docs/user-journey.md`**

The daily loop now opens on a tab of its own. Rewrite the walkthrough so the
first thing a new account meets after onboarding is the Today tab with three
quests, and so the character screen is described as the character rather than as
the day.

- [ ] **Step 5: Run everything and commit**

```bash
npm test
npm run typecheck
git add docs/ CLAUDE.md
git commit -m "docs: record the Today tab and derived daily quests"
```

Expected: both PASS. If `npm test` fails, fix the code — not the test.

---

## Definition of done

- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes (all three checks — tsc, workspace tsc, deno check).
- [ ] `node supabase/scripts/smoke-sync.mjs` passes against the deployed `finalize-days`.
- [ ] `./supabase/scripts/remote-sql.sh "select prosrc from pg_proc where proname = 'recalculate_user_xp'"` shows a body naming `daily_scores`, the goal/event completions table, **and** `quest_completions`.
- [ ] `grep -rn "10_000\|10000" src/features/quests packages/kairo-core/src/quest.ts` returns nothing.
- [ ] A screenshot at `accessibility-extra-extra-extra-large`, taken after a relaunch, shows four unclipped nav discs and three unclipped quest cards.
- [ ] Xcode's Accessibility Inspector reports each quest card and the race card as **one** element, and the nav as four `tab` elements.
- [ ] A brand-new account with zero scored days sees three starter quests, the Daily Walk and the Challenge door on the Today tab, and no stat rail on the character screen.
- [ ] Changing the quest difficulty in Profile changes the three quests on the next render, and a day finalized afterwards pays XP for the quests that were shown.

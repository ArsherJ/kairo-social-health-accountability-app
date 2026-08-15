# Solo Mode — Walk, Strength, Run — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Kairo's solo mode three areas — a flat Walk baseline, and adaptive Strength and Run Challenges backed by HealthKit workout sessions — plus the medical reasoning behind the four stats.

**Architecture:** Challenges are **derived, never stored**: the target for a day is a pure function of qualifying workout sessions strictly before that day, so nothing is stateful, retroactive HealthKit revisions flow through for free, and "ease after a bad stretch" needs no separate rule. Completion is a one-way latch written by `finalize-days`, the `goal_completions` pattern. All arithmetic lives in one new `kairo-core` module imported verbatim by both the app and the Edge Function.

**Tech Stack:** TypeScript, `@kairo/core` (pure, zero-dependency), Expo/React Native, Supabase (Postgres + Edge Functions on Deno), Vitest, PGlite.

**Spec:** `docs/superpowers/specs/2026-08-15-solo-mode-walk-strength-run-design.md`

## Global Constraints

- **Scoring is untouched.** `computeDailyScore`, `TIER_POINTS`, `THRESHOLDS`, `daily_scores` and score replay do not change. Pace never enters `daily_scores`. A run still earns AGI through its steps.
- **`kairo-core` stays pure:** no I/O, no clock reads, no randomness, no dependencies. Every function takes what it needs as an argument.
- **Edge Function handlers stay thin.** Every decision lives in a `*-plan.ts` module tested in plain Node. Docker is unavailable on this machine, so anything untestable in Node is effectively untested.
- **Imports use explicit `.ts` extensions** — Deno requires it, Vite and Metro both accept it.
- **A migration touching a table an Edge Function writes ships with that function's redeploy.** Applying one without the other took scoring down for two days in August 2026.
- **After deploying `sync-health`, run `supabase/scripts/smoke-sync.mjs`.** Tests check the source; only the smoke test checks the deployed artifact.
- **Applying a migration here means:** `./supabase/scripts/remote-sql.sh -f <file>`, then insert its row into `supabase_migrations.schema_migrations` by hand, or the CLI re-applies it later. Wrap multi-statement migrations in `begin; ... commit;`. `supabase db push`, `psql` and `supabase start` all fail on this machine — port 5432 blocked, IPv6-only host, no Docker.
- **`revoke all` then re-grant** on new tables — never `revoke insert, update, delete`. Supabase's default privileges grant ALL, and ALL includes TRUNCATE, which RLS does not restrict.
- **`profiles` UPDATE is granted per column.** A column-level `REVOKE` against a table-level `GRANT` is silently a no-op in Postgres: revoke the table grant, then re-grant the allowed column list.
- **Import `Text` from `@/ui`, never from `react-native`.** Scales: `prose` (default) for copy in growing containers, `chrome` for buttons and meta lines, `fixed` for type locked to drawn geometry.
- **Every new UI element needs an accessible name**, composed the way `StatIcon` and `row-label.ts` establish. Grouping is explicit: the parent keeps `accessible` + `accessibilityLabel` **and** every direct child is hidden with `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`.
- **No `prebuild` is required by this plan.** `HKWorkoutTypeIdentifier` is already in `KAIRO_READ_TYPES` and already covered by `NSHealthShareUsageDescription`. If you find yourself changing `app.config.ts`, stop — `ios/` is committed (deviation #28) and the change needs a prebuild plus a commit of the regenerated `ios/`, or it silently never reaches the build.
- **Task 6 and Task 9 must not deploy on the same day.** Task 6 puts workout sessions into the world; Task 9 turns on an engine that reads a *trailing window* of them. Deployed together, every user's challenge resolves to cold-start `establish` regardless of how much they actually train, because there is no history yet — and the first real targets would then appear days later with no explanation. Let Task 6 run in production for **at least three days** before deploying Task 9. Tasks 7 and 8 (pure code and an unapplied migration) can be written during that gap.
- **Ordering vs. the sibling plan:** `2026-08-15-points-stop-being-spoken.md` is independent and recommended first. Task 1 here renames the `gym` program; that plan edits only a doc comment in `program-copy.ts`, so whichever lands second inherits the rename.
- **Commands:** `npm test` (everything) · `npm run test:core` · `npm run test:schema` · `npm run typecheck` · single file: `npm run test:core -- --run src/challenge.test.ts`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `supabase/migrations/20260815090000_program_gym_to_strength.sql` | Rename the program value everywhere in SQL. | Create |
| `packages/kairo-core/src/program.ts` | `SquadProgram` enum and boost mapping. | Modify |
| `src/features/squad/program-copy.ts` | Program labels, blurbs, accuracy note. | Modify |
| `packages/kairo-core/src/scoring.ts` | Export `DAILY_STEP_BASELINE`, derived from `THRESHOLDS`. | Modify |
| `src/features/character/stat-detail.ts` | Add `STAT_WHY`. | Modify |
| `app/progress.tsx` | Render the four rationales. | Modify |
| `src/features/train/daily-walk.ts` | **New.** Pure: today's walk progress and the streak. | Create |
| `src/features/train/DailyWalkCard.tsx` | **New.** The home-shelf card. | Create |
| `supabase/migrations/20260815100000_workout_sessions.sql` | The sessions table, RLS, grants. | Create |
| `src/features/health/read.ts` | Keep workout fields instead of discarding them. | Modify |
| `src/features/health/activity-types.ts` | **New.** Compile-time guard on the HK enum values. | Create |
| `supabase/functions/_shared/sync-plan.ts` | Validate the sessions array. | Modify |
| `supabase/functions/sync-health/index.ts` | Upsert sessions. | Modify |
| `packages/kairo-core/src/challenge.ts` | **New.** The whole engine, pure. | Create |
| `supabase/migrations/20260815110000_challenges.sql` | Completions table, opt-in columns, XP rollup. | Create |
| `supabase/functions/_shared/challenge-plan.ts` | **New.** The finalize-days decision half. | Create |
| `supabase/functions/finalize-days/index.ts` | Wire the challenge pass. | Modify |
| `packages/kairo-core/src/notifications.ts` | Add the `challenge_cleared` trigger. | Modify |
| `app/train.tsx` | **New.** The stacked route. | Create |
| `app/(tabs)/index.tsx` | Daily Walk card + `/train` entry. | Modify |

---

## Task 1: Rename the `gym` program to `strength`

Smallest piece, and the one most likely to be left half-done — so it lands alone.
Five places must move together: the CHECK constraint, existing rows,
`create_squad`'s inline validation, `program_weighted_total`'s weight expression,
and the TypeScript enum. The existing `PROGRAM_WEIGHTS`-vs-SQL differential test
is what proves the last two agree.

**Files:**
- Create: `supabase/migrations/20260815090000_program_gym_to_strength.sql`
- Modify: `packages/kairo-core/src/program.ts:21-50`
- Modify: `src/features/squad/program-copy.ts:27-67`
- Test: `packages/kairo-core/src/program.test.ts`, `src/features/squad/program-copy.test.ts`, `supabase/tests/schema.test.ts`

**Interfaces:**
- Produces: `SquadProgram = 'all_around' | 'running' | 'strength' | 'walking'`. `GYM_ACCURACY_NOTE` is renamed `STRENGTH_ACCURACY_NOTE`.

- [ ] **Step 1: Update the core enum and its test**

In `packages/kairo-core/src/program.ts`, change `'gym'` to `'strength'` in three
places: the `SquadProgram` union (line 21), the `SQUAD_PROGRAMS` array (line 26),
and the `BOOSTED_STAT` record key (line 48). Also update `PROGRAM_WEIGHTS`'s key
(line 69).

In `program.test.ts`, change every `'gym'` literal to `'strength'`.

- [ ] **Step 2: Run the core tests and confirm they pass**

Run: `npm run test:core -- --run src/program.test.ts`
Expected: PASS.

- [ ] **Step 3: Update the copy module**

In `src/features/squad/program-copy.ts`:

```ts
  { value: 'strength', label: 'Strength', blurb: 'Strength and effort count for more' },
```

Rename the note and its predicate:

```ts
/**
 * The honest-capability rule, applied where it bites hardest. STR comes from
 * estimated active energy, which a phone in a pocket measures poorly during a
 * lifting session — so a strength squad founded on phones alone may feel dead.
 * Say it at the moment the choice is made, not in a support article.
 */
export const STRENGTH_ACCURACY_NOTE =
  'Strength tracking is most accurate with a watch or band.';

export function programNote(program: SquadProgram): string | null {
  return program === 'strength' ? STRENGTH_ACCURACY_NOTE : null;
}
```

Update `program-copy.test.ts` for the new value, label and constant name, then
grep for the old name and fix every call site:

```bash
grep -rn "GYM_ACCURACY_NOTE\|'gym'" --include="*.ts" --include="*.tsx" src app packages
```

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260815090000_program_gym_to_strength.sql`:

```sql
-- Rename the `gym` squad program to `strength` (2026-08-15).
--
-- Part 3 §16 of docs/assessments/2026-08-14-metric-purpose-and-cadence-goals.md:
-- the solo side calls this area Strength, and carrying two words for one idea is
-- a vocabulary tax on every future screen. `strength` rather than
-- `calisthenics` because STR rides estimated active energy and cannot tell
-- bodyweight work from weights — a narrower word would promise a distinction
-- the data cannot make.
--
-- Mirrored in packages/kairo-core/src/program.ts. The PROGRAM_WEIGHTS
-- differential test in the schema suite is what keeps the two honest.

begin;

-- The constraint has to go before the data can move.
alter table public.squads drop constraint if exists squads_program_check;

update public.squads set program = 'strength' where program = 'gym';

alter table public.squads
  add constraint squads_program_check
  check (program in ('all_around', 'running', 'strength', 'walking'));

comment on column public.squads.program is
  'The squad''s shared game. Boosts one stat at read time in squad_leaderboard(); stored scores are program-independent (deviation #11). Fixed at creation — no UPDATE grant. Mirrored as SquadProgram in packages/kairo-core/src/program.ts.';

commit;
```

**Then, in the same file, before the `commit;`**, re-create the two functions
that carry the program list inline. Do not retype them from memory:

1. Copy the whole `create or replace function public.create_squad(...)` body from
   `supabase/migrations/20260807100100_squads_program.sql` (starts around line
   40). Change only the validation list on its line 64:
   `if p_program not in ('all_around', 'running', 'strength', 'walking') then`.
2. Copy the whole `program_weighted_total` function from
   `supabase/migrations/20260807100200_leaderboard_program_weighting.sql`
   (the weight expression is around line 61). Change only
   `p_str * (case when p_program = 'gym' then 1.5 else 1 end)` to
   `p_program = 'strength'`.

Both must be byte-identical to the originals apart from those two literals — a
transcription slip here silently changes squad creation or every board's ranking.

- [ ] **Step 5: Run the schema suite**

Run: `npm run test:schema`
Expected: PASS. The `PROGRAM_WEIGHTS` differential test exercises
`program_weighted_total` against the TypeScript table on fixture days; if it
fails, the SQL and the enum disagree and one of Steps 1 and 4 is wrong.

- [ ] **Step 6: Apply to the live project**

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260815090000_program_gym_to_strength.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version) values ('20260815090000')"
./supabase/scripts/remote-sql.sh "select program, count(*) from public.squads group by program"
```

Expected: no rows report `gym`.

- [ ] **Step 7: Full check and commit**

Run: `npm run typecheck && npm test`

```bash
git add supabase/migrations/20260815090000_program_gym_to_strength.sql packages/kairo-core/src/program.ts packages/kairo-core/src/program.test.ts src/features/squad/program-copy.ts src/features/squad/program-copy.test.ts
git commit -m "refactor: rename the gym squad program to strength

One word for one idea — the solo side calls this area Strength. Moves
the CHECK, existing rows, create_squad's inline validation,
program_weighted_total's weight expression and the core enum together;
the differential test is what proves the last two agree."
```

---

## Task 2: The four stats gain a stated reason

Copy only. §5 of the spec contains the reasoning — *"sedentary behavior across
the day is one of the strongest predictors of long-term health decline,
regardless of how much you exercise in one session"* — and the app has never
shipped it.

**Files:**
- Modify: `src/features/character/stat-detail.ts:8-14`
- Modify: `app/progress.tsx:26-47`

**Interfaces:**
- Produces: `STAT_WHY: Record<CoreStat, string>`, exported alongside `STAT_UNITS`.

- [ ] **Step 1: Add the table**

In `src/features/character/stat-detail.ts`, directly under `STAT_UNITS`:

```ts
/**
 * Why each stat is worth caring about, medically.
 *
 * The spec has carried this reasoning since §5 and the app has never said it:
 * the character screen reports that VIT is high without ever mentioning that
 * sitting still all day is its own risk, independent of exercise — which is the
 * entire reason VIT is hourly movement rather than workout volume.
 *
 * One sentence each, because this sits in a help sheet a curious user opens,
 * not in a medical leaflet. Copy, so it lives here beside STAT_UNITS.
 */
export const STAT_WHY: Record<CoreStat, string> = {
  AGI: 'Daily step count is one of the strongest single predictors of long-term health — and it keeps improving well past the point most people assume it plateaus.',
  STR: 'Strength work protects muscle and bone as you age, which is what keeps you independent later. It is the thing cardio alone does not cover.',
  END: 'Sustained effort is what builds cardiovascular fitness. Kairo reads Apple’s exercise minutes for this, so a watch measures it more faithfully than a phone in a pocket.',
  VIT: 'Moving every hour matters more than one long workout. Sitting still the rest of the day carries its own risk, independent of how hard you trained — which is why this counts hours you moved, not minutes you exercised.',
};
```

- [ ] **Step 2: Render them**

In `app/progress.tsx`, the `ENTRIES` array is organised by timescale and should
stay that way — the rationales are a **second** section, not four more entries,
because they answer a different question ("why does this matter") than the
entries do ("what is this number").

Add after the `ENTRIES` map in the JSX, before the footnote:

```tsx
      <Text style={styles.term}>Why these four</Text>
      {CORE_STATS.map((stat) => (
        <View key={stat} style={styles.entry}>
          <Text style={styles.scope}>{STAT_NAMES[stat]}</Text>
          <Text style={styles.body}>{STAT_WHY[stat]}</Text>
        </View>
      ))}
```

Add the imports: `CORE_STATS` from `@kairo/core`, `STAT_NAMES` from
`@/ui/index.ts`, and `STAT_WHY` from
`@/features/character/stat-detail.ts`. Reuse the existing `entry`, `scope` and
`body` styles rather than adding new ones — this is the same shape of content.

- [ ] **Step 3: Verify on the simulator**

```bash
npm run ios
```

Navigate: home shelf → "How progress works". Expected: the four rationales
render under the existing four entries, and the screen still scrolls to the
footnote.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/features/character/stat-detail.ts app/progress.tsx
git commit -m "feat: say why each stat matters, not just what it is

STAT_WHY is §5's own reasoning, shortened to a sentence a help sheet can
carry. The VIT line is the one the app most conspicuously never said."
```

---

## Task 3: `DAILY_STEP_BASELINE` and the Daily Walk state

The walk baseline is flat, permanent and 10,000 — a public-health number, never a
personal-progress one, and deliberately **not** a `goals` row (the existing shape
cannot express "every day, forever, resets daily").

The streak reads `daily_scores.tiers->>'AGI' = 'gold'`, which *is* "≥ 10,000
steps" because that is the AGI Gold threshold. That coupling is the fragile part
and is guarded by a test rather than trusted.

**Files:**
- Modify: `packages/kairo-core/src/scoring.ts:66-73`
- Test: `packages/kairo-core/src/scoring.test.ts`
- Create: `src/features/train/daily-walk.ts`
- Test: `src/features/train/daily-walk.test.ts`

**Interfaces:**
- Produces: `DAILY_STEP_BASELINE: number` from `@kairo/core`; `dailyWalkState(input): DailyWalk` from `src/features/train/daily-walk.ts`, where `DailyWalk = { steps: number; baseline: number; fraction: number; met: boolean; streakDays: number }`.

- [ ] **Step 1: Write the failing guard test**

Add to `packages/kairo-core/src/scoring.test.ts`:

```ts
  it('exports the walk baseline as the AGI gold threshold itself', () => {
    // The Daily Walk streak reads `tiers.AGI === 'gold'` as a proxy for
    // "cleared 10,000 steps". That is only true while these two numbers are
    // the same one. If Gold moves, this fails instead of the streak silently
    // changing meaning.
    expect(DAILY_STEP_BASELINE).toBe(10_000);
    expect(tierFor('AGI', DAILY_STEP_BASELINE)).toBe('gold');
    expect(tierFor('AGI', DAILY_STEP_BASELINE - 1)).not.toBe('gold');
  });
```

Add `DAILY_STEP_BASELINE` to that file's import from `./scoring.ts`.

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test:core -- --run src/scoring.test.ts`
Expected: FAIL — `DAILY_STEP_BASELINE` is not exported.

- [ ] **Step 3: Export it, derived**

In `packages/kairo-core/src/scoring.ts`, directly after the `THRESHOLDS` const:

```ts
/**
 * The daily walking baseline (10,000 steps).
 *
 * Derived from the tier table rather than written as a literal, the same way
 * `STAT_POINTS_MAX` derives from `TIER_POINTS` — a raised Gold must not leave a
 * second number describing the old one.
 *
 * It is a **public-health figure, not a personal-progress one**: it never scales
 * up as a user improves, which is exactly what separates it from a Challenge.
 * Because it is the same number as AGI's Gold threshold, a stored day's
 * `tiers.AGI === 'gold'` is equivalent to "cleared the baseline" — which is what
 * lets the walk streak read stored scores with no new column. `scoring.test.ts`
 * pins that equivalence.
 */
export const DAILY_STEP_BASELINE = THRESHOLDS.AGI.gold;
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npm run test:core -- --run src/scoring.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing daily-walk test**

```ts
// src/features/train/daily-walk.test.ts
import { describe, expect, it } from 'vitest';
import { dailyWalkState } from './daily-walk.ts';

const met = (localDate: string) => ({ localDate, clearedBaseline: true });
const missed = (localDate: string) => ({ localDate, clearedBaseline: false });

describe('dailyWalkState', () => {
  it('reports progress against the flat baseline', () => {
    const state = dailyWalkState({ todaySteps: 6_240, today: '2026-08-15', days: [] });
    expect(state.steps).toBe(6_240);
    expect(state.baseline).toBe(10_000);
    expect(state.fraction).toBeCloseTo(0.624);
    expect(state.met).toBe(false);
  });

  it('clamps the fraction at one so a big day cannot overfill a meter', () => {
    const state = dailyWalkState({ todaySteps: 24_000, today: '2026-08-15', days: [] });
    expect(state.fraction).toBe(1);
    expect(state.met).toBe(true);
  });

  it('counts a streak of consecutive cleared days ending today', () => {
    const state = dailyWalkState({
      todaySteps: 11_000,
      today: '2026-08-15',
      days: [met('2026-08-13'), met('2026-08-14')],
    });
    // Today counts because it is already cleared.
    expect(state.streakDays).toBe(3);
  });

  it('keeps yesterday-ending streaks alive before today is cleared', () => {
    const state = dailyWalkState({
      todaySteps: 400,
      today: '2026-08-15',
      days: [met('2026-08-13'), met('2026-08-14')],
    });
    // A streak is not broken at 00:01 — today is simply not counted yet.
    expect(state.streakDays).toBe(2);
  });

  it('breaks the streak on a missed day', () => {
    const state = dailyWalkState({
      todaySteps: 11_000,
      today: '2026-08-15',
      days: [met('2026-08-12'), missed('2026-08-13'), met('2026-08-14')],
    });
    expect(state.streakDays).toBe(2);
  });

  it('breaks the streak on a gap in the record, not just a recorded miss', () => {
    const state = dailyWalkState({
      todaySteps: 11_000,
      today: '2026-08-15',
      // 2026-08-13 is absent entirely — no scored day at all.
      days: [met('2026-08-11'), met('2026-08-12'), met('2026-08-14')],
    });
    expect(state.streakDays).toBe(2);
  });

  it('reports a zero streak with no history', () => {
    const state = dailyWalkState({ todaySteps: 0, today: '2026-08-15', days: [] });
    expect(state.streakDays).toBe(0);
  });
});
```

- [ ] **Step 6: Run and confirm failure**

Run: `npx vitest run src/features/train/daily-walk.test.ts`
Expected: FAIL — cannot resolve `./daily-walk.ts`.

- [ ] **Step 7: Implement**

```ts
// src/features/train/daily-walk.ts
import { DAILY_STEP_BASELINE } from '@kairo/core';

/**
 * The Daily Walk baseline — flat, permanent, 10,000 steps.
 *
 * Deliberately not a Challenge and deliberately not a `goals` row. Not a
 * Challenge because it must never scale up: it is a public-health number, and
 * conflating it with personal progress is the specific error Part 2 §9 of the
 * assessment names. Not a Goal because the existing shape cannot express "every
 * day, forever, resets daily" — open-ended goals are cumulative and never reset.
 *
 * Pure and clock-free, like everything worth testing: `today` is an argument.
 */

/** One past day, as the caller projects it from `daily_scores`. */
export interface WalkDay {
  localDate: string;
  /**
   * Whether that day cleared the baseline.
   *
   * The caller derives this from `tiers.AGI === 'gold'` — `daily_scores` stores
   * no raw steps, and AGI Gold *is* the 10,000 threshold. `scoring.test.ts`
   * pins that equivalence so it cannot drift.
   */
  clearedBaseline: boolean;
}

export interface DailyWalk {
  steps: number;
  baseline: number;
  /** 0–1, clamped. For sizing a meter. */
  fraction: number;
  met: boolean;
  /** Consecutive cleared days ending today, or yesterday if today is not yet cleared. */
  streakDays: number;
}

/** Date-only, so DST cannot shift the count. */
function previousDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  return at.toISOString().slice(0, 10);
}

export function dailyWalkState(input: {
  todaySteps: number;
  today: string;
  days: readonly WalkDay[];
}): DailyWalk {
  const met = input.todaySteps >= DAILY_STEP_BASELINE;

  const cleared = new Set(
    input.days.filter((d) => d.clearedBaseline).map((d) => d.localDate),
  );

  // Walk backwards from today. A day absent from `days` breaks the run exactly
  // as a recorded miss does — no scored day is not a cleared day, and treating
  // a gap as a pass would inflate the streak of anyone who stopped syncing.
  let streakDays = 0;
  let cursor = met ? input.today : previousDate(input.today);
  while (cursor === input.today ? met : cleared.has(cursor)) {
    streakDays += 1;
    cursor = previousDate(cursor);
  }

  return {
    steps: input.todaySteps,
    baseline: DAILY_STEP_BASELINE,
    // Clamped: a meter filled past its own width is a rendering bug waiting to
    // happen, and 24,000 steps is a real day.
    fraction: Math.min(1, input.todaySteps / DAILY_STEP_BASELINE),
    met,
    streakDays,
  };
}
```

- [ ] **Step 8: Run and confirm the tests pass**

Run: `npx vitest run src/features/train/daily-walk.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 9: Commit**

```bash
git add packages/kairo-core/src/scoring.ts packages/kairo-core/src/scoring.test.ts src/features/train/daily-walk.ts src/features/train/daily-walk.test.ts
git commit -m "feat: the Daily Walk baseline, derived from the AGI gold threshold

DAILY_STEP_BASELINE comes off THRESHOLDS rather than being written
twice, and a test pins that tiers.AGI === 'gold' still means 'cleared
10,000' — which is what lets the streak read stored scores with no new
column."
```

---

## Task 4: The Daily Walk card on the home shelf

**Files:**
- Create: `src/features/train/DailyWalkCard.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `dailyWalkState` from Task 3; `useTodayBuckets` (already used on this screen for the stat coins).

- [ ] **Step 1: Add a query for recent walk days**

The card needs recent days' `tiers`. Check `src/features/character/queries.ts`
for an existing recent-days query before adding one — if none exists, add:

```ts
export function useRecentWalkDays(userId: string | undefined, timezone: string | undefined) {
  return useQuery({
    queryKey: ['walk-days', userId],
    enabled: userId != null && timezone != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_scores')
        .select('local_date, tiers')
        .eq('user_id', userId!)
        .order('local_date', { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        localDate: row.local_date as string,
        // AGI gold is the 10,000-step baseline — see DAILY_STEP_BASELINE.
        clearedBaseline: (row.tiers as Record<string, string> | null)?.['AGI'] === 'gold',
      }));
    },
  });
}
```

60 days bounds the read; a streak longer than that renders as 60, which is a
number nobody will dispute.

- [ ] **Step 2: Build the card**

```tsx
// src/features/train/DailyWalkCard.tsx
import { StyleSheet, View } from 'react-native';
import { Label, Meter, Text } from '@/ui/index.ts';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import type { DailyWalk } from './daily-walk.ts';

/**
 * The flat 10,000-step baseline, named rather than left as the invisible edge of
 * a scoring band.
 *
 * The number never grows, which is the point — so the run of days is the only
 * thing that can, and the streak is what makes a fixed target still feel like
 * progress.
 */
export function DailyWalkCard({ walk }: { walk: DailyWalk }) {
  const streakLine =
    walk.streakDays > 1 ? `${walk.streakDays} days running` : null;

  return (
    // One element, one meaning. Every child is hidden explicitly rather than
    // trusting `accessible` to collapse them — it did not, on the 2026-08-14
    // build, and the row-of-separate-stops failure is what that cost.
    <View
      style={styles.card}
      accessible
      accessibilityLabel={[
        `Daily walk. ${walk.steps.toLocaleString()} of ${walk.baseline.toLocaleString()} steps`,
        walk.met ? 'cleared today' : null,
        streakLine,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.head}>
          <Label>Daily walk</Label>
          {streakLine != null && <Text scale="chrome" style={styles.streak}>{streakLine}</Text>}
        </View>

        <Text scale="fixed" style={styles.figure}>
          {walk.steps.toLocaleString()}
          <Text scale="fixed" style={styles.of}> / {walk.baseline.toLocaleString()}</Text>
        </Text>

        <Meter fraction={walk.fraction} color={ramp.sage[600]} height={9} />

        <Text style={styles.why}>
          10,000 steps is the public-health baseline — not a target that grows with you.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    marginTop: space.md,
    gap: space.xs,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streak: { ...font.body.strong, fontSize: 12, color: ramp.sage[800] },
  figure: { ...font.display.small, fontSize: 22, color: colors.text },
  of: { ...font.body.strong, fontSize: 14, color: ramp.neutral[600] },
  why: { ...font.body.body, fontSize: 12.5, color: ramp.neutral[700] },
});
```

- [ ] **Step 3: Place it on the home shelf**

In `app/(tabs)/index.tsx`, between `<TodayPanel …/>` and `<GoalCard …/>`:

```tsx
          {walk != null && <DailyWalkCard walk={walk} />}
```

with, alongside the other hooks:

```tsx
  const walkDays = useRecentWalkDays(session?.user.id, profile.data?.timezone);
  const walk =
    buckets.data?.totals != null && walkDays.data != null
      ? dailyWalkState({
          todaySteps: buckets.data.totals.steps,
          today: currentLocalDate(new Date(), profile.data!.timezone),
          days: walkDays.data,
        })
      : null;
```

Render nothing while either query is pending — same discipline as the standing
and detail lines already on this screen: nothing beats a confident zero.

- [ ] **Step 4: Design pass**

**REQUIRED:** run the `frontend-design` skill over the home shelf. Per
`CLAUDE.md`, a new component under `src/` gets a design pass so it lands as
intentional design rather than RN defaults. Home is already the densest screen in
the app — the card's weight relative to `TodayPanel` and `GoalCard` is the
question to answer.

- [ ] **Step 5: Verify on device, including large type and VoiceOver**

```bash
npm run ios
xcrun simctl ui booted content_size accessibility-extra-extra-extra-large
xcrun simctl io booted screenshot /tmp/walk-xxxl.png
xcrun simctl ui booted content_size medium
```

Then, in Xcode → Open Developer Tool → Accessibility Inspector targeting the
simulator: confirm the card is **one element** with a composed label, not five.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck && npm test`

```bash
git add src/features/train/DailyWalkCard.tsx 'app/(tabs)/index.tsx' src/features/character/queries.ts
git commit -m "feat: the Daily Walk card names the 10,000-step baseline"
```

---

## Task 5: The `workout_sessions` table

**Files:**
- Create: `supabase/migrations/20260815100000_workout_sessions.sql`
- Test: `supabase/tests/schema.test.ts`

**Interfaces:**
- Produces: `public.workout_sessions`, owner-select only, no client writes.

- [ ] **Step 1: Write the migration**

```sql
-- Workout sessions (2026-08-15).
--
-- The one genuinely new data need in solo mode: Run is pace-based, and pace is
-- not derivable from the hourly buckets. It is also the only reliable way to
-- tell a run from a walk at the data layer — both collapse into the same AGI
-- steps-and-distance signal today.
--
-- Not acquisition: read.ts has queried workouts for the anti-cheat cross-check
-- since Phase 3 and reduced each one to a per-hour boolean. This keeps the rest.
--
-- Owner-readable only and absent from every projection. A pace carries fitness,
-- and with distance it carries routine — at least as revealing as the hourly
-- movement §5 already protects. Nothing here reaches daily_scores: pace never
-- scores (see the spec's §3.1), so score replay never learns this table exists.
-- Same posture as daily_heart (deviation #24).

begin;

create table public.workout_sessions (
  user_id       uuid not null references public.profiles (id) on delete cascade,

  -- HealthKit's own sample UUID. The natural key: a re-synced window upserts
  -- rather than duplicating, and Apple revising a workout flows through the
  -- same way retroactive step revisions already do.
  hk_uuid       text not null,

  -- The user's OWN local date (§2), resolved client-side from the start
  -- instant. A UTC day boundary would file a Manila evening run under tomorrow.
  local_date    date not null,

  started_at    timestamptz not null,
  ended_at      timestamptz not null,

  -- Apple's HKWorkoutActivityType RAW VALUE, stored as the number it is.
  -- Deliberately not translated to a Kairo-side string: a translation table
  -- would silently drop every type it had not been taught, in a column whose
  -- entire purpose is telling activities apart. Which numbers mean something is
  -- a decision, and it lives in packages/kairo-core/src/challenge.ts.
  activity_type smallint not null,

  duration_s    integer not null check (duration_s >= 0),
  distance_m    numeric(10, 2) not null default 0 check (distance_m >= 0),
  active_kcal   numeric(10, 2) not null default 0 check (active_kcal >= 0),

  updated_at    timestamptz not null default now(),

  primary key (user_id, hk_uuid)
);

-- The engine reads "this user's qualifying sessions in a trailing window",
-- always by user and date.
create index workout_sessions_user_date on public.workout_sessions (user_id, local_date);

comment on table public.workout_sessions is
  'HealthKit workout sessions. Owner-readable only, service-role writes only (sync-health). Never scored — pace does not enter daily_scores — and absent from every projection.';

alter table public.workout_sessions enable row level security;

create policy workout_sessions_select_own on public.workout_sessions
  for select using (user_id = auth.uid());

-- `revoke all` then re-grant, not `revoke insert, update, delete`: Supabase's
-- default privileges grant ALL, and ALL includes TRUNCATE, which RLS does not
-- restrict.
revoke all on public.workout_sessions from anon;
revoke all on public.workout_sessions from authenticated;
grant select on public.workout_sessions to authenticated;

commit;
```

- [ ] **Step 2: Add the schema test**

In `supabase/tests/schema.test.ts`, following the existing owner-only patterns:

```ts
  it('lets a user read only their own workout sessions', async () => {
    await asService(`insert into public.workout_sessions
      (user_id, hk_uuid, local_date, started_at, ended_at, activity_type, duration_s, distance_m, active_kcal)
      values ('${USER_A}', 'uuid-a', '2026-08-15', now(), now(), 37, 1800, 5000, 300),
             ('${USER_B}', 'uuid-b', '2026-08-15', now(), now(), 37, 1800, 5000, 300)`);

    const rows = await asUser(USER_A, 'select hk_uuid from public.workout_sessions');
    expect(rows.map((r) => r.hk_uuid)).toEqual(['uuid-a']);
  });

  it('denies every client write to workout sessions', async () => {
    await expect(
      asUser(USER_A, `insert into public.workout_sessions
        (user_id, hk_uuid, local_date, started_at, ended_at, activity_type, duration_s)
        values ('${USER_A}', 'forged', '2026-08-15', now(), now(), 37, 1800)`),
    ).rejects.toThrow();

    await expect(
      asUser(USER_A, `update public.workout_sessions set distance_m = 99999`),
    ).rejects.toThrow();

    await expect(
      asUser(USER_A, `delete from public.workout_sessions`),
    ).rejects.toThrow();
  });
```

Match the helper names already used in that file (`asService` / `asUser` here are
illustrative — read the top of `schema.test.ts` and use whatever it defines).

- [ ] **Step 3: Run the schema suite**

Run: `npm run test:schema`
Expected: PASS. The suite applies every migration to PGlite in ~1.5s.

- [ ] **Step 4: Commit — but do not apply to the live project yet**

The migration is applied in Task 6, **together with** the `sync-health` redeploy
that writes to it. Applying one without the other is the exact failure that took
scoring down for two days in August 2026.

```bash
git add supabase/migrations/20260815100000_workout_sessions.sql supabase/tests/schema.test.ts
git commit -m "feat: workout_sessions table, owner-readable and never scored"
```

---

## Task 6: Ingest workout sessions

**Files:**
- Modify: `src/features/health/read.ts:64-69, 164-181`
- Modify: `supabase/functions/_shared/sync-plan.ts`
- Modify: `supabase/functions/sync-health/index.ts`
- Test: `supabase/functions/_shared/sync-plan.test.ts`

**Interfaces:**
- Produces: `HealthReadResult` gains `sessions: WorkoutSessionReading[]` where `WorkoutSessionReading = { hkUuid: string; localDate: string; startedAt: Date; endedAt: Date; activityType: number; durationS: number; distanceM: number; activeKcal: number }`. `SyncRequest` gains `sessions?: IncomingSession[]`.

- [ ] **Step 1: Keep the workout fields in `read.ts`**

Extend the result type:

```ts
export interface WorkoutSessionReading {
  hkUuid: string;
  localDate: string;
  startedAt: Date;
  endedAt: Date;
  /** HKWorkoutActivityType raw value. */
  activityType: number;
  durationS: number;
  distanceM: number;
  activeKcal: number;
}

export interface HealthReadResult {
  readings: HourlyReading[];
  sleep: Array<{ localDate: string; minutes: number }>;
  restingHeartRate: Array<{ localDate: string; bpm: number }>;
  sessions: WorkoutSessionReading[];
}
```

In the existing `for (const workout of workouts)` loop, **keep** the
`hourlySampleInstants` block exactly as it is — that is the anti-cheat path and
it must not change — and add alongside it:

```ts
    // The rest of the sample, kept rather than discarded. Everything here was
    // already in hand: this loop has been throwing away duration, distance,
    // energy and the activity type since Phase 3, the same waste deviation #24
    // found with heart rate.
    sessions.push({
      hkUuid: workout.uuid,
      localDate: currentLocalDate(workout.startDate, timeZone),
      startedAt: workout.startDate,
      endedAt: workout.endDate,
      activityType: workout.workoutActivityType as unknown as number,
      durationS: Math.round(finite(workout.duration?.quantity)),
      distanceM: finite(workout.totalDistance?.quantity),
      activeKcal: finite(workout.totalEnergyBurned?.quantity),
    });
```

Declare `const sessions: WorkoutSessionReading[] = [];` beside `readings`, and
add `sessions` to the returned object.

- [ ] **Step 2: Add the compile-time enum guard**

```ts
// src/features/health/activity-types.ts
/**
 * The one place Apple's HKWorkoutActivityType raw values are checked.
 *
 * `challenge.ts` in @kairo/core owns these numbers, because *which activities
 * count* is a rule and rules live there. But kairo-core is zero-dependency and
 * cannot import the library to verify itself — and neither can a test: anything
 * importing @kingstinct/react-native-healthkit pulls in React Native's Flow
 * syntax that root Vitest cannot parse. That is the same constraint that made
 * read-types.ts and sync-state.ts separate files.
 *
 * So the guard is a compile-time assertion. `import type` is erased, so nothing
 * Flow-flavoured reaches a bundler or a test runner, and `npm run typecheck`
 * still checks it. If Apple's values ever moved, typecheck fails rather than the
 * Strength challenge quietly matching nothing.
 */
import type { WorkoutActivityType } from '@kingstinct/react-native-healthkit';
import { RUN_ACTIVITY_TYPE, STRENGTH_ACTIVITY_TYPES } from '@kairo/core';

const _run: WorkoutActivityType.running = RUN_ACTIVITY_TYPE;

const _strength: readonly [
  WorkoutActivityType.functionalStrengthTraining,
  WorkoutActivityType.traditionalStrengthTraining,
  WorkoutActivityType.coreTraining,
] = STRENGTH_ACTIVITY_TYPES;

// Referenced so the compiler does not prune them as unused.
export const ACTIVITY_TYPES_CHECKED = [_run, ..._strength].length > 0;
```

This depends on Task 7 exporting those constants. If you are executing in order,
write this file in Task 7 instead — it will not typecheck until the constants
exist.

- [ ] **Step 3: Write the failing validation test**

Add to `supabase/functions/_shared/sync-plan.test.ts`:

```ts
  it('accepts a payload carrying workout sessions', () => {
    const result = validateSyncRequest({
      timezone: 'Asia/Manila',
      buckets: [],
      sessions: [
        {
          hkUuid: 'abc',
          localDate: '2026-08-15',
          startedAt: '2026-08-15T09:00:00.000Z',
          endedAt: '2026-08-15T09:30:00.000Z',
          activityType: 37,
          durationS: 1800,
          distanceM: 5000,
          activeKcal: 300,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a session with no HealthKit uuid', () => {
    const result = validateSyncRequest({
      timezone: 'Asia/Manila',
      buckets: [],
      sessions: [{ localDate: '2026-08-15', activityType: 37, durationS: 1800 }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a session batch above the ceiling', () => {
    const sessions = Array.from({ length: MAX_SESSIONS_PER_SYNC + 1 }, (_, i) => ({
      hkUuid: `u${i}`,
      localDate: '2026-08-15',
      startedAt: '2026-08-15T09:00:00.000Z',
      endedAt: '2026-08-15T09:30:00.000Z',
      activityType: 37,
      durationS: 1800,
      distanceM: 5000,
      activeKcal: 300,
    }));
    expect(validateSyncRequest({ timezone: 'Asia/Manila', buckets: [], sessions }).ok).toBe(false);
  });
```

- [ ] **Step 4: Run and confirm failure**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/sync-plan.test.ts`
Expected: FAIL — `MAX_SESSIONS_PER_SYNC` undefined, and the batch is accepted.

- [ ] **Step 5: Implement validation**

In `sync-plan.ts`, alongside `IncomingBucket`:

```ts
/** One HealthKit workout, as the client reports it. */
export interface IncomingSession {
  hkUuid: string;
  localDate: string;
  startedAt: string;
  endedAt: string;
  /** HKWorkoutActivityType raw value. */
  activityType: number;
  durationS: number;
  distanceM: number;
  activeKcal: number;
}

/**
 * Ceiling on sessions per request. A fortnight of a very active user is well
 * under this; it exists to bound what one request can cost, like
 * MAX_BUCKETS_PER_SYNC.
 */
export const MAX_SESSIONS_PER_SYNC = 200;
```

Add `sessions?: IncomingSession[]` to `SyncRequest`. Then add this helper beside
the bucket validator:

```ts
function validateSessions(raw: unknown): ValidationResult | IncomingSession[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'sessions must be an array' };
  }
  if (raw.length > MAX_SESSIONS_PER_SYNC) {
    return { ok: false, error: `too many sessions (max ${MAX_SESSIONS_PER_SYNC})` };
  }

  const sessions: IncomingSession[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, error: 'each session must be an object' };
    }
    const s = entry as Record<string, unknown>;

    // The uuid is the idempotency key. Without it a re-sync duplicates every
    // workout, so this is the one field with no tolerant fallback.
    if (typeof s['hkUuid'] !== 'string' || s['hkUuid'].length === 0) {
      return { ok: false, error: 'session hkUuid is required' };
    }
    if (typeof s['localDate'] !== 'string' || !DATE_PATTERN.test(s['localDate'])) {
      return { ok: false, error: 'session localDate must be YYYY-MM-DD' };
    }
    if (typeof s['startedAt'] !== 'string' || typeof s['endedAt'] !== 'string') {
      return { ok: false, error: 'session timestamps are required' };
    }
    if (!Number.isInteger(s['activityType'])) {
      return { ok: false, error: 'session activityType must be an integer' };
    }

    const num = (key: string): number | null => {
      const value = s[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
      return value;
    };

    const durationS = num('durationS');
    const distanceM = num('distanceM') ?? 0;
    const activeKcal = num('activeKcal') ?? 0;
    if (durationS === null) {
      return { ok: false, error: 'session durationS must be a non-negative number' };
    }

    sessions.push({
      hkUuid: s['hkUuid'],
      localDate: s['localDate'],
      startedAt: s['startedAt'],
      endedAt: s['endedAt'],
      activityType: s['activityType'] as number,
      durationS,
      // Distance and energy are genuinely optional — HealthKit omits them for
      // workout types that have none, and a strength session with no distance
      // is normal rather than malformed.
      distanceM,
      activeKcal,
    });
  }

  return sessions;
}
```

And call it inside `validateSyncRequest`, before the success return:

```ts
  const sessions = validateSessions(raw['sessions']);
  if (!Array.isArray(sessions)) return sessions;
```

then include `sessions` in the returned `value`.

- [ ] **Step 6: Run and confirm the tests pass**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/sync-plan.test.ts`
Expected: PASS.

- [ ] **Step 7: Upsert in the handler**

In `supabase/functions/sync-health/index.ts`, after the bucket upsert:

```ts
  if (body.sessions && body.sessions.length > 0) {
    const { error: sessionError } = await admin
      .from('workout_sessions')
      .upsert(
        body.sessions.map((s) => ({
          user_id: userId,
          hk_uuid: s.hkUuid,
          local_date: s.localDate,
          started_at: s.startedAt,
          ended_at: s.endedAt,
          activity_type: s.activityType,
          duration_s: s.durationS,
          distance_m: s.distanceM,
          active_kcal: s.activeKcal,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'user_id,hk_uuid' },
      );
    if (sessionError) throw sessionError;
  }
```

Sessions do **not** trigger a rescore — pace never enters `daily_scores`. Leave
the existing bucket→rescore path exactly as it is.

- [ ] **Step 8: Send them from the client**

In `src/features/health/sync.ts`, add `sessions` to the request body, mapping
`startedAt`/`endedAt` to ISO strings.

- [ ] **Step 9: Apply the migration and redeploy, together**

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260815100000_workout_sessions.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version) values ('20260815100000')"
supabase functions deploy sync-health --project-ref zniopywbwenrzxezolwv
node supabase/scripts/smoke-sync.mjs
```

Expected: the smoke test passes. **This is the guard that matters** — the test
suite checks the source, not the deployed artifact, and every test passed
throughout the two-day outage in August 2026.

- [ ] **Step 10: Commit**

```bash
git add src/features/health/read.ts src/features/health/sync.ts supabase/functions/_shared/sync-plan.ts supabase/functions/_shared/sync-plan.test.ts supabase/functions/sync-health/index.ts
git commit -m "feat: persist HealthKit workout sessions

read.ts has queried workouts for the anti-cheat cross-check since Phase
3 and kept only a per-hour boolean. Everything else was already in hand.
Keyed on the HealthKit sample uuid, so a re-synced window upserts."
```

---

## Task 7: The Challenges engine

The core of the feature, and the piece where a bug corrupts real user progression
— so strict TDD.

**Files:**
- Create: `packages/kairo-core/src/challenge.ts`
- Test: `packages/kairo-core/src/challenge.test.ts`
- Modify: `packages/kairo-core/src/index.ts`
- Create: `src/features/health/activity-types.ts` (if not done in Task 6)

**Interfaces:**
- Produces, all exported from `@kairo/core`:
  - `ChallengeArea = 'run' | 'strength'`
  - `WorkoutSession = { localDate: string; activityType: number; durationS: number; distanceM: number; activeKcal: number }`
  - `Challenge` — the four-variant union below
  - `resolveChallenge(area, sessions, before): Challenge`
  - `challengeMet(challenge, session): boolean`
  - `clearingSession(challenge, sessions, localDate): WorkoutSession | null`
  - `CHALLENGE_WINDOW_DAYS = 90`, `CHALLENGE_BASELINE_SESSIONS = 5`, `CHALLENGE_STEP = 0.03`, `RUN_MIN_DISTANCE_M = 1000`, `CHALLENGE_COMPLETION_XP = 40`, `RUN_ACTIVITY_TYPE = 37`, `STRENGTH_ACTIVITY_TYPES = [20, 50, 59]`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/kairo-core/src/challenge.test.ts
import { describe, expect, it } from 'vitest';
import {
  challengeMet,
  clearingSession,
  resolveChallenge,
  RUN_ACTIVITY_TYPE,
  STRENGTH_ACTIVITY_TYPES,
  type WorkoutSession,
} from './challenge.ts';

const run = (
  localDate: string,
  distanceM: number,
  durationS: number,
): WorkoutSession => ({
  localDate,
  activityType: RUN_ACTIVITY_TYPE,
  distanceM,
  durationS,
  activeKcal: 0,
});

const lift = (localDate: string, activeKcal: number): WorkoutSession => ({
  localDate,
  activityType: STRENGTH_ACTIVITY_TYPES[0]!,
  distanceM: 0,
  durationS: 1800,
  activeKcal,
});

describe('resolveChallenge — cold start', () => {
  it('asks a new runner only to log one run, with no pace bar', () => {
    const c = resolveChallenge('run', [], '2026-08-15');
    expect(c).toEqual({ area: 'run', kind: 'establish', minDistanceM: 1000 });
  });

  it('asks a new lifter only to log one session', () => {
    expect(resolveChallenge('strength', [], '2026-08-15')).toEqual({
      area: 'strength',
      kind: 'establish',
    });
  });

  it('ignores runs too short to qualify when deciding cold start', () => {
    // 800m is under RUN_MIN_DISTANCE_M, so it establishes nothing.
    const c = resolveChallenge('run', [run('2026-08-10', 800, 300)], '2026-08-15');
    expect(c.kind).toBe('establish');
  });
});

describe('resolveChallenge — the strictly-before rule', () => {
  it('excludes sessions on the day being resolved', () => {
    // Without this the run being judged moves the median that judges it.
    const sessions = [run('2026-08-15', 5000, 1500)];
    expect(resolveChallenge('run', sessions, '2026-08-15').kind).toBe('establish');
  });

  it('excludes sessions after the day being resolved', () => {
    const sessions = [run('2026-08-20', 5000, 1500)];
    expect(resolveChallenge('run', sessions, '2026-08-15').kind).toBe('establish');
  });

  it('excludes sessions older than the window', () => {
    // 2026-01-01 is well over CHALLENGE_WINDOW_DAYS before.
    const sessions = [run('2026-01-01', 5000, 1500)];
    expect(resolveChallenge('run', sessions, '2026-08-15').kind).toBe('establish');
  });
});

describe('resolveChallenge — run targets', () => {
  it('sets a pace 3% faster than the median', () => {
    // Five runs at exactly 300 s/km (5km in 1500s).
    const sessions = [
      run('2026-08-10', 5000, 1500),
      run('2026-08-11', 5000, 1500),
      run('2026-08-12', 5000, 1500),
      run('2026-08-13', 5000, 1500),
      run('2026-08-14', 5000, 1500),
    ];
    const c = resolveChallenge('run', sessions, '2026-08-15');
    expect(c).toMatchObject({ area: 'run', kind: 'target' });
    if (c.kind !== 'target') throw new Error('unreachable');
    expect(c.paceSecPerKm).toBe(291); // 300 * 0.97
    expect(c.minDistanceM).toBe(5000);
  });

  it('is not ratcheted by a single exceptional run', () => {
    // Four ordinary runs and one blistering one. The median must ignore it.
    const sessions = [
      run('2026-08-10', 5000, 1500),
      run('2026-08-11', 5000, 1500),
      run('2026-08-12', 5000, 750), // twice as fast
      run('2026-08-13', 5000, 1500),
      run('2026-08-14', 5000, 1500),
    ];
    const c = resolveChallenge('run', sessions, '2026-08-15');
    if (c.kind !== 'target') throw new Error('unreachable');
    expect(c.paceSecPerKm).toBe(291);
  });

  it('eases after a slower stretch rather than holding the old target', () => {
    const sessions = [
      run('2026-08-10', 5000, 2000),
      run('2026-08-11', 5000, 2000),
      run('2026-08-12', 5000, 2000),
    ];
    const c = resolveChallenge('run', sessions, '2026-08-15');
    if (c.kind !== 'target') throw new Error('unreachable');
    // 400 s/km median, 3% faster = 388. Higher (slower) than the 291 above,
    // which is the whole point: a bad stretch must not make the app harder.
    expect(c.paceSecPerKm).toBe(388);
  });

  it('uses however many qualifying runs exist, below five', () => {
    const sessions = [run('2026-08-13', 5000, 1500), run('2026-08-14', 5000, 1500)];
    const c = resolveChallenge('run', sessions, '2026-08-15');
    expect(c.kind).toBe('target');
  });

  it('floors the distance at the run minimum for a short-distance runner', () => {
    const sessions = [run('2026-08-13', 1200, 400), run('2026-08-14', 1200, 400)];
    const c = resolveChallenge('run', sessions, '2026-08-15');
    if (c.kind !== 'target') throw new Error('unreachable');
    // Median 1200 rounds down to 1000 at 500m granularity, and clamps there.
    expect(c.minDistanceM).toBe(1000);
  });
});

describe('resolveChallenge — strength targets', () => {
  it('sets calories 3% above the median, rounded to five', () => {
    const sessions = [lift('2026-08-13', 300), lift('2026-08-14', 300)];
    const c = resolveChallenge('strength', sessions, '2026-08-15');
    // 300 * 1.03 = 309 -> 310
    expect(c).toEqual({ area: 'strength', kind: 'target', activeKcal: 310 });
  });

  it('ignores a run when resolving a strength challenge', () => {
    const c = resolveChallenge('strength', [run('2026-08-14', 5000, 1500)], '2026-08-15');
    expect(c.kind).toBe('establish');
  });
});

describe('challengeMet', () => {
  it('needs both distance and pace for a run target', () => {
    const c = { area: 'run', kind: 'target', minDistanceM: 5000, paceSecPerKm: 291 } as const;
    expect(challengeMet(c, run('2026-08-15', 5000, 1400))).toBe(true);
    expect(challengeMet(c, run('2026-08-15', 5000, 1600))).toBe(false); // too slow
    expect(challengeMet(c, run('2026-08-15', 2000, 400))).toBe(false); // fast, too short
  });

  it('needs only the distance for an establish run', () => {
    const c = { area: 'run', kind: 'establish', minDistanceM: 1000 } as const;
    expect(challengeMet(c, run('2026-08-15', 1200, 9999))).toBe(true);
    expect(challengeMet(c, run('2026-08-15', 800, 100))).toBe(false);
  });

  it('needs the calorie bar for a strength target', () => {
    const c = { area: 'strength', kind: 'target', activeKcal: 310 } as const;
    expect(challengeMet(c, lift('2026-08-15', 320))).toBe(true);
    expect(challengeMet(c, lift('2026-08-15', 300))).toBe(false);
  });

  it('does not let a run satisfy a strength challenge', () => {
    const c = { area: 'strength', kind: 'establish' } as const;
    expect(challengeMet(c, run('2026-08-15', 5000, 1500))).toBe(false);
  });
});

describe('clearingSession', () => {
  it('finds the session on the day that cleared the bar', () => {
    const c = { area: 'run', kind: 'establish', minDistanceM: 1000 } as const;
    const sessions = [run('2026-08-14', 5000, 1500), run('2026-08-15', 2000, 700)];
    expect(clearingSession(c, sessions, '2026-08-15')?.distanceM).toBe(2000);
  });

  it('returns null when nothing that day cleared it', () => {
    const c = { area: 'run', kind: 'target', minDistanceM: 5000, paceSecPerKm: 200 } as const;
    expect(clearingSession(c, [run('2026-08-15', 5000, 1500)], '2026-08-15')).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test:core -- --run src/challenge.test.ts`
Expected: FAIL — cannot resolve `./challenge.ts`.

- [ ] **Step 3: Implement**

```ts
// packages/kairo-core/src/challenge.ts
/**
 * Challenges — the adaptive solo mechanic (assessment Part 2 §11).
 *
 * **Not a Goal, on purpose.** §8's Goal invariant — fixed at creation, because
 * changing a target mid-window would silently re-grade every day already
 * counted — is deliberate and stays true for user-authored Goals. A Challenge's
 * target moves *as the user moves*, which breaks that invariant by design. So
 * this is a sibling of `goal.ts`, never a `GoalKind`.
 *
 * **Derived, never stored.** The challenge for a day is a pure function of
 * qualifying sessions *strictly before* that day. That does three things at
 * once: the session being judged cannot move its own bar; retroactive HealthKit
 * revisions flow through for free (the property deviation #18 bought for goal
 * progress); and "ease after a bad stretch" needs no separate rule, because a
 * quiet stretch simply lowers the trailing median.
 *
 * Pure, like everything here: no I/O, no clock reads. `before` is an argument.
 */

export type ChallengeArea = 'run' | 'strength';

/** One workout, as `workout_sessions` stores it. */
export interface WorkoutSession {
  localDate: string;
  /** HKWorkoutActivityType raw value — see src/features/health/activity-types.ts. */
  activityType: number;
  durationS: number;
  distanceM: number;
  activeKcal: number;
}

export type Challenge =
  | { area: 'run'; kind: 'establish'; minDistanceM: number }
  | { area: 'run'; kind: 'target'; minDistanceM: number; paceSecPerKm: number }
  | { area: 'strength'; kind: 'establish' }
  | { area: 'strength'; kind: 'target'; activeKcal: number };

/**
 * Apple's HKWorkoutActivityType raw values. Stable ABI, documented by Apple.
 *
 * They live here, not in the app, because *which activities count* is a rule and
 * rules live in core. Verified against the library's own enum by a compile-time
 * assertion in `src/features/health/activity-types.ts` — no test can import that
 * library (Flow syntax, root Vitest), so the check is `tsc`'s.
 */
export const RUN_ACTIVITY_TYPE = 37 as const;
export const STRENGTH_ACTIVITY_TYPES = [20, 50, 59] as const;

/** How far back a baseline may reach. */
export const CHALLENGE_WINDOW_DAYS = 90;
/** At most this many recent sessions form the baseline — fewer is fine. */
export const CHALLENGE_BASELINE_SESSIONS = 5;
/** Progressive overload, per cleared step. Deliberately small: it compounds. */
export const CHALLENGE_STEP = 0.03;
/** A run shorter than this tells us nothing about pace. */
export const RUN_MIN_DISTANCE_M = 1_000;
/**
 * Flat, and about a fifth of a strong day (MAX_REALISTIC_DAILY_XP is 200) — a
 * real nudge that cannot substitute for showing up, the same posture
 * `goalCompletionXp`'s cap takes.
 */
export const CHALLENGE_COMPLETION_XP = 40;

function utcOf(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / 86_400_000);
}

/** Ordinary median: the mean of the two middle values on an even count. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function isRun(session: WorkoutSession): boolean {
  return (
    session.activityType === RUN_ACTIVITY_TYPE &&
    session.distanceM >= RUN_MIN_DISTANCE_M &&
    session.durationS > 0
  );
}

function isStrength(session: WorkoutSession): boolean {
  return (
    (STRENGTH_ACTIVITY_TYPES as readonly number[]).includes(session.activityType) &&
    session.activeKcal > 0
  );
}

function qualifies(area: ChallengeArea, session: WorkoutSession): boolean {
  return area === 'run' ? isRun(session) : isStrength(session);
}

function paceSecPerKm(session: WorkoutSession): number {
  return session.durationS / (session.distanceM / 1000);
}

/**
 * The sessions a baseline is built from: qualifying, strictly before `before`,
 * inside the window, most recent first, at most CHALLENGE_BASELINE_SESSIONS.
 */
function baselineSessions(
  area: ChallengeArea,
  sessions: readonly WorkoutSession[],
  before: string,
): WorkoutSession[] {
  return sessions
    .filter((s) => {
      if (!qualifies(area, s)) return false;
      // Strictly before: `>=` would let the day being judged set its own bar.
      if (s.localDate >= before) return false;
      return daysBetween(s.localDate, before) <= CHALLENGE_WINDOW_DAYS;
    })
    .sort((a, b) => (a.localDate < b.localDate ? 1 : -1))
    .slice(0, CHALLENGE_BASELINE_SESSIONS);
}

export function resolveChallenge(
  area: ChallengeArea,
  sessions: readonly WorkoutSession[],
  before: string,
): Challenge {
  const recent = baselineSessions(area, sessions, before);

  // Nothing to build on. The first challenge's job is to *establish* a
  // baseline, not to test the user, so it is impossible to fail on fitness.
  if (recent.length === 0) {
    return area === 'run'
      ? { area: 'run', kind: 'establish', minDistanceM: RUN_MIN_DISTANCE_M }
      : { area: 'strength', kind: 'establish' };
  }

  if (area === 'strength') {
    const base = median(recent.map((s) => s.activeKcal));
    return {
      area: 'strength',
      kind: 'target',
      // Rounded to five, because "313 calories" reads as a machine talking.
      activeKcal: Math.round((base * (1 + CHALLENGE_STEP)) / 5) * 5,
    };
  }

  const base = median(recent.map(paceSecPerKm));
  const medianDistance = median(recent.map((s) => s.distanceM));

  return {
    area: 'run',
    kind: 'target',
    // The floor rises with the user, so it does not become meaningless at 10km
    // — but it never drops below the distance that makes pace mean anything.
    minDistanceM: Math.max(
      RUN_MIN_DISTANCE_M,
      Math.floor(medianDistance / 500) * 500,
    ),
    // Lower is faster, so overload *subtracts*.
    paceSecPerKm: Math.round(base * (1 - CHALLENGE_STEP)),
  };
}

export function challengeMet(challenge: Challenge, session: WorkoutSession): boolean {
  if (challenge.area === 'run') {
    if (!isRun(session)) return false;
    if (session.distanceM < challenge.minDistanceM) return false;
    if (challenge.kind === 'establish') return true;
    return paceSecPerKm(session) <= challenge.paceSecPerKm;
  }

  if (!isStrength(session)) return false;
  if (challenge.kind === 'establish') return true;
  return session.activeKcal >= challenge.activeKcal;
}

/** The session on `localDate` that cleared the challenge, or null. */
export function clearingSession(
  challenge: Challenge,
  sessions: readonly WorkoutSession[],
  localDate: string,
): WorkoutSession | null {
  return (
    sessions.find((s) => s.localDate === localDate && challengeMet(challenge, s)) ??
    null
  );
}
```

- [ ] **Step 4: Export from the package**

Add to `packages/kairo-core/src/index.ts`, after `export * from './goal.ts';`:

```ts
export * from './challenge.ts';
```

- [ ] **Step 5: Run and confirm the tests pass**

Run: `npm run test:core -- --run src/challenge.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the compile-time enum guard**

Create `src/features/health/activity-types.ts` exactly as given in Task 6 Step 2
(if it was skipped there).

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck && npm run test:core`

```bash
git add packages/kairo-core/src/challenge.ts packages/kairo-core/src/challenge.test.ts packages/kairo-core/src/index.ts src/features/health/activity-types.ts
git commit -m "feat: the Challenges engine — derived targets, gentle overload

The target for a day is a pure function of sessions strictly before it,
so the run being judged cannot move its own bar, revisions flow through
for free, and easing needs no separate rule. Median over the last five,
not mean, so one exceptional session cannot ratchet the app harder."
```

---

## Task 8: `challenge_completions`, opt-in columns, and the XP rollup

**Files:**
- Create: `supabase/migrations/20260815110000_challenges.sql`
- Test: `supabase/tests/schema.test.ts`

**Interfaces:**
- Produces: `public.challenge_completions`; `profiles.trains_run` and `profiles.trains_strength` (both `not null default false`); `recalculate_user_xp` summing three sources.

- [ ] **Step 1: Read the existing grant list first**

The `profiles` column grant must be re-issued in full, and getting it wrong fails
**open**, not closed:

```bash
./supabase/scripts/remote-sql.sh "select string_agg(column_name, ', ') from information_schema.column_privileges where table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE'"
```

Note the exact list. The migration below re-grants it plus the two new columns.

- [ ] **Step 2: Write the migration**

```sql
-- Challenges: completions, opt-in, and the third XP source (2026-08-15).

begin;

-- ---------------------------------------------------------------------------
-- Opt-in
-- ---------------------------------------------------------------------------
-- Both default false. A non-runner must never see a permanently unmet Run
-- card, and the day they start running they turn it on themselves.
alter table public.profiles
  add column trains_run boolean not null default false,
  add column trains_strength boolean not null default false;

comment on column public.profiles.trains_run is
  'Whether the user is training Run. Off by default; set from the /train route.';

-- The table-level revoke MUST precede the column grant. A column-level REVOKE
-- against an existing table-level GRANT is silently a no-op in Postgres, so
-- skipping this leaves UPDATE open on every column.
revoke update on public.profiles from authenticated;
-- Re-granted in full: the pre-existing list from Step 1, plus the two new
-- columns. Verify against that query's output before applying.
grant update (
  character_name, character_body, timezone, height_cm, weight_kg, birth_year,
  has_wearable, trains_run, trains_strength
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Completions — a one-way latch, the goal_completions pattern (deviation #19)
-- ---------------------------------------------------------------------------
create table public.challenge_completions (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  area        text not null check (area in ('run', 'strength')),
  local_date  date not null,

  -- The target as it stood. Snapshotted because it is the answer to "what did I
  -- clear in March", and the trailing median can no longer produce it.
  target      jsonb not null,

  -- No DEFAULT on purpose: CHALLENGE_COMPLETION_XP in @kairo/core is the single
  -- source, and a default here would be a second copy that could drift.
  xp_awarded  integer not null check (xp_awarded >= 0),

  created_at  timestamptz not null default now(),

  -- One clear per area per local day. Two qualifying sessions on one day clear
  -- the same challenge once — the next day's is already harder, because both
  -- sessions moved the median.
  primary key (user_id, area, local_date)
);

comment on table public.challenge_completions is
  'One-way latch, service-role writes only. A later downward revision from Apple never revokes a completion — the rule §19 already applies to streak milestones.';

alter table public.challenge_completions enable row level security;

create policy challenge_completions_select_own on public.challenge_completions
  for select using (user_id = auth.uid());

revoke all on public.challenge_completions from anon;
revoke all on public.challenge_completions from authenticated;
grant select on public.challenge_completions to authenticated;

-- ---------------------------------------------------------------------------
-- XP rollup — a third source
-- ---------------------------------------------------------------------------
-- Safe for the reason the second source was safe: this is a FULL RECOMPUTE,
-- never an increment, so re-syncs, revisions and cron retries stay idempotent.
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
       + coalesce((select sum(xp_awarded) from public.challenge_completions
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

-- Mirrors goal_completions_xp_rollup exactly.
--
-- It needs no deletion guard, for a non-obvious reason: during a profile cascade
-- delete the profiles row is already gone by the time the cascade reaches this
-- table, so the UPDATE's `where id = p_user_id` matches nothing and is a no-op.
-- What WOULD abort the statement is reaching a completion from a BEFORE DELETE
-- trigger — which is exactly why profiles_collect_orphaned_goals must stay
-- AFTER. Do not add a BEFORE trigger that touches this table.
create or replace function public.challenge_completions_xp_rollup()
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

create trigger challenge_completions_xp_rollup_trigger
after insert or update or delete on public.challenge_completions
for each row execute function public.challenge_completions_xp_rollup();

commit;
```

- [ ] **Step 3: Add schema tests**

```ts
  it('rolls challenge XP into the profile total alongside days and goals', async () => {
    await asService(`insert into public.challenge_completions
      (user_id, area, local_date, target, xp_awarded)
      values ('${USER_A}', 'run', '2026-08-15', '{"kind":"establish"}'::jsonb, 40)`);

    const [profile] = await asService(
      `select total_xp from public.profiles where id = '${USER_A}'`,
    );
    // Whatever the day/goal sources contributed, plus 40.
    expect(profile.total_xp).toBeGreaterThanOrEqual(40);
  });

  it('latches a completion once per area per day', async () => {
    await asService(`insert into public.challenge_completions
      (user_id, area, local_date, target, xp_awarded)
      values ('${USER_A}', 'strength', '2026-08-16', '{}'::jsonb, 40)
      on conflict do nothing`);
    await asService(`insert into public.challenge_completions
      (user_id, area, local_date, target, xp_awarded)
      values ('${USER_A}', 'strength', '2026-08-16', '{}'::jsonb, 40)
      on conflict do nothing`);

    const rows = await asService(
      `select count(*)::int as n from public.challenge_completions
       where user_id = '${USER_A}' and area = 'strength' and local_date = '2026-08-16'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it('denies client writes to challenge completions', async () => {
    await expect(
      asUser(USER_A, `insert into public.challenge_completions
        (user_id, area, local_date, target, xp_awarded)
        values ('${USER_A}', 'run', '2026-08-17', '{}'::jsonb, 9999)`),
    ).rejects.toThrow();
  });

  it('lets a user opt into an area but not edit their own XP', async () => {
    await asUser(USER_A, `update public.profiles set trains_run = true where id = '${USER_A}'`);
    await expect(
      asUser(USER_A, `update public.profiles set total_xp = 999999 where id = '${USER_A}'`),
    ).rejects.toThrow();
  });
```

The last test is the one that catches a botched grant list — it is the failure
that fails open.

- [ ] **Step 4: Run the schema suite**

Run: `npm run test:schema`
Expected: PASS.

- [ ] **Step 5: Commit, and hold the live apply for Task 9**

This migration is applied together with the `finalize-days` redeploy that writes
to it.

```bash
git add supabase/migrations/20260815110000_challenges.sql supabase/tests/schema.test.ts
git commit -m "feat: challenge_completions, opt-in columns and a third XP source"
```

---

## Task 9: The finalize-days challenge pass

**Files:**
- Create: `supabase/functions/_shared/challenge-plan.ts`
- Test: `supabase/functions/_shared/challenge-plan.test.ts`
- Modify: `supabase/functions/finalize-days/index.ts`
- Modify: `packages/kairo-core/src/notifications.ts:15-19`
- Modify: `supabase/functions/_shared/notification-copy.ts`

**Interfaces:**
- Consumes: `resolveChallenge`, `clearingSession`, `CHALLENGE_COMPLETION_XP` from `@kairo/core` via `_shared/core.ts`.
- Produces: `planChallengeCompletions(input): ChallengeCompletion[]` where `ChallengeCompletion = { row: { user_id: string; area: ChallengeArea; local_date: string; target: Challenge; xp_awarded: number }; area: ChallengeArea }`.

- [ ] **Step 1: Add the notification trigger**

In `packages/kairo-core/src/notifications.ts`:

```ts
export type NotificationTrigger =
  | 'day_ending_soon'
  | 'day_ends'
  | 'day_starts'
  | 'goal_completed'
  | 'challenge_cleared';
```

Leave both exemption lists untouched, and add to `BUDGET_EXEMPT`'s docstring:

```
 * `challenge_cleared` deliberately does NOT qualify: a challenge clears
 * repeatedly by design, which is exactly the "recurring nudge would not
 * qualify" case this comment already draws. It is budget-counted, and — like
 * `goal_completed` — not quiet-hours exempt, because finalization runs about
 * two hours after local midnight.
```

Run `npm run test:core -- --run src/notifications.test.ts` and fix any
exhaustiveness failure the new member causes.

- [ ] **Step 2: Write the failing planner test**

```ts
// supabase/functions/_shared/challenge-plan.test.ts
import { describe, expect, it } from 'vitest';
import { planChallengeCompletions } from './challenge-plan.ts';
import { RUN_ACTIVITY_TYPE } from './core.ts';

const run = (localDate: string, distanceM: number, durationS: number) => ({
  localDate,
  activityType: RUN_ACTIVITY_TYPE,
  distanceM,
  durationS,
  activeKcal: 0,
});

describe('planChallengeCompletions', () => {
  it('latches an establish run on the day it happened', () => {
    const out = planChallengeCompletions({
      userId: 'u1',
      localDate: '2026-08-15',
      areas: ['run'],
      sessions: [run('2026-08-15', 2000, 700)],
      alreadyCompleted: new Set(),
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.row).toMatchObject({
      user_id: 'u1',
      area: 'run',
      local_date: '2026-08-15',
      xp_awarded: 40,
    });
  });

  it('emits nothing on a re-run', () => {
    const out = planChallengeCompletions({
      userId: 'u1',
      localDate: '2026-08-15',
      areas: ['run'],
      sessions: [run('2026-08-15', 2000, 700)],
      alreadyCompleted: new Set(['run']),
    });
    expect(out).toEqual([]);
  });

  it('skips an area the user has not opted into', () => {
    const out = planChallengeCompletions({
      userId: 'u1',
      localDate: '2026-08-15',
      areas: [],
      sessions: [run('2026-08-15', 2000, 700)],
      alreadyCompleted: new Set(),
    });
    expect(out).toEqual([]);
  });

  it('emits nothing when the day had no clearing session', () => {
    const out = planChallengeCompletions({
      userId: 'u1',
      localDate: '2026-08-15',
      areas: ['run'],
      sessions: [run('2026-08-15', 400, 120)], // under the 1km minimum
      alreadyCompleted: new Set(),
    });
    expect(out).toEqual([]);
  });

  it('judges the day against a bar set before it', () => {
    // Five 300 s/km runs before, so the target is 291. A 295 s/km run misses.
    const history = ['10', '11', '12', '13', '14'].map((d) =>
      run(`2026-08-${d}`, 5000, 1500),
    );
    const out = planChallengeCompletions({
      userId: 'u1',
      localDate: '2026-08-15',
      areas: ['run'],
      sessions: [...history, run('2026-08-15', 5000, 1475)],
      alreadyCompleted: new Set(),
    });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 3: Run and confirm failure**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/challenge-plan.test.ts`
Expected: FAIL — cannot resolve `./challenge-plan.ts`.

- [ ] **Step 4: Implement**

```ts
// supabase/functions/_shared/challenge-plan.ts
import {
  CHALLENGE_COMPLETION_XP,
  clearingSession,
  resolveChallenge,
  type Challenge,
  type ChallengeArea,
  type WorkoutSession,
} from './core.ts';

/**
 * The decision half of the challenge pass in `finalize-days`, kept free of I/O
 * so it can be tested in plain Node with no Deno, no Docker and no database.
 *
 * Nothing here resolves a challenge itself — `resolveChallenge()` in
 * `@kairo/core` is the single implementation, shared verbatim with the client so
 * the target the user was shown is the target they are judged against.
 */

export interface ChallengeCompletionRow {
  user_id: string;
  area: ChallengeArea;
  local_date: string;
  target: Challenge;
  xp_awarded: number;
}

export interface ChallengeCompletion {
  row: ChallengeCompletionRow;
  /** Carried so the handler can build notification copy without re-reading. */
  area: ChallengeArea;
}

export function planChallengeCompletions(input: {
  userId: string;
  localDate: string;
  /** Areas the user has opted into. */
  areas: readonly ChallengeArea[];
  /** This user's sessions inside the trailing window, plus the day itself. */
  sessions: readonly WorkoutSession[];
  /** Areas already latched for this day. */
  alreadyCompleted: ReadonlySet<string>;
}): ChallengeCompletion[] {
  const completions: ChallengeCompletion[] = [];

  for (const area of input.areas) {
    if (input.alreadyCompleted.has(area)) continue;

    // Resolved as of the day being finalized, so the day's own sessions cannot
    // move the bar they are judged against.
    const challenge = resolveChallenge(area, input.sessions, input.localDate);
    const cleared = clearingSession(challenge, input.sessions, input.localDate);
    if (cleared === null) continue;

    completions.push({
      area,
      row: {
        user_id: input.userId,
        area,
        local_date: input.localDate,
        target: challenge,
        xp_awarded: CHALLENGE_COMPLETION_XP,
      },
    });
  }

  return completions;
}
```

- [ ] **Step 5: Run and confirm the tests pass**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/challenge-plan.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire the handler**

In `supabase/functions/finalize-days/index.ts`, beside the existing goal pass,
for each user-day being finalized:

1. Read `trains_run`/`trains_strength` from `profiles` to build `areas`.
2. If `areas` is empty, skip — no reads, no work.
3. Read that user's `workout_sessions` where `local_date` is within
   `CHALLENGE_WINDOW_DAYS` before, through `local_date` inclusive.
4. Read already-latched areas for the day from `challenge_completions`.
5. Call `planChallengeCompletions`.
6. Insert the rows with `on conflict do nothing` — the database is what makes a
   double-latch impossible under overlapping cron runs; the `alreadyCompleted`
   set is the cheap filter, not the guarantee.
7. Emit a `challenge_cleared` notification candidate per completion, with
   payload `{ trigger: 'challenge_cleared', localDate, screen: 'train' }`.

Follow the goal pass's structure exactly — it already does all seven for goals.

- [ ] **Step 7: Add the notification copy**

In `supabase/functions/_shared/notification-copy.ts`, add a `challenge_cleared`
case following the existing shape, and update its test. Copy should name the area
and not a number: *"Run challenge cleared."* / *"Strength challenge cleared."*

- [ ] **Step 8: Route the deep link**

In `src/features/notifications/routing.ts`, map `screen: 'train'` to `/train`.
**Note the existing landmine beside it:** `screen: 'character'` maps to `/`, not
`/character`, because `/character` is the onboarding body picker. Add a test to
`routing.test.ts` for the new mapping.

- [ ] **Step 9: Apply the migration and redeploy, together**

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260815110000_challenges.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version) values ('20260815110000')"
supabase functions deploy finalize-days --project-ref zniopywbwenrzxezolwv
```

Verify the grant did not fail open:

```bash
./supabase/scripts/remote-sql.sh "select string_agg(column_name, ', ') from information_schema.column_privileges where table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE'"
```

Expected: exactly the Step 1 list plus `trains_run` and `trains_strength`. If it
lists every column, the table-level revoke did not run and UPDATE is open —
fix before continuing.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/_shared/challenge-plan.ts supabase/functions/_shared/challenge-plan.test.ts supabase/functions/finalize-days/index.ts supabase/functions/_shared/notification-copy.ts packages/kairo-core/src/notifications.ts src/features/notifications/routing.ts
git commit -m "feat: finalize-days latches challenge completions and notifies"
```

---

## Task 10: The `/train` route

**Files:**
- Create: `app/train.tsx`
- Create: `src/features/train/queries.ts`
- Create: `src/features/train/ChallengeCard.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `resolveChallenge` from `@kairo/core`; `workout_sessions` and `profiles.trains_*` via new queries.

- [ ] **Step 1: Design pass first**

**REQUIRED, and before writing the screen:** run the `frontend-design` skill for
`/train`. This is a new screen carrying an area picker, two challenge cards and
recent clears — per `CLAUDE.md` it gets a design pass so it lands as intentional
design rather than RN defaults, and Kairo's character-first identity (§6) is easy
to flatten.

- [ ] **Step 2: Queries**

`src/features/train/queries.ts`: `useTrainingAreas(userId)` reading
`profiles.trains_run`/`trains_strength`; `useSetTrainingArea()` mutating them;
`useRecentSessions(userId)` reading `workout_sessions` for the last
`CHALLENGE_WINDOW_DAYS` days; `useChallengeClears(userId)` reading
`challenge_completions`.

The live challenge is **computed on the client** from `useRecentSessions` via
`resolveChallenge(area, sessions, todayLocalDate)` — the same function the server
uses, which is what guarantees the target shown is the target judged.

- [ ] **Step 3: The area picker**

When neither area is on, `/train` opens on the picker. Two toggles, plain copy
about what each means. This is where opt-in lives (D19) — **not** in onboarding,
which stays at two screens: `CLAUDE.md` is explicit that a new onboarding step
must land before the name screen, because the profile row commits exactly once
there.

- [ ] **Step 4: The challenge card**

`ChallengeCard.tsx` renders one area's live challenge. Copy by variant:

- `run` / `establish`: *"Log one run of 1 km or more."* Plus why: *"Your first run sets your baseline — there's no pace to beat yet."*
- `run` / `target`: *"Run 5 km at 4:51 / km or better."* Format `paceSecPerKm` as `m:ss`.
- `strength` / `establish`: *"Log one strength workout."*
- `strength` / `target`: *"Burn 310 calories in a strength workout."*

For **Strength with no session ever logged** (D10), the card is visible and
instructional — never hidden:

> Start a Strength workout on your Watch or phone before your set — that's how Kairo sees it.

Hiding it (REC's rule) is wrong here: REC's "no wearable, no row, zero penalty"
covers hardware nobody can conjure. This is a behaviour gap — the user *can* do
it, they just have not learned to.

The card is **one accessible element** with a composed label, children hidden
explicitly, exactly as `DailyWalkCard` does in Task 4.

- [ ] **Step 5: The home entry**

A compact row on the home shelf showing the live target as text, so the mechanic
is legible without navigating. For a cold-start user that reads *"Log one run of
1 km"* — an invitation, which is the right first impression.

Only render it for areas the user has opted into; render an "Start training" entry
when neither is on.

- [ ] **Step 6: Verify**

```bash
npm run ios
xcrun simctl ui booted content_size accessibility-extra-extra-extra-large
xcrun simctl io booted screenshot /tmp/train-xxxl.png
xcrun simctl ui booted content_size medium
```

Then the Accessibility Inspector: each challenge card is one element.

- [ ] **Step 7: Typecheck, full tests, commit**

Run: `npm run typecheck && npm test`

```bash
git add app/train.tsx src/features/train/ 'app/(tabs)/index.tsx'
git commit -m "feat: the /train route — opt-in, live challenges, recent clears"
```

---

## Task 11: Documentation

Per `CLAUDE.md`, documentation is part of the change, not a follow-up.

- [ ] **Step 1: Roadmap deviations**

Add three rows to `docs/roadmap.md`'s table — the Challenges mechanic (derived
targets, not a `GoalKind`, and why), `workout_sessions` (owner-only, never
scored), and the `gym` → `strength` rename. Each row states what the spec says,
what was built, and why, in the register the existing rows use.

- [ ] **Step 2: Re-sequence the beta**

Phase 9 (TestFlight + beta) moves **behind** a new solo-mode phase. Record the
reason in the phase note: the founder's decision that betaing without Walk /
Strength / Run measures a product already being replaced, overruling the
assessment's own §5 sequencing. Say that the beta slips by the length of this
pass — an unwritten cost is one nobody can weigh later.

- [ ] **Step 3: `docs/mvp-scope.md`**

Move Challenges and Daily Walk to **IN**. State Routines explicitly as **OUT**.
This file exists because the August 2026 QA pass graded Kairo against a stale
brief and buried real findings under findings about a product that no longer
existed — leaving Routines unlisted invites exactly that again.

- [ ] **Step 4: `docs/user-journey.md`**

The daily loop gains the Daily Walk card and `/train`. Update the flow
end-to-end, grounded in what is built rather than what is spec'd.

- [ ] **Step 5: `CLAUDE.md`**

Three entries, in the register of the existing ones:

- `workout_sessions` is owner-readable, never scored, absent from every projection.
- The **strictly-before** rule: a challenge is resolved from sessions before the day it judges, and weakening it lets a session set its own bar.
- `DAILY_STEP_BASELINE` **is** AGI's Gold threshold, which is what lets the walk streak read `tiers`, and a test pins the equivalence.

- [ ] **Step 6: Close the assessment**

Add a short **Part 4** to
`docs/assessments/2026-08-14-metric-purpose-and-cadence-goals.md` pointing at
both specs and both plans, so it stops reading as the live decision record.

- [ ] **Step 7: Commit**

```bash
git add docs/ CLAUDE.md
git commit -m "docs: record solo mode across roadmap, scope, journey and CLAUDE.md"
```

---

## Done when

- [ ] `npm test` and `npm run typecheck` both pass.
- [ ] `npm run test:schema` passes with the two new migrations applied to PGlite.
- [ ] `node supabase/scripts/smoke-sync.mjs` passes against the deployed `sync-health`.
- [ ] The `profiles` UPDATE grant lists exactly the intended columns — verified against the live project, not assumed.
- [ ] No row in `public.squads` has `program = 'gym'`.
- [ ] The Daily Walk card and each challenge card are **one element** under the Accessibility Inspector.
- [ ] Home and `/train` read correctly at `accessibility-extra-extra-extra-large`.
- [ ] Docs updated: roadmap (3 deviations + re-sequenced beta), mvp-scope, user-journey, CLAUDE.md, assessment Part 4.

## Deliberately not built

**Routines** — the squad layer. Designed in the spec's §9 with all decisions
settled (shared frequency, personal bars and days, open roster, indefinite
default, weekly XP trickle). Three questions remain open for that pass and are
recorded there: shield-versus-ease coordination on a missed week, where a Routine
surfaces relative to `SquadGoalPanel`, and the `required_members` default.

# Goals → Events, and the Battle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Goal — a per-member N-of-M target measured in points — with the Event: a **pooled** squad fight against a boss whose HP is snapshotted at creation and whose progress is a read-time projection over raw active calories.

**Architecture:** The `goals` table is reshaped in place into `challenge_events` rather than dropped, so its RLS, its column-level grants, its XP rollup and its erasure triggers survive. Progress stops projecting `daily_scores` and starts pooling `health_buckets`, which is what makes a Battle measurable in kcal instead of points. `create_goal()` is dropped by exact argument list and recreated as `create_event()`; `goal_window_scores()` becomes `event_progress()`. On the client, `src/features/goals/` is deleted and `src/features/events/` replaces it.

**Tech Stack:** TypeScript (zero-dependency `@kairo/core`), Postgres/Supabase (plpgsql, `security definer`, column-level grants), Deno Edge Functions, React Native / Expo Router, Vitest, PGlite.

**Spec:** `docs/superpowers/specs/2026-08-25-events-and-battle-design.md` — this subsystem's design, which carries the decisions taken while planning it.
**Parent spec:** `docs/superpowers/specs/2026-08-25-character-race-pivot-design.md` — authoritative for everything cross-cutting. Read both.

## This is plan 4 of 5

| Plan | Scope | Depends on |
|---|---|---|
| 1. The Race | `race.ts`, widened projection, consent gate, lanes on the Squad tab, solo ghost race | — |
| 2. Body · Motion · Mind | `STAT_NAMES` and every surface reading it | — |
| 3. The Today tab | Fourth tab, quests, disclosure change, race hero card | 1 |
| **4. Goals → Events + Battle** (this plan) | Table reshape, `create_event()`, `event_progress()`, pooled grading | — |
| 5. Digest + level response | One push a day, louder level bands on the figure | 1, 3, 4 |

**Battle only. Adventure is deferred** (spec §11) — same engine, shipped after
the engine is proven live. The *schema* carries both `kind` values and both
`metric` values from day one, so the migration happens **once** rather than
twice. Nothing in this plan builds an Adventure surface.

## Global Constraints

- **`packages/kairo-core` stays pure and zero-dependency.** No I/O, no clock reads, no randomness. Every function takes what it needs as an argument — `today` is always a parameter, never a clock read.
- **Imports use explicit `.ts` extensions.**
- **`src/ui/Text.tsx` is the only Text.** Import from `@/ui`, never from `react-native`. `allowFontScaling={false}` appears nowhere in this codebase and must not start.
- **Never `create or replace` a function whose signature changes.** Drop by exact argument list first — a surviving overload fails nothing until a call site resolves to it. This is the `create_goal` / `p_metric` trap and it has already cost this codebase twice.
- **A column-level `REVOKE` against a table-level `GRANT` is silently a no-op.** Revoke the table grant, then re-grant the allowed columns in full.
- **A migration touching a table an Edge Function writes ships with that function's redeploy**, and `supabase/scripts/smoke-sync.mjs` runs after. This plan's migration renames three tables `finalize-days` reads and writes; deploying one without the other is exactly the August 2026 outage.
- **Applying a migration on this machine** means `./supabase/scripts/remote-sql.sh -f <file>` (port 5432 is blocked, Docker unavailable), wrapped in `begin; … commit;`, then inserting the `supabase_migrations.schema_migrations` row by hand.
- **Progress is a read-time projection and stores no number of its own.** Only the *completion* is stored, with the target snapshotted. This is the property that makes retries, Apple's retroactive step revisions and cron overlap all safe; preserve it.
- **Edge Function handlers stay thin.** Every decision lives in a `*-plan.ts` module tested in plain Node.
- **XP never goes into `daily_scores.xp_awarded`.** A rescore replays that column from tier points and would wipe it. Event XP lands in `event_completions` and reaches `profiles.total_xp` through `recalculate_user_xp`.
- **UI is verified by hand on the simulator**, not by component tests.
- **Accessibility grouping is explicit:** a parent gets `accessible` + `accessibilityLabel` **and** every direct child gets `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`. Both halves.

## Three refinements of the spec, decided here

**1. Legacy rows are closed out with a `closed_at` column, not grandfathered by
a `NOT VALID` check.** Spec §9 says live goal rows are "closed out rather than
converted" and that `goal_completions` XP "stays banked, so nobody's level
drops". Those two sentences are in tension under a table rename: a completion's
foreign key holds its goal row alive, and that row's `kind` is `cumulative` and
its `metric` is `daily_score` — both of which the new checks reject. The obvious
fixes are both bad: deleting the goal cascades the completion and drops
somebody's level, and `add constraint … not valid` leaves a permanently
unvalidated constraint that the next reader will try to validate and break.

Instead the table gains `closed_at timestamptz`, every surviving legacy row gets
a timestamp, and the new checks are written as
`check (closed_at is not null or kind in ('battle','adventure'))`. That is a
real, validated constraint stating exactly the true thing — **a live event is a
Battle or an Adventure; a closed row is whatever it used to be** — and every read
filters `closed_at is null`. Record it in deviation #45.

**2. `event_progress()` returns the pooled total unconditionally and the
per-member breakdown behind plan 1's consent gate.** Pooling is the point of an
Event (§5.2), and joining a squad Event is itself an act of participation — you
cannot fight together without knowing how the fight is going. But a **two-person
squad can invert a pooled total**: subtract your own contribution and you have
your partner's raw active calories. That is exactly the disclosure plan 1's
`squad_data_consent_at` exists to gate, so the per-member column is gated the
same reciprocal way, and the residual two-person inversion is recorded as a known
limit rather than pretended away. If plan 1 has not landed, the breakdown column
returns `NULL` for everyone and the pooled total still works — Task 2 Step 3 says
how.

**3. `goal_completed` survives as a notification trigger value alongside
`event_completed`.** `notification_log.kind` is free `text` with no check
constraint, so historical rows already say `goal_completed` and a push sent
minutes before the deploy can be tapped minutes after it. Both values stay in
the TypeScript union and both route; only new sends use `event_completed`.

---

### Task 1: `event.ts` — pooled progress, boss HP, completion XP

**Files:**
- Create: `packages/kairo-core/src/event.ts`
- Create: `packages/kairo-core/src/event.test.ts`
- Modify: `packages/kairo-core/src/index.ts` (add one export line)

**Interfaces:**
- Consumes: `DayStatus` from `./compute.ts`.
- Produces: `EVENT_KINDS`, `EVENT_METRICS`, `EVENT_DIFFICULTIES`, `BOSS_HP_FLOOR_PER_MEMBER_DAY`, `BASE_EVENT_COMPLETION_XP`, `MAX_EVENT_COMPLETION_XP`, `evaluateEvent()`, `bossHp()`, `trailingMedian()`, `eventCompletionXp()`, `eventWindowDays()`, and the types `EventKind`, `EventMetric`, `EventDifficulty`, `KairoEvent`, `EventDay`, `EventProgress`. Tasks 2, 3, 5 and 6 consume these.

- [ ] **Step 1: Write the failing test**

Create `packages/kairo-core/src/event.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BASE_EVENT_COMPLETION_XP,
  EVENT_DIFFICULTIES,
  MAX_EVENT_COMPLETION_XP,
  bossHp,
  evaluateEvent,
  eventCompletionXp,
  trailingMedian,
  type EventDay,
  type KairoEvent,
} from './index.ts';

const battle: KairoEvent = {
  id: 'e1',
  kind: 'battle',
  metric: 'active_kcal',
  target: 3_000,
  startsOn: '2026-09-01',
  endsOn: '2026-09-07',
};

const day = (localDate: string, value: number, status: EventDay['status'] = 'final'): EventDay => ({
  localDate,
  value,
  status,
});

describe('trailingMedian', () => {
  it('takes the middle of an odd list', () => {
    expect(trailingMedian([100, 500, 300])).toBe(300);
  });

  it('averages the middle pair of an even list', () => {
    expect(trailingMedian([100, 200, 300, 400])).toBe(250);
  });

  it('is zero for no history, so the caller must apply a floor', () => {
    expect(trailingMedian([])).toBe(0);
  });

  it('is not dragged by one enormous day, which is why it is a median', () => {
    // A mean over [200, 200, 200, 9000] is 2,450 and would set a boss nobody
    // can beat off the back of a single marathon.
    expect(trailingMedian([200, 200, 200, 9_000])).toBe(200);
  });
});

describe('bossHp', () => {
  it('scales the squad\'s own recent output by the window and the difficulty', () => {
    const hp = bossHp({
      pooledMedianDaily: 1_000,
      windowDays: 7,
      members: 4,
      difficulty: 'standard',
    });
    expect(hp).toBe(Math.round((1_000 * 7 * EVENT_DIFFICULTIES.standard) / 100) * 100);
  });

  it('gives a brand-new squad with no history a real fight rather than a free win', () => {
    // A pooled median of 0 would otherwise mean 0 HP: created and defeated in
    // the same second, which reads as the feature being broken.
    const hp = bossHp({ pooledMedianDaily: 0, windowDays: 7, members: 3, difficulty: 'standard' });
    expect(hp).toBeGreaterThan(0);
  });

  it('rounds to a number a person can read', () => {
    const hp = bossHp({
      pooledMedianDaily: 1_234,
      windowDays: 5,
      members: 2,
      difficulty: 'raid',
    });
    expect(hp % 100).toBe(0);
  });

  it('makes a raid harder than a skirmish over the same squad and window', () => {
    const args = { pooledMedianDaily: 2_000, windowDays: 10, members: 5 } as const;
    expect(bossHp({ ...args, difficulty: 'raid' })).toBeGreaterThan(
      bossHp({ ...args, difficulty: 'skirmish' }),
    );
  });
});

describe('evaluateEvent', () => {
  it('pools every participant\'s day into one number', () => {
    // Pooled, not per-member: this is the reversal of squad goals' N-of-M, and
    // it is the point. The strong member carries.
    const result = evaluateEvent(
      battle,
      [day('2026-09-01', 900), day('2026-09-01', 400), day('2026-09-02', 700)],
      '2026-09-03',
    );
    expect(result.progress).toBe(2_000);
  });

  it('ignores days outside the window', () => {
    const result = evaluateEvent(
      battle,
      [day('2026-08-31', 5_000), day('2026-09-08', 5_000), day('2026-09-02', 100)],
      '2026-09-03',
    );
    expect(result.progress).toBe(100);
  });

  it('decides completion from FINAL days only', () => {
    // A provisional day cannot complete an event: completion pays XP and
    // latches one-way, so a day Apple may still revise downward must never
    // trigger it.
    const result = evaluateEvent(
      battle,
      [day('2026-09-01', 2_000, 'final'), day('2026-09-02', 1_500, 'provisional')],
      '2026-09-03',
    );
    expect(result.progress).toBe(3_500);
    expect(result.finalProgress).toBe(2_000);
    expect(result.met).toBe(false);
  });

  it('completes once final days reach the target, inclusively', () => {
    const result = evaluateEvent(battle, [day('2026-09-01', 3_000)], '2026-09-02');
    expect(result.met).toBe(true);
  });

  it('draws a fraction the bar can render, clamped past the target', () => {
    const result = evaluateEvent(battle, [day('2026-09-01', 9_000)], '2026-09-02');
    expect(result.fraction).toBe(1);
  });

  it('counts today as a day still to come', () => {
    const result = evaluateEvent(battle, [], '2026-09-05');
    expect(result.daysRemaining).toBe(3);
    expect(result.expired).toBe(false);
  });

  it('expires past the window', () => {
    const result = evaluateEvent(battle, [day('2026-09-01', 10)], '2026-09-08');
    expect(result.expired).toBe(true);
    expect(result.daysRemaining).toBe(0);
  });

  it('stays met after expiry, because completion latches', () => {
    const result = evaluateEvent(battle, [day('2026-09-01', 3_000)], '2026-09-30');
    expect(result.met).toBe(true);
    expect(result.expired).toBe(true);
  });

  it('reports pace against elapsed time, and nothing before the first day', () => {
    const behind = evaluateEvent(battle, [day('2026-09-01', 100)], '2026-09-04');
    expect(behind.onPace).toBe(false);
    const ahead = evaluateEvent(battle, [day('2026-09-01', 2_900)], '2026-09-02');
    expect(ahead.onPace).toBe(true);
  });

  it('handles an empty window without dividing by zero', () => {
    const result = evaluateEvent(battle, [], '2026-08-25');
    expect(result.progress).toBe(0);
    expect(result.met).toBe(false);
    expect(Number.isFinite(result.fraction)).toBe(true);
  });
});

describe('eventCompletionXp', () => {
  it('pays more for a longer commitment, sub-linearly', () => {
    const week = eventCompletionXp({ ...battle, endsOn: '2026-09-07' }, '2026-09-07');
    const month = eventCompletionXp({ ...battle, endsOn: '2026-09-30' }, '2026-09-30');
    expect(month).toBeGreaterThan(week);
    expect(month).toBeLessThan(week * 4);
  });

  it('pays the base for a one-day event', () => {
    expect(eventCompletionXp({ ...battle, endsOn: '2026-09-01' }, '2026-09-01')).toBe(
      BASE_EVENT_COMPLETION_XP,
    );
  });

  it('caps, so an absurd window with a trivial target is not worth gaming', () => {
    expect(
      eventCompletionXp({ ...battle, startsOn: '2026-01-01', endsOn: '2036-01-01' }, '2026-01-02'),
    ).toBe(MAX_EVENT_COMPLETION_XP);
  });

  it('pays on the window it committed to, not on how early it landed', () => {
    const early = eventCompletionXp(battle, '2026-09-02');
    const late = eventCompletionXp(battle, '2026-09-07');
    expect(early).toBe(late);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test:core -- --run src/event.test.ts`
Expected: FAIL — the module does not exist, so the import from `./index.ts` cannot resolve `bossHp`.

- [ ] **Step 3: Write the module**

Create `packages/kairo-core/src/event.ts`:

```ts
import type { DayStatus } from './compute.ts';

/**
 * Events — Battle and Adventure (roadmap deviations #45, #48, #49).
 *
 * An Event is a **pooled** target over a window of days. It replaces the Goal,
 * and the two differ on three axes that all matter:
 *
 * - **Pooled, not per-member.** A squad goal was N-of-M: everyone had to hit it.
 *   An Event sums everyone's contribution into one bar. That reversal is the
 *   point — cooperation means the strong member carries, and carrying somebody
 *   is a reason to invite them. N-of-M made a weak member a liability.
 * - **Raw units, not points.** Battle counts active calories and Adventure
 *   counts metres. A target you can go outside and produce is one you can judge
 *   before committing to it, which points never were.
 * - **The target is snapshotted at creation, and a Challenge target is not.**
 *   See `bossHp` below — the asymmetry is deliberate and is the thing most
 *   likely to be "fixed" wrongly.
 *
 * Progress is a **read-time projection** and this module stores nothing: a day
 * Apple revises after the fact flows through by replay, exactly as it does for
 * scores. Only the completion is recorded, because it pays XP and must fire
 * once.
 *
 * Pure, like everything in this package: `today` is an argument, never a clock
 * read, so window boundaries are table-driven tests with no time mocking.
 */

export type EventKind = 'battle' | 'adventure';
export const EVENT_KINDS: readonly EventKind[] = ['battle', 'adventure'];

/**
 * What an Event counts.
 *
 * Both are raw figures already in `health_buckets`. Neither reaches hourly
 * movement, heart rate or workout sessions — `event_progress()` sums a day and
 * never groups by hour, which is the difference between a total and a routine.
 */
export type EventMetric = 'active_kcal' | 'distance_m';
export const EVENT_METRICS: readonly EventMetric[] = ['active_kcal', 'distance_m'];

export interface KairoEvent {
  id: string;
  kind: EventKind;
  metric: EventMetric;
  /**
   * The bar. **Snapshotted at creation and never recomputed** — see `bossHp`.
   */
  target: number;
  /** Inclusive. Both bounds count. */
  startsOn: string;
  /**
   * Inclusive, and **never null**, unlike a Goal's.
   *
   * A Goal could be open-ended because "reach 500,000 points, however long it
   * takes" is a coherent commitment. A boss with no deadline is not a fight —
   * it is a slowly filling bar that can never be lost, so there is nothing at
   * stake and no reason to push this week rather than next. The database
   * enforces `not null`.
   */
  endsOn: string;
}

/** One participant-day, as `event_progress()` projects it. */
export interface EventDay {
  localDate: string;
  /** The metric's raw value for that participant on that day. */
  value: number;
  status: DayStatus;
}

export interface EventProgress {
  /**
   * What the squad sees. Includes today's provisional day, because a bar that
   * ignored this morning's run would be wrong on the screen it matters on.
   */
  progress: number;
  /**
   * The same number counting **final days only** — what completion is decided
   * from. Kept separate rather than chosen by a flag so both are always
   * available to a caller that needs to explain the difference.
   */
  finalProgress: number;
  target: number;
  /** 0–1, clamped. What the bar draws. */
  fraction: number;
  /** Today included when it is still inside the window; zero once past it. */
  daysRemaining: number;
  /** Days inside the window with no final score yet — days that can still contribute. */
  daysUnresolved: number;
  /** True once the end date is behind us. */
  expired: boolean;
  /**
   * Progress is keeping up with elapsed time. True whenever `met`, and true
   * before the window opens — there is nothing to be behind on yet.
   */
  onPace: boolean | null;
  /** **Final days only.** A provisional day can never complete an Event. */
  met: boolean;
}

/** Inclusive length of an Event's window, in days. Always at least 1. */
export function eventWindowDays(event: KairoEvent): number {
  return Math.max(1, daysBetween(event.startsOn, event.endsOn) + 1);
}

/** Whole days from `from` to `to`. Date-only, so DST cannot shift the count. */
function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / 86_400_000);
}

/**
 * A date-only string as a UTC instant.
 *
 * UTC deliberately, not local: these are calendar dates already resolved in the
 * user's timezone upstream (§2), so re-interpreting them in any zone would be
 * the one thing that could move a window boundary by a day.
 */
function utcOf(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function withinWindow(event: KairoEvent, localDate: string): boolean {
  // Lexicographic comparison is correct and cheap for zero-padded ISO dates.
  return localDate >= event.startsOn && localDate <= event.endsOn;
}

export function evaluateEvent(
  event: KairoEvent,
  days: readonly EventDay[],
  today: string,
): EventProgress {
  let progress = 0;
  let finalProgress = 0;
  const finalDates = new Set<string>();

  for (const day of days) {
    if (!withinWindow(event, day.localDate)) continue;
    const value = Number.isFinite(day.value) && day.value > 0 ? day.value : 0;
    progress += value;
    if (day.status === 'final') {
      finalProgress += value;
      finalDates.add(day.localDate);
    }
  }

  const windowDays = eventWindowDays(event);
  const expired = today > event.endsOn;

  // Today counts as remaining — it is still playable. Before the event starts
  // the whole window is ahead, which is why this clamps at both ends rather
  // than trusting the subtraction.
  const daysRemaining = expired
    ? 0
    : today < event.startsOn
      ? windowDays
      : daysBetween(today, event.endsOn) + 1;

  // Distinct *dates* that have finalized, not rows: an Event pools several
  // participants, so counting rows would report a six-person squad's first day
  // as six finalized days and declare the window spent on day one.
  const daysUnresolved = Math.max(0, windowDays - finalDates.size);

  const met = event.target > 0 && finalProgress >= event.target;

  // Pace needs a schedule and an Event always has one. Before the first day
  // there is nothing to be behind on, so `elapsed <= 0` reports true rather
  // than dividing by zero.
  const elapsed = windowDays - daysRemaining;
  const onPace =
    met || elapsed <= 0 ? true : progress / elapsed >= event.target / windowDays;

  return {
    progress,
    finalProgress,
    target: event.target,
    fraction: event.target > 0 ? Math.min(1, progress / event.target) : 0,
    daysRemaining,
    daysUnresolved,
    expired,
    onPace,
    met,
  };
}

/**
 * The middle value. Zero for no history — the caller applies the floor.
 *
 * A median rather than a mean, and for the reason `challenge.ts` gives: one
 * marathon in a fortnight would drag a mean far enough to set a boss the squad
 * cannot beat, and "the app punished me for a good day" is the worst thing a
 * cooperative mechanic can say.
 */
export function trailingMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type EventDifficulty = 'skirmish' | 'standard' | 'raid';

/**
 * What share of the squad's normal pooled output the boss costs.
 *
 * `standard` is deliberately **under 1**. A cooperative mechanic that most
 * squads lose is a mechanic most squads stop using, and a first Battle is the
 * moment a squad learns that pooling works at all — so the default is winnable
 * by carrying on as they already were, and `raid` is where pushing is required.
 */
export const EVENT_DIFFICULTIES: Readonly<Record<EventDifficulty, number>> = {
  skirmish: 0.6,
  standard: 0.85,
  raid: 1.15,
};

/**
 * Floor, per member per day, so a squad with no history still gets a fight.
 *
 * Without it a brand-new squad's pooled median is 0 and the boss is defeated in
 * the same second it is created, which reads as the feature being broken rather
 * than as a gift. 150 kcal is roughly half an hour's brisk walk.
 */
export const BOSS_HP_FLOOR_PER_MEMBER_DAY = 150;

/**
 * The boss's HP. **Derived once, at creation, and stored on the row.**
 *
 * This is the deliberate asymmetry with `challenge.ts`, and it is the question
 * the next reader will have. A Challenge derives its target fresh on every read,
 * and that is correct *there*: nothing stateful exists for a retroactive Apple
 * revision to invalidate, and the trailing median moving is the mechanic — you
 * clear one and the next is harder.
 *
 * An Event is the opposite case and inherits §8's Goal invariant instead. A
 * target that moves mid-window silently re-grades every day already counted,
 * which is precisely why a Challenge had to be a sibling concept rather than a
 * `GoalKind`. **A boss whose HP rises because the squad got fitter mid-fight is
 * that bug wearing a hat.** So the number is computed once here, written to
 * `challenge_events.target`, and thereafter is a constant — while *progress*
 * against it stays a read-time projection, so revisions still flow through. The
 * target is fixed; the progress is replayed.
 *
 * `pooledMedianDaily` is the median of the squad's **summed** daily output over
 * the trailing 14 days — one figure per date, summed across participants first,
 * then the median of those. Taking a median per member and adding them would
 * describe a squad nobody has ever been in.
 */
export function bossHp(input: {
  pooledMedianDaily: number;
  windowDays: number;
  members: number;
  difficulty: EventDifficulty;
}): number {
  const windowDays = Math.max(1, Math.floor(input.windowDays));
  const members = Math.max(1, Math.floor(input.members));
  const median = Number.isFinite(input.pooledMedianDaily)
    ? Math.max(0, input.pooledMedianDaily)
    : 0;

  const scaled = median * windowDays * EVENT_DIFFICULTIES[input.difficulty];
  const floor = BOSS_HP_FLOOR_PER_MEMBER_DAY * members * windowDays;

  // Rounded to the nearest hundred: this number is printed on a card and read
  // aloud, and "4,317 HP" claims a precision a trailing median does not have.
  return Math.max(100, Math.round(Math.max(scaled, floor) / 100) * 100);
}

/** XP for a one-day Event. Longer windows scale from here, sub-linearly. */
export const BASE_EVENT_COMPLETION_XP = 30;

/**
 * The ceiling on a single Event's XP.
 *
 * `MAX_REALISTIC_DAILY_XP` is 200, so a heavy year of daily play is on the
 * order of 70,000 XP. 500 keeps the largest possible Event worth about two and
 * a half strong days — a real reward that cannot substitute for showing up.
 */
export const MAX_EVENT_COMPLETION_XP = 500;

/**
 * XP for completing an Event, scaled by how long it ran.
 *
 * Square-root scaling, so a 30-day Event pays more than a 7-day one without a
 * year-long one paying fifty times a week-long one. Capped regardless: the
 * cheapest possible exploit is an Event with an absurd window and a trivial
 * target, and the cap is what makes that not worth doing.
 *
 * **Scaled by the window committed to, not by when it landed.** An Event
 * cleared on day two of a month-long window pays the month's XP, because the
 * reward is a property of the commitment made. `completedOn` is taken so the
 * signature matches `goalCompletionXp`'s, which it replaces, and so a future
 * open-ended variant has somewhere to put the span — it is deliberately unused.
 */
export function eventCompletionXp(event: KairoEvent, _completedOn: string): number {
  const scaled = BASE_EVENT_COMPLETION_XP * Math.sqrt(eventWindowDays(event));
  return Math.min(MAX_EVENT_COMPLETION_XP, Math.round(scaled));
}
```

- [ ] **Step 4: Export it**

In `packages/kairo-core/src/index.ts`, replace the line `export * from './goal.ts';` with:

```ts
export * from './event.ts';
```

`goal.ts` and `goal.test.ts` are deleted in Task 5, once every consumer is gone.
Deleting the export line now is what makes `npm run typecheck` enumerate those
consumers for you.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npm run test:core -- --run src/event.test.ts`
Expected: PASS, all cases.

Run: `npm run test:core`
Expected: FAIL — `goal.test.ts` can no longer import from `./index.ts`. That is
the enumeration working; leave it red until Task 5.

- [ ] **Step 6: Commit**

```bash
git add packages/kairo-core/src/event.ts packages/kairo-core/src/event.test.ts packages/kairo-core/src/index.ts
git commit -m "feat(core): pooled event progress, snapshotted boss HP and completion XP"
```

---

### Task 2: Reshape `goals` into `challenge_events`

**Files:**
- Create: `supabase/migrations/20260828090000_events.sql`
- Modify: `supabase/tests/schema.test.ts` (replace the goal describe blocks)

**Interfaces:**
- Consumes: nothing from Task 1 — pure SQL, and can be done in parallel with it.
- Produces: `public.challenge_events`, `public.event_participants`, `public.event_completions`, `public.can_see_event(uuid, uuid)`, `public.create_event(...)`, `public.event_progress(uuid, uuid)`, `public.abandon_event(uuid)`. Tasks 3, 5 and 6 consume these.

**Read the deployed schema before writing this.** Three things in the live
project differ from the original `20260810100000_goals.sql` and the migration
must match what is actually there:

```bash
./supabase/scripts/remote-sql.sh "select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.goals'::regclass"
./supabase/scripts/remote-sql.sh "select oid::regprocedure from pg_proc where proname in ('create_goal','goal_window_scores','can_see_goal','abandon_goal','recalculate_user_xp')"
./supabase/scripts/remote-sql.sh "select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass"
```

Specifically: `created_by` is `on delete set null` (not the CASCADE the original
migration wrote — `20260811140000_account_deletion.sql` changed it),
`goals_consistency_needs_end` exists,
`can_see_goal` takes **two** arguments, and `create_goal` takes **ten**.

- [ ] **Step 1: Write the failing schema test**

In `supabase/tests/schema.test.ts`, replace the existing `goals` describe blocks
with these, following the file's harness conventions for creating users, squads
and health data:

```ts
describe('challenge_events (deviations #45, #48, #49)', () => {
  it('accepts a battle and rejects a goal kind on a live row', async () => {
    const created = await asUser(alice, (sql) =>
      sql(
        `select * from public.create_event($1, $2, $3, $4, $5, $6, $7, $8)`,
        ['Boss', null, 'battle', 'active_kcal', 4_000, '2026-09-01', '2026-09-07', squadId],
      ),
    );
    expect(created.rows[0].kind).toBe('battle');
    expect(created.rows[0].target).toBe(4_000);
    expect(created.rows[0].closed_at).toBeNull();

    await expect(
      db.query(
        `insert into public.challenge_events (squad_id, created_by, title, kind, metric, target, starts_on, ends_on)
         values ($1, $2, 'Nope', 'cumulative', 'active_kcal', 10, '2026-09-01', '2026-09-07')`,
        [squadId, alice],
      ),
    ).rejects.toThrow();
  });

  it('keeps closed-out legacy rows, so banked XP does not vanish', async () => {
    // Spec §9: goal_completions XP stays banked and nobody's level drops. A
    // completion's FK holds its row alive, and that row's kind is `cumulative`
    // — so the checks are conditional on closed_at rather than NOT VALID.
    const { rows } = await db.query(
      `select count(*)::int as n from public.challenge_events where closed_at is not null`,
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(0);

    await db.query(
      `insert into public.challenge_events
         (squad_id, created_by, title, kind, metric, target, starts_on, ends_on, closed_at)
       values ($1, $2, 'Legacy', 'cumulative', 'daily_score', 5000, '2026-08-01', '2026-08-31', now())`,
      [squadId, alice],
    );
  });

  it('requires an end date — a boss with no deadline is not a fight', async () => {
    await expect(
      asUser(alice, (sql) =>
        sql(`select * from public.create_event($1, $2, $3, $4, $5, $6, $7, $8)`, [
          'Endless',
          null,
          'battle',
          'active_kcal',
          1_000,
          '2026-09-01',
          null,
          squadId,
        ]),
      ),
    ).rejects.toThrow();
  });

  it('refuses an event for a squad the caller is not in', async () => {
    await expect(
      asUser(carol, (sql) =>
        sql(`select * from public.create_event($1, $2, $3, $4, $5, $6, $7, $8)`, [
          'Intruder',
          null,
          'battle',
          'active_kcal',
          1_000,
          '2026-09-01',
          '2026-09-07',
          squadId,
        ]),
      ),
    ).rejects.toThrow();
  });

  it('allows at most one live event of each kind per squad', async () => {
    await asUser(alice, (sql) =>
      sql(`select * from public.create_event($1, $2, $3, $4, $5, $6, $7, $8)`, [
        'First',
        null,
        'battle',
        'active_kcal',
        1_000,
        '2026-09-01',
        '2026-09-07',
        squadId,
      ]),
    );
    await expect(
      asUser(bob, (sql) =>
        sql(`select * from public.create_event($1, $2, $3, $4, $5, $6, $7, $8)`, [
          'Second',
          null,
          'battle',
          'active_kcal',
          1_000,
          '2026-09-02',
          '2026-09-08',
          squadId,
        ]),
      ),
    ).rejects.toThrow();
  });

  it('freezes the roster at creation', async () => {
    const created = await asUser(alice, (sql) =>
      sql(`select * from public.create_event($1, $2, $3, $4, $5, $6, $7, $8)`, [
        'Boss',
        null,
        'battle',
        'active_kcal',
        4_000,
        '2026-09-01',
        '2026-09-07',
        squadId,
      ]),
    );
    const { rows } = await db.query(
      `select count(*)::int as n from public.event_participants where event_id = $1`,
      [created.rows[0].id],
    );
    expect(rows[0].n).toBe(2);
  });

  it('grants the client no INSERT — create_event is the only door', async () => {
    await expect(
      asUser(alice, (sql) =>
        sql(
          `insert into public.challenge_events
             (squad_id, created_by, title, kind, metric, target, starts_on, ends_on)
           values ($1, $2, 'Sneaky', 'battle', 'active_kcal', 1, '2026-09-01', '2026-09-02')`,
          [squadId, alice],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe('event_progress', () => {
  it('pools every participant\'s raw metric across the window', async () => {
    const created = await asUser(alice, (sql) =>
      sql(`select * from public.create_event($1, $2, $3, $4, $5, $6, $7, $8)`, [
        'Boss',
        null,
        'battle',
        'active_kcal',
        4_000,
        today,
        today,
        squadId,
      ]),
    );
    await insertBuckets(alice, today, [{ hour: 8, steps: 100, active_kcal: 300 }]);
    await insertBuckets(bob, today, [{ hour: 9, steps: 100, active_kcal: 200 }]);

    const progress = await asUser(alice, (sql) =>
      sql(`select * from public.event_progress($1)`, [created.rows[0].id]),
    );
    const total = progress.rows.reduce((n: number, r: any) => n + Number(r.value), 0);
    expect(total).toBe(500);
  });

  it('refuses a caller who is not on the event and not in its squad', async () => {
    const created = await asUser(alice, (sql) =>
      sql(`select * from public.create_event($1, $2, $3, $4, $5, $6, $7, $8)`, [
        'Boss',
        null,
        'battle',
        'active_kcal',
        4_000,
        today,
        today,
        squadId,
      ]),
    );
    await expect(
      asUser(carol, (sql) => sql(`select * from public.event_progress($1)`, [created.rows[0].id])),
    ).rejects.toThrow();
  });

  it('exposes no hourly movement, heart rate or workout data', async () => {
    const { rows } = await db.query(
      `select prosrc from pg_proc where proname = 'event_progress'`,
    );
    expect(rows[0].prosrc).not.toMatch(/workout_sessions/);
    expect(rows[0].prosrc).not.toMatch(/avg_heart_rate/);
    expect(rows[0].prosrc).not.toMatch(/\bb\.hour\b/);
  });
});

describe('the goal API is gone', () => {
  it('has no create_goal, goal_window_scores or can_see_goal left', async () => {
    const { rows } = await db.query(
      `select proname from pg_proc
        where proname in ('create_goal', 'goal_window_scores', 'can_see_goal', 'abandon_goal')`,
    );
    expect(rows).toEqual([]);
  });

  it('still names every XP source, because the recompute is written out whole', async () => {
    const { rows } = await db.query(
      `select prosrc from pg_proc where proname = 'recalculate_user_xp'`,
    );
    expect(rows[0].prosrc).toMatch(/daily_scores/);
    expect(rows[0].prosrc).toMatch(/event_completions/);
  });
});
```

If `insertBuckets` does not already exist under that name, use whatever the file
already calls its `health_buckets` insert helper rather than adding a second one.
`carol` is a user in no squad; add one if the file has no such fixture.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "challenge_events"`
Expected: FAIL — `relation "public.challenge_events" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260828090000_events.sql`:

```sql
-- Goals become Events (roadmap deviations #45, #48, #49).
--
-- **Reshape, do not drop.** The table already carries squad_id, created_by,
-- title, description, a widenable metric check, a starts_on/ends_on window and
-- window-ordering validation. Its RLS, its column-level grants, its XP rollup
-- and — the expensive one — its erasure triggers all work, and rebuilding those
-- on a new table would be rewriting the erasure-critical path for nothing.
--
-- Three things change in substance:
--
-- 1. **Pooled, not per-member.** required_days and required_members go, along
--    with their biconditional constraints. A squad goal was N-of-M: everyone
--    had to hit it, so a weak member was a liability. An Event sums everyone
--    into one bar, which is what makes inviting somebody a good idea.
-- 2. **Raw units, not points.** metric becomes active_kcal or distance_m, and
--    event_progress() pools health_buckets instead of projecting daily_scores.
-- 3. **The target is snapshotted at creation.** bossHp() in @kairo/core derives
--    it once; thereafter the column is a constant. A Challenge derives its
--    target on every read and that is right *there*; a target that moved
--    mid-window here would silently re-grade every day already counted.
--
-- **Legacy rows are closed out, not deleted and not grandfathered.** Spec §9
-- keeps banked goal XP, and a completion's FK holds its goal row alive — but
-- that row's kind is `cumulative`, which the new check rejects. So the table
-- gains `closed_at`, every surviving legacy row gets a timestamp, and the new
-- checks read `closed_at is not null or kind in (...)`. That is a validated
-- constraint stating the true thing: a LIVE event is a Battle or an Adventure;
-- a closed row is whatever it used to be. Every read filters closed_at is null.
--
-- SHIPS WITH: `supabase functions deploy finalize-days`. That function reads
-- and writes all three of these tables under their old names.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rename
-- ---------------------------------------------------------------------------
--
-- `alter table ... rename` carries indexes, constraints, policies, triggers and
-- grants with it. The constraint and index NAMES keep their old spelling, which
-- is why each is renamed explicitly below rather than left to read `goals_*` on
-- a table called challenge_events.

alter table public.goals             rename to challenge_events;
alter table public.goal_participants rename to event_participants;
alter table public.goal_completions  rename to event_completions;

alter table public.event_participants rename column goal_id to event_id;
alter table public.event_completions  rename column goal_id to event_id;

alter index goals_squad_idx              rename to challenge_events_squad_idx;
alter index goals_window_idx             rename to challenge_events_window_idx;
alter index goal_participants_user_idx   rename to event_participants_user_idx;
alter index goal_completions_user_idx    rename to event_completions_user_idx;

alter policy goals_select_visible              on public.challenge_events  rename to events_select_visible;
alter policy goals_update_own                  on public.challenge_events  rename to events_update_own;
alter policy goal_participants_select_visible  on public.event_participants rename to event_participants_select_visible;
alter policy goal_completions_select_visible   on public.event_completions  rename to event_completions_select_visible;

-- ---------------------------------------------------------------------------
-- 2. Close out what exists
-- ---------------------------------------------------------------------------

alter table public.challenge_events
  add column closed_at timestamptz;

comment on column public.challenge_events.closed_at is
  'When this row stopped being a live Event. NULL for a live Battle or Adventure; set for every pre-pivot Goal row, which survives only so its banked completion XP does not vanish. Every read filters `closed_at is null`; the kind and metric checks are conditional on it, so a closed row keeps whatever it used to be without needing an unvalidated constraint.';

-- Every pre-existing row is a Goal and none of them convert: per-member N-of-M
-- does not cleanly become a pooled Event, and inventing a conversion is worse
-- than a clean end (spec §9). Rows with no completion could be deleted outright
-- and are left instead, because one rule is easier to reason about than two and
-- nothing reads them either way.
update public.challenge_events set closed_at = now() where closed_at is null;

-- ---------------------------------------------------------------------------
-- 3. Reshape the columns
-- ---------------------------------------------------------------------------

alter table public.challenge_events drop constraint goals_required_days_iff_consistency;
alter table public.challenge_events drop constraint goals_required_members_iff_squad;
alter table public.challenge_events drop constraint goals_metric_check;
alter table public.challenge_events drop constraint goals_kind_check;
alter table public.challenge_events drop constraint goals_consistency_needs_end;
alter table public.challenge_events rename constraint goals_window_ordered to events_window_ordered;

alter table public.challenge_events drop column required_days;
alter table public.challenge_events drop column required_members;

-- Both kinds and both metrics ship now even though Phase 1 builds only Battle
-- (spec §11), so the migration happens ONCE rather than twice.
alter table public.challenge_events
  add constraint events_kind_check
  check (closed_at is not null or kind in ('battle', 'adventure'));

alter table public.challenge_events
  add constraint events_metric_check
  check (closed_at is not null or metric in ('active_kcal', 'distance_m'));

-- An Event always has a deadline. A Goal could be open-ended, because "reach
-- 500,000 points however long it takes" is a coherent commitment; a boss with
-- no deadline is a slowly filling bar that can never be lost, so there is
-- nothing at stake and no reason to push this week rather than next.
alter table public.challenge_events
  add constraint events_need_end
  check (closed_at is not null or ends_on is not null);

-- An Event belongs to a squad. A personal Battle is a Challenge, which already
-- exists and is a better fit; two mechanics for one thing is how a surface ends
-- up half-built.
alter table public.challenge_events
  add constraint events_need_squad
  check (closed_at is not null or squad_id is not null);

-- At most one live Battle and one live Adventure per squad (spec §5.2). A
-- partial unique index rather than a trigger: it is the cheaper statement of
-- the rule and it cannot be raced.
create unique index challenge_events_one_live_per_kind
  on public.challenge_events (squad_id, kind)
  where closed_at is null;

comment on table public.challenge_events is
  'A POOLED target over a window of local dates, for one squad (deviation #48). Progress is never stored — event_progress() pools health_buckets at read time, so a retroactive Apple revision flows through by replay. The TARGET is snapshotted at creation and is a constant thereafter (deviation #49), unlike a Challenge target, which is derived on every read. Fixed after creation except for the title.';

-- The window/required_days validation trigger has nothing left to validate:
-- required_days is gone and events_window_ordered is a plain CHECK.
drop trigger if exists goals_validate_trigger on public.challenge_events;
drop function if exists public.goals_validate();

-- ---------------------------------------------------------------------------
-- 4. Rename the machinery
-- ---------------------------------------------------------------------------

alter function public.goal_completions_xp_rollup() rename to event_completions_xp_rollup;
alter trigger goal_completions_xp_rollup_trigger on public.event_completions
  rename to event_completions_xp_rollup_trigger;

-- **Read the deployed body before editing this.** It is a full recompute
-- written out whole, not an increment, so a source omitted here is a source
-- dropped — and every affected account's level falls on the next write. Plan 3
-- adds quest_completions to the same function; if it landed first, keep its
-- term. Check with:
--   ./supabase/scripts/remote-sql.sh \
--     "select prosrc from pg_proc where proname = 'recalculate_user_xp'"
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
       + coalesce((select sum(xp_awarded) from public.event_completions
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

-- The erasure triggers on `profiles` name goals. Rename the function and the
-- trigger; do NOT change when it fires.
--
-- `profiles_collect_orphaned_goals` MUST stay AFTER DELETE. Moving it BEFORE
-- reaches a completion, which updates `profiles`, which modifies the row being
-- deleted, and Postgres aborts the statement. And `created_by` stays SET NULL
-- rather than CASCADE, so a shared Event survives its author — it confers only
-- the title-edit grant, so nulling it means nobody inherits the rename right.
alter function public.profiles_collect_orphaned_goals() rename to profiles_collect_orphaned_events;
alter trigger profiles_collect_orphaned_goals on public.profiles
  rename to profiles_collect_orphaned_events;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
--
-- Unchanged in substance and restated in full because the table renames carried
-- the old grants across and a reader must be able to see what `authenticated`
-- actually holds without chasing three migrations.
--
-- The table-level revoke MUST precede the column grant: a column-level REVOKE
-- against a table-level GRANT is silently a no-op in Postgres.

revoke all on public.challenge_events  from anon, authenticated;
revoke all on public.event_participants from anon, authenticated;
revoke all on public.event_completions  from anon, authenticated;

grant select on public.challenge_events  to authenticated;
grant select on public.event_participants to authenticated;
grant select on public.event_completions  to authenticated;
grant update (title, description) on public.challenge_events to authenticated;

-- ---------------------------------------------------------------------------
-- 6. can_see_event
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER for a specific reason, not convenience. Written inline, the
-- challenge_events policy has to read event_participants and the
-- event_participants policy has to read challenge_events — mutual recursion,
-- which Postgres rejects at query time. A definer function bypasses RLS on both
-- reads, so the cycle cannot form.
--
-- Dropped and recreated under the new name rather than renamed, because the
-- policies referencing it must be recreated anyway to point at the new name.

drop policy events_select_visible             on public.challenge_events;
drop policy event_participants_select_visible on public.event_participants;
drop policy event_completions_select_visible  on public.event_completions;
drop function public.can_see_goal(uuid, uuid);

create function public.can_see_event(p_event_id uuid, p_as_user uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- auth.uid() first, p_as_user only as the fallback. The order is
  -- load-bearing: a signed-in caller must never be able to name somebody else.
  select exists (
    select 1 from public.event_participants ep
    where ep.event_id = p_event_id
      and ep.user_id = coalesce((select auth.uid()), p_as_user)
  ) or exists (
    select 1 from public.challenge_events e
    join public.squad_members sm on sm.squad_id = e.squad_id
    where e.id = p_event_id
      and sm.user_id = coalesce((select auth.uid()), p_as_user)
  );
$$;

comment on function public.can_see_event(uuid, uuid) is
  'The one event-visibility rule. SECURITY DEFINER to break the challenge_events/event_participants policy recursion; called by both policies and by event_progress().';

revoke execute on function public.can_see_event(uuid, uuid) from public, anon;
grant execute on function public.can_see_event(uuid, uuid) to authenticated;

create policy events_select_visible on public.challenge_events
for select to authenticated
using (public.can_see_event(id));

create policy events_update_own on public.challenge_events
for update to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

create policy event_participants_select_visible on public.event_participants
for select to authenticated
using (user_id = (select auth.uid()) or public.can_see_event(event_id));

create policy event_completions_select_visible on public.event_completions
for select to authenticated
using (user_id = (select auth.uid()) or public.can_see_event(event_id));

-- ---------------------------------------------------------------------------
-- 7. create_event — the only constructor
-- ---------------------------------------------------------------------------
--
-- Dropped by EXACT ARGUMENT LIST, never `create or replace`. A surviving
-- overload fails nothing until a call site resolves to it, and PostgREST cannot
-- disambiguate two functions that differ only by defaulted parameters. This is
-- the p_metric trap, which has already cost this codebase twice.
--
-- The target arrives from the client, computed by bossHp() in @kairo/core, and
-- is written verbatim. That is deliberate and it is the one place a client
-- decides a number the server stores: reimplementing the median here would be a
-- second implementation of the arithmetic needing a differential test, which is
-- exactly what deviation #18 declined to pay for goals. The exposure is bounded
-- — a client can set an easy boss for its own squad, which costs the squad its
-- own XP and nothing else — and the CHECK below bounds it further.

drop function public.create_goal(text, text, text, integer, date, date, smallint, uuid, smallint, text);
drop function public.abandon_goal(uuid);
drop function public.goal_window_scores(uuid, uuid);

create function public.create_event(
  p_title text,
  p_description text,
  p_kind text,
  p_metric text,
  p_target integer,
  p_starts_on date,
  p_ends_on date,
  p_squad_id uuid
)
returns public.challenge_events
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_event public.challenge_events;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_squad_id is null then
    raise exception 'an event belongs to a squad' using errcode = '22023';
  end if;

  if p_ends_on is null then
    raise exception 'an event needs an end date' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and user_id = v_user
  ) then
    raise exception 'not a member of this squad' using errcode = '42501';
  end if;

  -- No parameters are defaulted, on purpose. Every one of them is a decision
  -- the creation screen makes explicitly, and a defaulted parameter here is the
  -- next ambiguous overload waiting to happen.
  insert into public.challenge_events (
    squad_id, created_by, title, description, kind, metric, target, starts_on, ends_on
  )
  values (
    p_squad_id, v_user, btrim(p_title), p_description, p_kind, p_metric, p_target,
    p_starts_on, p_ends_on
  )
  returning * into v_event;

  -- Freeze the roster in the same transaction that creates the event, so there
  -- is no instant where an event exists with nobody on it. Membership changing
  -- later does not change what the group committed to.
  insert into public.event_participants (event_id, user_id)
  select v_event.id, sm.user_id
  from public.squad_members sm
  where sm.squad_id = p_squad_id;

  return v_event;
end;
$$;

comment on function public.create_event(text, text, text, text, integer, date, date, uuid) is
  'The only way an Event is created. Validates squad membership and freezes the participant roster in one transaction. p_target is the boss HP computed by bossHp() in @kairo/core and is stored verbatim — snapshotted at creation (deviation #49), never recomputed. At most one live event of each kind per squad, enforced by challenge_events_one_live_per_kind. No parameter is defaulted: adding a defaulted parameter to a function that already has them is an ambiguous overload PostgREST cannot resolve.';

revoke execute on function public.create_event(text, text, text, text, integer, date, date, uuid)
  from public, anon;
grant execute on function public.create_event(text, text, text, text, integer, date, date, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 8. abandon_event
-- ---------------------------------------------------------------------------

create function public.abandon_event(p_event_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_left integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.event_participants
  where event_id = p_event_id and user_id = v_user;

  if not found then
    raise exception 'not a participant in this event' using errcode = '42501';
  end if;

  select count(*) into v_left
  from public.event_participants where event_id = p_event_id;

  -- Closed rather than deleted, so a completion already paid keeps its row and
  -- its XP. `closed_at` is what the checks and the one-live-per-kind index both
  -- key off, so closing an event frees the slot for the next one.
  if v_left = 0 then
    update public.challenge_events set closed_at = now() where id = p_event_id;
  end if;
end;
$$;

revoke execute on function public.abandon_event(uuid) from public, anon;
grant execute on function public.abandon_event(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. event_progress — the projection all event maths reads from
-- ---------------------------------------------------------------------------
--
-- Returns one row per participant per day inside the window, carrying that
-- day's RAW metric. Rows, not an aggregate: evaluateEvent() in kairo-core is
-- the only implementation of the arithmetic, and both the client and
-- finalize-days call it (deviation #18).
--
-- **Privacy.** Daily SUMS only — the hour column is never selected and never
-- grouped by, which is the difference between a total and a movement pattern.
-- No argument reaches heart rate, workout sessions, pace or timestamps.
--
-- `value` is gated the same reciprocal way squad_leaderboard()'s raw totals are
-- (deviation #47): a member's contribution is visible only when that member has
-- consented AND the viewer has. The POOLED total is not gated — you cannot
-- fight together without knowing how the fight is going, and joining an Event
-- is itself an act of participation. Known limit, recorded rather than
-- pretended away: in a two-person squad the pooled total is invertible.
--
-- NOTE FOR THE MERGE: `profiles.squad_data_consent_at` is plan 1's column. If
-- plan 1 has not landed, replace both `is not null` tests below with `false`
-- and the breakdown returns NULL for everyone while the pooled total still
-- works. Do not invent the column here.

create function public.event_progress(p_event_id uuid, p_as_user uuid default null)
returns table (
  user_id uuid,
  character_name text,
  species text,
  local_date date,
  value numeric,
  pooled_value numeric,
  status public.day_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce((select auth.uid()), p_as_user);
  v_event public.challenge_events;
  v_viewer_consent boolean;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_event from public.challenge_events where id = p_event_id;
  if not found then
    raise exception 'no such event' using errcode = '42501';
  end if;

  -- The same predicate the RLS policies use, not a restatement of it. This
  -- function is SECURITY DEFINER so RLS is bypassed and the check has to be
  -- explicit — but it must never be a *second* copy of the rule.
  if not public.can_see_event(p_event_id, v_user) then
    raise exception 'not a participant in this event' using errcode = '42501';
  end if;

  select p.squad_data_consent_at is not null
    into v_viewer_consent
    from public.profiles p
   where p.id = v_user;

  return query
  with contributions as (
    select
      ep.user_id                                   as uid,
      p.character_name                             as cname,
      p.species                                    as pspecies,
      p.squad_data_consent_at is not null          as pconsent,
      ds.local_date                                as ldate,
      ds.status                                    as dstatus,
      coalesce(hb.raw, 0)::numeric                 as raw
    from public.event_participants ep
    join public.profiles p on p.id = ep.user_id
    -- The date bound stays in the ON clause. Deviation #20: moving it to WHERE
    -- filters out the null-extended rows a LEFT JOIN produces and silently
    -- restores an inner join, dropping a participant who has not scored from a
    -- roster whose entire point is who has and has not contributed.
    left join public.daily_scores ds
      on ds.user_id = ep.user_id
     and ds.local_date between v_event.starts_on and v_event.ends_on
    left join lateral (
      select
        case v_event.metric
          when 'active_kcal' then coalesce(sum(b.active_kcal), 0)
          when 'distance_m'  then coalesce(sum(b.distance_m), 0)
          else 0
        end as raw
      from public.health_buckets b
      where b.user_id = ep.user_id and b.local_date = ds.local_date
    ) hb on true
    where ep.event_id = p_event_id
  )
  select
    c.uid,
    c.cname,
    c.pspecies,
    c.ldate,
    case when v_viewer_consent and c.pconsent then c.raw end,
    -- The pooled figure, repeated on every row. Ungated: it is what the bar
    -- draws and what the event IS.
    sum(c.raw) over (partition by c.ldate),
    c.dstatus
  from contributions c
  where c.ldate is not null
  order by c.ldate, c.uid;
end;
$$;

comment on function public.event_progress(uuid, uuid) is
  'Per-participant, per-day RAW metric totals inside an Event window, plus the pooled figure for each day. Rows only — all event arithmetic lives in kairo-core (deviation #18). Daily sums only: no argument exposes hourly movement, heart rate, workout sessions, pace or timestamps. `value` is behind the same reciprocal consent gate as squad_leaderboard()''s raw totals (deviation #47); `pooled_value` is not, because joining an Event is itself participation. p_as_user names the viewer for JWT-less callers (finalize-days) and is ignored when auth.uid() is set.';

revoke execute on function public.event_progress(uuid, uuid) from public, anon;
grant execute on function public.event_progress(uuid, uuid) to authenticated;

commit;
```

- [ ] **Step 4: Run the whole schema suite and confirm it passes**

Run: `npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts`
Expected: PASS. Fix the migration, not the test, and expect the account-deletion
cases to be the ones that catch a mistake — `profiles_collect_orphaned_events`
firing at the wrong time aborts a whole DELETE statement.

- [ ] **Step 5: Apply against the live project**

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260828090000_events.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version) values ('20260828090000')"
```

Then confirm no goal-era overload survived and no XP source was dropped:

```bash
./supabase/scripts/remote-sql.sh "select oid::regprocedure from pg_proc where proname like '%goal%' or proname like '%event%'"
./supabase/scripts/remote-sql.sh "select prosrc from pg_proc where proname = 'recalculate_user_xp'"
./supabase/scripts/remote-sql.sh "select count(*) from public.challenge_events where closed_at is null"
```

Expected: no `create_goal`, `goal_window_scores`, `can_see_goal` or
`abandon_goal`; exactly one `create_event`, one `event_progress`, one
`can_see_event`; the XP body names `daily_scores` and `event_completions` (and
`quest_completions` if plan 3 landed first); and zero live events, because every
pre-existing row was closed out.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260828090000_events.sql supabase/tests/schema.test.ts
git commit -m "feat(db): reshape goals into pooled challenge_events"
```

---

### Task 3: `finalize-days` grades Events

**Files:**
- Create: `supabase/functions/_shared/event-plan.ts`
- Create: `supabase/functions/_shared/event-plan.test.ts`
- Delete: `supabase/functions/_shared/goal-plan.ts`, `supabase/functions/_shared/goal-plan.test.ts`
- Modify: `supabase/functions/finalize-days/index.ts`
- Modify: `supabase/functions/_shared/notification-copy.ts`, `supabase/functions/_shared/notification-copy.test.ts`

**Interfaces:**
- Consumes: `evaluateEvent`, `eventCompletionXp`, `KairoEvent`, `EventDay` from Task 1 via `_shared/core.ts`; `challenge_events`, `event_completions`, `event_progress()` from Task 2.
- Produces: `planEventCompletions(input): EventCompletion[]`, `eventRowToEvent(row)`, `daysForEvent(rows)`. Nothing later consumes them.

**The key behavioural change from `goal-plan.ts`:** a Goal completed **per
person** and an Event completes **for the squad**. When the pooled bar is met,
every participant on the frozen roster gets a completion row — including one who
contributed nothing. That is not an oversight, it is the mechanic: pooled means
the strong member carries, and paying only the contributors would rebuild the
per-member rule the pivot removed.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/event-plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { daysForEvent, eventRowToEvent, planEventCompletions, type EventRow } from './event-plan.ts';

const row: EventRow = {
  id: 'e1',
  squad_id: 's1',
  title: 'The Carabao',
  description: null,
  kind: 'battle',
  metric: 'active_kcal',
  target: 3_000,
  starts_on: '2026-09-01',
  ends_on: '2026-09-07',
};

const roster = ['alice', 'bob'];

describe('eventRowToEvent', () => {
  it('narrows the database strings', () => {
    const event = eventRowToEvent(row);
    expect(event.kind).toBe('battle');
    expect(event.metric).toBe('active_kcal');
  });

  it('degrades an unrecognised kind or metric to the shipped one', () => {
    // A function deployed ahead of its migration sees strings it does not know.
    // Degrading beats throwing, which would stop a whole finalization run — the
    // same defensive posture goal-plan.ts took with `kind`.
    const odd = eventRowToEvent({ ...row, kind: 'raid-boss', metric: 'vibes' });
    expect(odd.kind).toBe('battle');
    expect(odd.metric).toBe('active_kcal');
  });
});

describe('daysForEvent', () => {
  it('pools every participant\'s row into per-day entries', () => {
    const days = daysForEvent([
      { user_id: 'alice', local_date: '2026-09-01', value: 400, status: 'final' },
      { user_id: 'bob', local_date: '2026-09-01', value: 600, status: 'final' },
    ]);
    expect(days).toHaveLength(2);
    expect(days.reduce((n, d) => n + d.value, 0)).toBe(1_000);
  });

  it('treats a null contribution as zero, never as absent', () => {
    // event_progress() withholds `value` behind the consent gate. finalize-days
    // passes p_as_user and is service-role, so it sees real numbers — but a
    // null arriving here must read as 0 rather than NaN, which would poison the
    // whole pooled sum and silently never complete an event.
    const days = daysForEvent([
      { user_id: 'alice', local_date: '2026-09-01', value: null, status: 'final' },
    ]);
    expect(days[0]!.value).toBe(0);
  });

  it('degrades an unknown status to provisional', () => {
    const days = daysForEvent([
      { user_id: 'alice', local_date: '2026-09-01', value: 10, status: 'weird' },
    ]);
    expect(days[0]!.status).toBe('provisional');
  });
});

describe('planEventCompletions', () => {
  const finalDay = (value: number) => [
    { user_id: 'alice', local_date: '2026-09-02', value, status: 'final' as const },
  ];

  it('pays every participant when the pooled bar is met, contributor or not', () => {
    // Pooled means the strong member carries (deviation #48). Paying only the
    // contributors would rebuild the per-member rule the pivot removed.
    const completions = planEventCompletions({
      localDate: '2026-09-02',
      events: [{ row, roster, rows: finalDay(3_000) }],
      alreadyCompleted: new Set(),
    });
    expect(completions.map((c) => c.row.user_id).sort()).toEqual(['alice', 'bob']);
  });

  it('pays nothing while the pooled bar is short', () => {
    expect(
      planEventCompletions({
        localDate: '2026-09-02',
        events: [{ row, roster, rows: finalDay(2_999) }],
        alreadyCompleted: new Set(),
      }),
    ).toEqual([]);
  });

  it('ignores a day outside the window', () => {
    // A day outside the window cannot change the standing, so evaluating it can
    // only produce a wrong answer — and could latch an event on an unrelated
    // day and stamp completed_on with a date that never counted.
    expect(
      planEventCompletions({
        localDate: '2026-09-30',
        events: [{ row, roster, rows: finalDay(9_000) }],
        alreadyCompleted: new Set(),
      }),
    ).toEqual([]);
  });

  it('skips a participant already paid, so cron overlap pays once', () => {
    const completions = planEventCompletions({
      localDate: '2026-09-02',
      events: [{ row, roster, rows: finalDay(3_000) }],
      alreadyCompleted: new Set(['e1:alice']),
    });
    expect(completions.map((c) => c.row.user_id)).toEqual(['bob']);
  });

  it('never completes off a provisional day', () => {
    const completions = planEventCompletions({
      localDate: '2026-09-02',
      events: [
        {
          row,
          roster,
          rows: [{ user_id: 'alice', local_date: '2026-09-02', value: 9_000, status: 'provisional' }],
        },
      ],
      alreadyCompleted: new Set(),
    });
    expect(completions).toEqual([]);
  });

  it('carries the event title, so copy needs no second read', () => {
    const [first] = planEventCompletions({
      localDate: '2026-09-02',
      events: [{ row, roster, rows: finalDay(3_000) }],
      alreadyCompleted: new Set(),
    });
    expect(first!.title).toBe('The Carabao');
    expect(first!.kind).toBe('battle');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/event-plan.test.ts`
Expected: FAIL — cannot resolve `./event-plan.ts`.

- [ ] **Step 3: Write the module**

Create `supabase/functions/_shared/event-plan.ts`:

```ts
import {
  evaluateEvent,
  eventCompletionXp,
  type EventDay,
  type EventKind,
  type EventMetric,
  type KairoEvent,
} from './core.ts';

/**
 * The decision half of the Event pass in `finalize-days`, kept free of I/O so
 * it can be tested in plain Node with no Deno, no Docker and no database.
 *
 * The handler reads the live events a user is on and the days inside each
 * window; this module decides which of them just completed. Nothing here
 * writes, and nothing here evaluates an event itself — `evaluateEvent()` in
 * `@kairo/core` is the single implementation of that arithmetic (deviation
 * #18).
 *
 * **The one behavioural difference from the goal pass it replaces:** a Goal
 * completed per person and an Event completes for the squad. When the pooled
 * bar is met, every participant on the frozen roster is paid — including one
 * who contributed nothing. That is the mechanic, not an oversight: pooled means
 * the strong member carries (deviation #48), and paying only contributors would
 * rebuild the per-member N-of-M rule the pivot removed.
 */

/** An event as the handler reads it back from `challenge_events`. */
export interface EventRow {
  id: string;
  squad_id: string | null;
  title: string;
  description: string | null;
  kind: string;
  metric: string;
  target: number;
  starts_on: string;
  ends_on: string;
}

/** The row `finalize-days` will insert when an event completes. */
export interface EventCompletionRow {
  event_id: string;
  user_id: string;
  completed_on: string;
  xp_awarded: number;
}

export interface EventCompletion {
  row: EventCompletionRow;
  /** Carried so the handler can build notification copy without re-reading. */
  title: string;
  kind: EventKind;
}

/**
 * Narrow the database strings.
 *
 * Anything unrecognised — including a value written by a migration newer than
 * this deployment — degrades to the shipped default rather than throwing. Same
 * defensive posture `goal-plan.ts`'s `toMetric` took, and for the same reason:
 * a throw here stops a whole finalization run, and a day failing to close is
 * worse than an event grading against the wrong metric for one hour.
 */
export function eventRowToEvent(row: EventRow): KairoEvent {
  const kind: EventKind = row.kind === 'adventure' ? 'adventure' : 'battle';
  const metric: EventMetric = row.metric === 'distance_m' ? 'distance_m' : 'active_kcal';
  return {
    id: row.id,
    kind,
    metric,
    target: row.target,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  };
}

/**
 * Turn `event_progress()`'s rows into the day list `evaluateEvent` wants.
 *
 * Every participant's row is kept — this is the opposite of `daysForUser`,
 * which filtered a goal's rows down to one person. Pooling is the point.
 *
 * A null `value` reads as 0. `event_progress()` withholds it behind the consent
 * gate, and although `finalize-days` is service-role and sees real numbers, a
 * null reaching arithmetic would produce NaN — which fails every comparison
 * silently, so an event would simply never complete and nothing would log.
 */
export function daysForEvent(
  rows: readonly {
    user_id: string;
    local_date: string;
    value: number | string | null;
    status: string;
  }[],
): EventDay[] {
  return rows.map((r) => ({
    localDate: r.local_date,
    value: r.value === null ? 0 : Number(r.value),
    status: r.status === 'final' ? 'final' : 'provisional',
  }));
}

/**
 * Which events completed on `localDate`, and who is paid for them.
 *
 * `alreadyCompleted` holds `"<eventId>:<userId>"` keys. It is the cheap filter,
 * not the guarantee: the insert carries `on conflict do nothing` and the
 * primary key is what makes a double-latch impossible under overlapping cron
 * runs.
 */
export function planEventCompletions(input: {
  localDate: string;
  events: readonly {
    row: EventRow;
    /** The frozen roster from `event_participants`. */
    roster: readonly string[];
    /** Every participant's day inside the window, from `event_progress()`. */
    rows: readonly {
      user_id: string;
      local_date: string;
      value: number | string | null;
      status: string;
    }[];
  }[];
  alreadyCompleted: ReadonlySet<string>;
}): EventCompletion[] {
  const completions: EventCompletion[] = [];

  for (const entry of input.events) {
    const { row } = entry;

    // The finalized day must be inside the window. Lexicographic comparison is
    // correct for zero-padded ISO dates.
    if (input.localDate < row.starts_on) continue;
    if (input.localDate > row.ends_on) continue;

    const event = eventRowToEvent(row);

    // `met` reads final days only, which is the whole reason a provisional day
    // cannot pay XP. `localDate` is the day that just finalized, so it is also
    // the correct "today" for this evaluation.
    const result = evaluateEvent(event, daysForEvent(entry.rows), input.localDate);
    if (!result.met) continue;

    const xp = eventCompletionXp(event, input.localDate);

    for (const userId of entry.roster) {
      if (input.alreadyCompleted.has(`${row.id}:${userId}`)) continue;
      completions.push({
        title: row.title,
        kind: event.kind,
        row: {
          event_id: row.id,
          user_id: userId,
          completed_on: input.localDate,
          xp_awarded: xp,
        },
      });
    }
  }

  return completions;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run --config vitest.config.ts supabase/functions/_shared/event-plan.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Rewrite the handler's goal pass**

In `supabase/functions/finalize-days/index.ts`:

Replace the `goal-plan.ts` import with:

```ts
import {
  daysForEvent,
  planEventCompletions,
  type EventRow,
} from '../_shared/event-plan.ts';
```

Replace `settleGoals` wholesale with `settleEvents`. It differs in four ways and
each is a place to get it wrong:

```ts
/** Latch any events this user's newly-final day completed, and notify. */
async function settleEvents(
  candidate: { user_id: string; local_date: string },
  out: Array<{ userId: string; eventId: string; xp: number }>,
): Promise<void> {
  const { data: partRows } = await admin
    .from('event_participants')
    .select('event_id')
    .eq('user_id', candidate.user_id);

  const eventIds = (partRows ?? []).map((r: { event_id: string }) => r.event_id);
  if (eventIds.length === 0) return;

  // Only LIVE events whose window contains the finalized day. `closed_at is
  // null` is the new half: a pre-pivot Goal row survives in this table so its
  // banked XP does not vanish, and grading one would latch a completion against
  // a target that means nothing.
  const { data: eventRows, error: eventError } = await admin
    .from('challenge_events')
    .select('id, squad_id, title, description, kind, metric, target, starts_on, ends_on')
    .in('id', eventIds)
    .is('closed_at', null)
    .lte('starts_on', candidate.local_date)
    .gte('ends_on', candidate.local_date);

  if (eventError) throw new Error(`event lookup failed: ${eventError.message}`);
  const events = (eventRows ?? []) as EventRow[];
  if (events.length === 0) return;

  // Every completion on these events, for EVERYONE — not just this user. An
  // event completes for the squad, so the already-paid set has to be keyed by
  // (event, user) across the whole roster or a second member's finalization
  // would pay the first member twice.
  const { data: doneRows } = await admin
    .from('event_completions')
    .select('event_id, user_id')
    .in('event_id', events.map((e) => e.id));

  const alreadyCompleted = new Set(
    (doneRows ?? []).map((r: { event_id: string; user_id: string }) => `${r.event_id}:${r.user_id}`),
  );

  const planned: Parameters<typeof planEventCompletions>[0]['events'] = [];

  for (const row of events) {
    const [{ data: rosterRows }, { data: dayRows, error }] = await Promise.all([
      admin.from('event_participants').select('user_id').eq('event_id', row.id),
      admin.rpc('event_progress', { p_event_id: row.id, p_as_user: candidate.user_id }),
    ]);
    if (error) throw new Error(`event_progress failed: ${error.message}`);

    planned.push({
      row,
      roster: (rosterRows ?? []).map((r: { user_id: string }) => r.user_id),
      rows: (dayRows ?? []) as Parameters<typeof daysForEvent>[0],
    });
  }

  const completions = planEventCompletions({
    localDate: candidate.local_date,
    events: planned,
    alreadyCompleted,
  });

  if (completions.length === 0) return;

  // `ignoreDuplicates` is the one-way latch, exactly as for goals.
  const { error: latchError } = await admin
    .from('event_completions')
    .upsert(
      completions.map((c) => c.row),
      { onConflict: 'event_id,user_id', ignoreDuplicates: true },
    );
  if (latchError) throw new Error(`event latch failed: ${latchError.message}`);

  for (const completion of completions) {
    out.push({
      userId: completion.row.user_id,
      eventId: completion.row.event_id,
      xp: completion.row.xp_awarded,
    });
  }

  // Push, wrapped separately from the latch: a failed push must never roll back
  // a completion that has already paid XP. The squad beat the boss whether or
  // not their phone heard about it.
  //
  // **Only the user whose day just finalized is pushed here.** Every other
  // member gets theirs when their own day finalizes, which is within a few
  // hours and in their own timezone — pushing the whole squad from one
  // member's finalization would fire at 2am for anyone further east.
  for (const completion of completions) {
    if (completion.row.user_id !== candidate.user_id) continue;
    // …reuse the existing goal_completed push block verbatim, changing the
    // trigger to 'event_completed', `screen` to 'events', `goalId` to
    // `eventId`, and `goalCompletedCopy` to `eventCompletedCopy`.
  }
}
```

Rename the accumulator at the call site from `goalsCompleted` to
`eventsCompleted` and its `goalId` field to `eventId`, and change the
`// ---- goals ----` section comment to `// ---- events ----`.

- [ ] **Step 6: Rename the notification copy**

In `supabase/functions/_shared/notification-copy.ts`, rename `goalCompletedCopy`
to `eventCompletedCopy` and take the event's `kind` so a Battle reads as a
Battle:

```ts
/**
 * A squad beat their boss.
 *
 * Named for the kind, not for "event": nobody set out to complete an event,
 * they set out to beat the Carabao. `adventure` ships later (spec §11) and its
 * branch is written now because the alternative is a `default` that says
 * "Event complete", which is the sentence this function exists to avoid.
 */
export function eventCompletedCopy(input: { title: string; kind: 'battle' | 'adventure' }) {
  return input.kind === 'adventure'
    ? { title: 'You made it. 🏕', body: `${input.title} — your squad reached the end.` }
    : { title: 'Boss down. ⚔️', body: `${input.title} — your squad finished it off.` };
}
```

Update `notification-copy.test.ts` to match, keeping any existing assertion that
every trigger has copy.

- [ ] **Step 7: Delete the goal plan**

```bash
git rm supabase/functions/_shared/goal-plan.ts supabase/functions/_shared/goal-plan.test.ts
```

- [ ] **Step 8: Deploy and smoke**

The migration renamed three tables this function reads and writes, so **the two
ship together**. Applying one without the other is exactly the August 2026
outage: health data kept landing while nothing scored, and every test passed the
whole time, because they check the source and not the deployed artifact.

```bash
npx vitest run --config vitest.config.ts supabase/functions/
npm run typecheck
supabase functions deploy finalize-days --project-ref zniopywbwenrzxezolwv
node supabase/scripts/smoke-sync.mjs
```

Expected: tests PASS, typecheck PASS (including `deno check`), deploy succeeds,
smoke run reports a real sync against the deployed function.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/
git commit -m "feat(finalize-days): grade pooled events and pay the whole roster"
```

---

### Task 4: The notification trigger and the deep link

**Files:**
- Modify: `packages/kairo-core/src/notifications.ts`
- Modify: `packages/kairo-core/src/notifications.test.ts`
- Modify: `src/features/notifications/routing.ts`
- Modify: `src/features/notifications/routing.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `'event_completed'` as a `NotificationTrigger`, and `/event/:id` as a `NotificationDestination`. Task 6 provides the route.

- [ ] **Step 1: Write the failing routing test**

Add to `src/features/notifications/routing.test.ts`:

```ts
describe('event pushes', () => {
  it('routes an event completion to that event', () => {
    expect(notificationTarget({ screen: 'events', eventId: 'e1' })).toBe('/event/e1');
  });

  it('still routes a goal push sent before the rename', () => {
    // notification_log.kind is free text and a push sent minutes before the
    // deploy can be tapped minutes after it. A tap that goes nowhere is
    // indistinguishable from push being broken.
    expect(notificationTarget({ screen: 'goals', goalId: 'g1' })).toBe('/');
  });

  it('degrades to the character tab when the id is missing', () => {
    // Better a real screen than a fabricated one: `/event/undefined` renders an
    // error, and the character tab renders the app.
    expect(notificationTarget({ screen: 'events' })).toBe('/');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts src/features/notifications/routing.test.ts`
Expected: FAIL — `screen: 'events'` falls through to the default.

- [ ] **Step 3: Widen the trigger and the destination**

In `packages/kairo-core/src/notifications.ts`:

```ts
export type NotificationTrigger =
  | 'day_ending_soon'
  | 'day_ends'
  | 'day_starts'
  | 'event_completed'
  /**
   * **Historical.** Retired on 2026-08-25 when Goals became Events (deviation
   * #45), and kept in the union because `notification_log.kind` is free text
   * with no check constraint: rows already say this, and a push sent minutes
   * before the deploy can be tapped minutes after it. Nothing emits it any
   * more. Do not remove it — `countsAgainstBudget` and the routing table both
   * read it, and a historical row that matches no case is a tap that goes
   * nowhere.
   */
  | 'goal_completed'
  | 'challenge_cleared';
```

and add `'event_completed'` to `BUDGET_EXEMPT` alongside `'goal_completed'`,
with a comment saying why it earns the exemption on the same claim: it fires once
per commitment, at most, and the squad set that commitment themselves.

In `src/features/notifications/routing.ts`, add `` `/event/${string}` `` to
`NotificationDestination`, read `eventId` alongside `goalId` from the payload,
and add the case:

```ts
    case 'events':
      // A missing id degrades to the character tab rather than pushing
      // `/event/undefined`, which renders an error — better a real screen than
      // a fabricated one.
      return typeof eventId === 'string' && eventId.length > 0 ? `/event/${eventId}` : '/';
    case 'goals':
      // Historical: pushes sent before the 2026-08-25 rename. The goal routes
      // are gone, so this lands on the character tab rather than nowhere.
      return '/';
```

Update the file's header comment, which documents the payload shapes, to say
`{ trigger: 'event_completed', screen: 'events', eventId }`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test:core -- --run src/notifications.test.ts && npx vitest run --config vitest.config.ts src/features/notifications/routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add packages/kairo-core/src/notifications.ts packages/kairo-core/src/notifications.test.ts src/features/notifications/routing.ts src/features/notifications/routing.test.ts
git commit -m "feat(notifications): route event completions and keep goal pushes landing"
```

---

### Task 5: The client data layer

**Files:**
- Create: `src/features/events/queries.ts`, `src/features/events/mutations.ts`, `src/features/events/event-copy.ts`, `src/features/events/event-copy.test.ts`, `src/features/events/progress.ts`, `src/features/events/progress.test.ts`
- Delete: `src/features/goals/queries.ts`, `mutations.ts`, `goal-copy.ts`, `goal-copy.test.ts`, `standings.ts`, `standings.test.ts`
- Delete: `packages/kairo-core/src/goal.ts`, `packages/kairo-core/src/goal.test.ts`

**Interfaces:**
- Consumes: `evaluateEvent`, `bossHp`, `trailingMedian`, `EVENT_DIFFICULTIES` from Task 1; `create_event`, `event_progress`, `abandon_event` from Task 2.
- Produces: `eventKeys`, `useSquadEvents(squadId)`, `useEventDetail(eventId, today)`, `useCreateEvent(userId)`, `useAbandonEvent(userId)`, `useSquadKcalHistory(squadId)`, `eventHeadline()`, `eventStatusLine()`, `eventLabel()`, `pooledDays()`. Task 6 consumes all of these.

- [ ] **Step 1: Write the failing copy test**

Create `src/features/events/event-copy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { EventProgress, KairoEvent } from '@kairo/core';
import { eventHeadline, eventLabel, eventStatusLine } from './event-copy.ts';

const battle: KairoEvent = {
  id: 'e1',
  kind: 'battle',
  metric: 'active_kcal',
  target: 3_000,
  startsOn: '2026-09-01',
  endsOn: '2026-09-07',
};

const progress = (over: Partial<EventProgress> = {}): EventProgress => ({
  progress: 0,
  finalProgress: 0,
  target: 3_000,
  fraction: 0,
  daysRemaining: 7,
  daysUnresolved: 7,
  expired: false,
  onPace: true,
  met: false,
  ...over,
});

describe('eventHeadline', () => {
  it('names the bar in the unit the squad produces', () => {
    expect(eventHeadline(battle)).toBe('3,000 kcal to beat');
  });

  it('says an adventure in kilometres', () => {
    expect(eventHeadline({ ...battle, kind: 'adventure', metric: 'distance_m', target: 42_000 }))
      .toBe('42 km to cover');
  });
});

describe('eventStatusLine', () => {
  it('leads with how far in, then how long is left', () => {
    expect(eventStatusLine(progress({ progress: 1_200, fraction: 0.4, daysRemaining: 4 }))).toBe(
      '1,200 of 3,000 · 4 days left',
    );
  });

  it('says one day, singular, on the last day', () => {
    expect(eventStatusLine(progress({ progress: 2_000, daysRemaining: 1 }))).toMatch(/1 day left/);
  });

  it('says behind pace, because that is the one actionable state', () => {
    expect(eventStatusLine(progress({ progress: 100, daysRemaining: 2, onPace: false }))).toBe(
      '100 of 3,000 · behind pace, 2 days left',
    );
  });

  it('leads with the win once it is won, and never mentions pace again', () => {
    expect(eventStatusLine(progress({ met: true, progress: 3_400, fraction: 1 }))).toBe('Beaten');
  });

  it('says it plainly when the window closed short', () => {
    expect(eventStatusLine(progress({ expired: true, progress: 900, daysRemaining: 0 }))).toBe(
      '900 of 3,000 · time up',
    );
  });
});

describe('eventLabel', () => {
  it('is one utterance: what it is, where it stands', () => {
    expect(
      eventLabel('The Carabao', battle, progress({ progress: 1_200, daysRemaining: 4 })),
    ).toBe('The Carabao. 3,000 kcal to beat. 1,200 of 3,000 · 4 days left.');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run --config vitest.config.ts src/features/events/event-copy.test.ts`
Expected: FAIL — cannot resolve `./event-copy.ts`.

- [ ] **Step 3: Write the copy module**

Create `src/features/events/event-copy.ts`:

```ts
import type { EventProgress, KairoEvent } from '@kairo/core';

/**
 * How an Event is described to the squad fighting it.
 *
 * One module because three surfaces say it — the squad panel card, the detail
 * screen and the composed accessible name — and the same argument
 * `challenge-copy.ts` and `program-copy.ts` both make.
 *
 * Named in the unit the squad **produces**, never in points. That is not only
 * the points rule (2026-08-15): a Battle's target *is* a number of calories, so
 * points would be a translation away from the thing itself.
 *
 * Pure and tested in Node — it imports only types.
 */

/** Metres as kilometres, trimmed. 42,000 is "42 km", 7,500 is "7.5 km". */
function distanceWords(metres: number): string {
  const km = metres / 1_000;
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

function amount(event: Pick<KairoEvent, 'metric'>, value: number): string {
  return event.metric === 'distance_m'
    ? distanceWords(value)
    : value.toLocaleString();
}

export function eventHeadline(event: KairoEvent): string {
  return event.kind === 'adventure'
    ? `${amount(event, event.target)} to cover`
    : `${amount(event, event.target)} kcal to beat`;
}

/**
 * The line under the bar.
 *
 * Clause · clause, matching the home screen's standing and detail lines and the
 * race card — one rhetorical pattern and one glyph across the app.
 *
 * **Pace is named only when it is bad.** "On pace" is not actionable and adds a
 * clause to every card in the ordinary case; "behind pace" is the one state
 * that tells the squad to do something. Once `met`, nothing else is said at
 * all — a win with a pace note attached reads as a caveat.
 */
export function eventStatusLine(progress: EventProgress): string {
  if (progress.met) return 'Beaten';

  const where = `${progress.progress.toLocaleString()} of ${progress.target.toLocaleString()}`;
  if (progress.expired) return `${where} · time up`;

  const days = `${progress.daysRemaining} ${progress.daysRemaining === 1 ? 'day' : 'days'} left`;
  return progress.onPace === false ? `${where} · behind pace, ${days}` : `${where} · ${days}`;
}

/**
 * The whole card as one utterance.
 *
 * An Event card draws a name, a target, a bar, a figure and a countdown. Left
 * as separate accessibility elements that is five stops for a card whose
 * content is two sentences — the leaderboard's failure in miniature, which is
 * why `row-label.ts` exists and why this does too.
 */
export function eventLabel(
  title: string,
  event: KairoEvent,
  progress: EventProgress,
): string {
  return `${title}. ${eventHeadline(event)}. ${eventStatusLine(progress)}.`;
}
```

- [ ] **Step 4: Write the pooling helper and its test**

Create `src/features/events/progress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pooledDays, type ProgressRow } from './progress.ts';

const row = (over: Partial<ProgressRow>): ProgressRow => ({
  user_id: 'u1',
  character_name: 'Bayani',
  species: null,
  local_date: '2026-09-01',
  value: 100,
  pooled_value: 100,
  status: 'final',
  ...over,
});

describe('pooledDays', () => {
  it('takes each date once, from the pooled column', () => {
    // The RPC repeats the pooled figure on every participant's row, so summing
    // `pooled_value` naively multiplies the day by the squad size.
    const days = pooledDays([
      row({ user_id: 'a', value: 400, pooled_value: 1_000 }),
      row({ user_id: 'b', value: 600, pooled_value: 1_000 }),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0]!.value).toBe(1_000);
  });

  it('keeps a day with a withheld breakdown, because pooled is never withheld', () => {
    const days = pooledDays([row({ value: null, pooled_value: 800 })]);
    expect(days[0]!.value).toBe(800);
  });

  it('returns nothing for no rows rather than a zero day', () => {
    expect(pooledDays([])).toEqual([]);
  });
});
```

Create `src/features/events/progress.ts`. **Put the function itself in
`supabase/functions/_shared/event-plan.ts`, beside `daysForEvent`, and re-export
it here** — plan 5's digest needs it from an Edge Function, which cannot import
a client module, and the whole point of `pooledDays` is that summing
`pooled_value` naively multiplies every day by the squad size. A second copy is
a second chance to get exactly that wrong. The interface and the test below are
unchanged either way; only the file the body lives in moves.

```ts
import type { EventDay } from '@kairo/core';

/** One row of `event_progress()`. */
export interface ProgressRow {
  user_id: string;
  character_name: string;
  species: string | null;
  local_date: string;
  /** This member's own contribution, or null behind the consent gate. */
  value: number | string | null;
  /** The whole squad's figure for that date. Never withheld. */
  pooled_value: number | string;
  status: string;
}

/**
 * The squad's day list, from the RPC's per-participant rows.
 *
 * **Take each date once.** `event_progress()` repeats `pooled_value` on every
 * participant's row — it is a window function over the date — so summing it
 * naively multiplies every day by the squad size and reports a six-person squad
 * as six times fitter than it is. That is the single easiest mistake to make
 * against this RPC, which is why the pooling lives here with a test rather than
 * inline in a component.
 */
export function pooledDays(rows: readonly ProgressRow[]): EventDay[] {
  const byDate = new Map<string, EventDay>();
  for (const row of rows) {
    if (byDate.has(row.local_date)) continue;
    byDate.set(row.local_date, {
      localDate: row.local_date,
      value: Number(row.pooled_value ?? 0),
      status: row.status === 'final' ? 'final' : 'provisional',
    });
  }
  return [...byDate.values()];
}
```

- [ ] **Step 5: Run both tests and confirm they pass**

Run: `npx vitest run --config vitest.config.ts src/features/events/`
Expected: PASS.

- [ ] **Step 6: Write the queries**

Create `src/features/events/queries.ts`. Model it closely on
`src/features/goals/queries.ts`, which you are replacing — read that file first.
Three things differ:

```ts
import { useQuery } from '@tanstack/react-query';
import { evaluateEvent, trailingMedian, type KairoEvent } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';
import { pooledDays, type ProgressRow } from './progress.ts';

export const eventKeys = {
  squad: (squadId: string | undefined) => ['events', 'squad', squadId ?? 'none'] as const,
  detail: (eventId: string | undefined) => ['events', 'detail', eventId ?? 'none'] as const,
  history: (squadId: string | undefined) => ['events', 'history', squadId ?? 'none'] as const,
  /** Prefix of every event key — one broadcast refreshes all of them. */
  all: () => ['events'] as const,
};

const EVENT_COLUMNS =
  'id, squad_id, created_by, title, description, kind, metric, target, starts_on, ends_on';

/**
 * The squad's live Events. **`closed_at is null` is not optional** — the table
 * still holds every pre-pivot Goal row, kept so banked XP does not vanish, and
 * omitting the filter renders them as Battles with a points target.
 *
 * Personal events do not exist: `events_need_squad` rejects them, because a
 * personal Battle is a Challenge and two mechanics for one thing is how a
 * surface ends up half-built.
 */
export function useSquadEvents(squadId: string | undefined) {
  return useQuery({
    queryKey: eventKeys.squad(squadId),
    enabled: Boolean(squadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenge_events')
        .select(EVENT_COLUMNS)
        .eq('squad_id', squadId!)
        .is('closed_at', null)
        .order('ends_on', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/**
 * One Event, with its pooled standing.
 *
 * `today` is passed in rather than read here so the whole thing stays a pure
 * function of its inputs — the same rule `kairo-core` follows, for the same
 * reason: a component that reads the clock cannot be reasoned about.
 *
 * Progress is **computed here**, by the same `evaluateEvent()` the server uses
 * (deviation #18). One implementation of the arithmetic, so the number on the
 * card can never disagree with the one that paid the XP.
 */
export function useEventDetail(eventId: string | undefined, today: string | undefined) {
  return useQuery({
    queryKey: eventKeys.detail(eventId),
    enabled: Boolean(eventId && today),
    queryFn: async () => {
      const [eventResult, progressResult] = await Promise.all([
        supabase.from('challenge_events').select(EVENT_COLUMNS).eq('id', eventId!).maybeSingle(),
        supabase.rpc('event_progress', { p_event_id: eventId! }),
      ]);
      if (eventResult.error) throw new Error(eventResult.error.message);
      if (progressResult.error) throw new Error(progressResult.error.message);
      if (!eventResult.data) throw new Error('That event no longer exists.');

      const row = eventResult.data;
      const event: KairoEvent = {
        id: row.id,
        kind: row.kind === 'adventure' ? 'adventure' : 'battle',
        metric: row.metric === 'distance_m' ? 'distance_m' : 'active_kcal',
        target: row.target,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
      };
      const rows = (progressResult.data ?? []) as ProgressRow[];

      return {
        row,
        event,
        rows,
        progress: evaluateEvent(event, pooledDays(rows), today!),
      };
    },
  });
}

/**
 * The squad's pooled daily active calories over the trailing 14 days, as the
 * median that sets boss HP.
 *
 * Read on the **creation screen only**, and this is the one place a client
 * computes a number the server then stores. Reimplementing the median in
 * plpgsql would be a second implementation of the arithmetic needing a
 * differential test, which is exactly what deviation #18 declined to pay for
 * goals. The exposure is bounded: a client can set an easy boss for its own
 * squad, which costs that squad its own XP and nothing else.
 *
 * It reads `squad_leaderboard()` rather than `health_buckets` — the board
 * already projects each member's daily `active_kcal` behind plan 1's consent
 * gate, and reaching into buckets here would be a second privacy surface for a
 * figure the app already has. A member who has not consented contributes null,
 * which reads as 0, so a squad where nobody has consented gets the floor rather
 * than an error. That is the honest failure: an easier boss, not a broken one.
 */
export function useSquadKcalHistory(squadId: string | undefined, days = 14) {
  return useQuery({
    queryKey: eventKeys.history(squadId),
    enabled: Boolean(squadId),
    queryFn: async (): Promise<number> => {
      const dailyTotals: number[] = [];
      for (let i = 1; i <= days; i += 1) {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() - i);
        const localDate = date.toISOString().slice(0, 10);
        const { data, error } = await supabase.rpc('squad_leaderboard', {
          p_squad_id: squadId!,
          p_local_date: localDate,
        });
        if (error) throw new Error(error.message);
        dailyTotals.push(
          (data ?? []).reduce((n: number, r: { active_kcal: number | null }) =>
            n + Number(r.active_kcal ?? 0), 0),
        );
      }
      return trailingMedian(dailyTotals);
    },
  });
}
```

Fourteen sequential RPC calls is a lot for one screen. It is acceptable **only
because this runs on the creation screen and nowhere else**, and it is the
honest cost of not adding a second aggregating function to review. If the
creation screen feels slow on device, the fix is a single `event_kcal_history()`
RPC with the same consent gate — not caching this one.

- [ ] **Step 7: Write the mutations**

Create `src/features/events/mutations.ts`, modelled on
`src/features/goals/mutations.ts` — read that file first and keep its
`goalErrorMessage` structure, renamed. The create path must compute the target:

```ts
export interface NewEvent {
  title: string;
  description?: string | null;
  kind: 'battle' | 'adventure';
  metric: 'active_kcal' | 'distance_m';
  /** Boss HP, from `bossHp()`. Snapshotted here and never recomputed. */
  target: number;
  startsOn: string;
  /** Never null. `events_need_end` rejects one. */
  endsOn: string;
  squadId: string;
}
```

and the RPC call passes exactly the eight parameters `create_event` declares, in
order, with no omissions — the function has **no defaults**, deliberately, so a
missing argument is a loud error rather than a silent one.

Map SQLSTATEs to sentences a person can act on, as `goalErrorMessage` did, plus
one new case:

```ts
    case '23505':
      // challenge_events_one_live_per_kind. The squad already has a Battle
      // running, and "duplicate key value violates unique constraint" is not a
      // sentence anybody should read.
      return 'Your squad already has a battle going. Finish it before starting another.';
```

- [ ] **Step 8: Delete the goal data layer**

```bash
git rm src/features/goals/queries.ts src/features/goals/mutations.ts \
       src/features/goals/goal-copy.ts src/features/goals/goal-copy.test.ts \
       src/features/goals/standings.ts src/features/goals/standings.test.ts \
       packages/kairo-core/src/goal.ts packages/kairo-core/src/goal.test.ts
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: FAIL, listing exactly the UI files Task 6 rewrites — `GoalCard.tsx`,
`GoalBar.tsx`, `CreateGoalForm.tsx`, `SquadGoalPanel.tsx`, `app/goal/[id].tsx`,
`app/goal/new.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/_layout.tsx`. That list
is the work order for Task 6; write it down.

- [ ] **Step 10: Commit**

```bash
git add src/features/events packages/kairo-core src/features/goals
git commit -m "feat(events): client data layer for pooled battles"
```

The tree does not typecheck at this commit and that is deliberate — splitting the
data layer from the UI is what makes each reviewable. Task 6 closes it.

---

### Task 6: The Battle surface

**Files:**
- Create: `src/features/events/BattleCard.tsx`, `src/features/events/CreateEventForm.tsx`, `src/features/events/SquadEventPanel.tsx`
- Create: `app/event/[id].tsx`, `app/event/new.tsx`
- Delete: `src/features/goals/GoalCard.tsx`, `GoalBar.tsx`, `CreateGoalForm.tsx`, `SquadGoalPanel.tsx`; `app/goal/[id].tsx`, `app/goal/new.tsx`
- Modify: `app/(tabs)/index.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/squad.tsx`
- Modify: `src/features/permissions/PermissionAsks.tsx`, `src/features/permissions/ask-order.ts`, `src/features/permissions/ask-order.test.ts`

**Interfaces:**
- Consumes: everything from Task 5, plus `bossHp`, `EVENT_DIFFICULTIES` from Task 1.
- Produces: nothing consumed by a later task in this plan. Plan 5's digest reads `useSquadEvents`.

- [ ] **Step 1: Build the card**

Create `src/features/events/BattleCard.tsx`. Copy `GoalBar.tsx`'s bar geometry
before deleting it — the pace marker on `Meter` already exists and does not need
rebuilding. One accessibility element, both halves of the grouping fix, using
`eventLabel()` from Task 5:

```tsx
import { View } from 'react-native';
import type { EventProgress, KairoEvent } from '@kairo/core';
import { Meter, Panel, Text, space } from '@/ui/index.ts';
import { colors, ramp } from '@/theme.ts';
import { eventHeadline, eventLabel, eventStatusLine } from './event-copy.ts';

export function BattleCard({
  title,
  event,
  progress,
  onPress,
}: {
  title: string;
  event: KairoEvent;
  progress: EventProgress;
  onPress?: () => void;
}) {
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <Panel variant={progress.met ? 'earned' : 'plain'}>
      <View
        accessible
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={eventLabel(title, event, progress)}
        onTouchEnd={onPress}
        style={{ gap: space.sm }}
      >
        <Text {...hidden} scale="prose">
          {title}
        </Text>
        <Text {...hidden} scale="chrome" style={{ color: colors.subtle }}>
          {eventHeadline(event)}
        </Text>
        <View {...hidden}>
          <Meter
            fraction={progress.fraction}
            color={progress.met ? colors.accent : ramp.sage[600]}
            height={12}
          />
        </View>
        <Text {...hidden} scale="chrome" style={{ color: colors.subtle }}>
          {eventStatusLine(progress)}
        </Text>
      </View>
    </Panel>
  );
}
```

Read `src/ui/Meter.tsx` and `src/features/goals/GoalBar.tsx` first and use the
real prop names — `GoalBar` already draws a pace marker and this should reuse
whatever mechanism it uses rather than inventing a second one. Use a `Pressable`
from `@/ui` if one exists rather than `onTouchEnd`.

- [ ] **Step 2: Build the creation form**

Create `src/features/events/CreateEventForm.tsx`, modelled on
`src/features/goals/CreateGoalForm.tsx` — read it first for the field layout,
validation and error rendering, all of which carry over.

The Event form is **shorter** than the Goal form: kind is `battle` (Adventure is
deferred), metric follows from kind, there is no `requiredDays` and no
`requiredMembers`. It asks for exactly three things — a name, a window, and a
difficulty — and computes the fourth:

```tsx
  const history = useSquadKcalHistory(squadId);

  // The target is SNAPSHOTTED here, at creation, and never recomputed
  // (deviation #49). This is the deliberate asymmetry with a Challenge, whose
  // target is derived on every read: a boss whose HP rose because the squad got
  // fitter mid-fight would silently re-grade every day already counted.
  //
  // `history.data` is undefined while the query is in flight, and the form's
  // submit button must be disabled until it resolves — creating with a
  // fallback of 0 would apply the floor and set a boss far easier than the
  // squad's own history warrants, permanently, with nothing to notice.
  const target = history.data === undefined
    ? undefined
    : bossHp({
        pooledMedianDaily: history.data,
        windowDays: windowLength,
        members: memberCount,
        difficulty,
      });
```

Show the computed HP on the form before submitting, with the sentence *"Set from
your squad's last two weeks, so it moves as you do."* — the same sentence
`challenge-copy.ts` uses for the same reason, and it is what makes a snapshotted
number legible rather than arbitrary.

Difficulty is three buttons labelled **Skirmish**, **Standard** and **Raid**,
`standard` preselected. Do not print the multipliers: `EVENT_DIFFICULTIES`'
numbers are the engine's, and 0.85 on a screen invites a squad to reason about
the formula instead of about the fight.

- [ ] **Step 3: Build the panel and the routes**

Create `src/features/events/SquadEventPanel.tsx`, modelled on
`SquadGoalPanel.tsx`. It renders the squad's live Battle as a `BattleCard`, or a
"Start a battle" call to action when there is none.

**Delete its disclosure gate.** `SquadGoalPanel` reads `useDisclosure`; an Event
is a squad's shared thing and gating it on one member's scored-day count would
hide from a new member something the rest of the squad is already looking at.
Record that in the deviation row.

Create `app/event/[id].tsx` and `app/event/new.tsx` by copying `app/goal/[id].tsx`
and `app/goal/new.tsx` and adapting them. Keep three things exactly as the goal
routes had them:
- the `useFocusEffect` / `setNavHidden(true)` pair **with its cleanup** — the
  cleanup is the load-bearing half;
- the groupless placement, which is what the `ready` denylist permits;
- `today` derived from `profiles.timezone` and passed down, never read from the
  clock inside a component.

**Delete the `resolved && stage === 'core'` redirect from `/event/new`** for the
`SquadEventPanel` reason above.

- [ ] **Step 4: Remove the goal surfaces**

```bash
git rm src/features/goals/GoalCard.tsx src/features/goals/GoalBar.tsx \
       src/features/goals/CreateGoalForm.tsx src/features/goals/SquadGoalPanel.tsx \
       "app/goal/[id].tsx" app/goal/new.tsx
rmdir src/features/goals app/goal
```

In `app/(tabs)/index.tsx`, delete the `<GoalCard …>` block and its
`disclosure.stage === 'full'` wrapper. The Battle lives on the Squad tab, not on
the character screen — a squad's shared fight belongs where the squad is.

Then fix the `core` disclosure note, which plan 3 left saying "your full stat
breakdown" and which is now exactly right — check it says nothing about goals.
If plan 3 has not landed, it still says "goals, challenges and your full stat
breakdown"; change it to name only the stat breakdown.

In `app/(tabs)/squad.tsx`, render `<SquadEventPanel squadId={…} />` below the
board (and below plan 1's `RaceTrack`, if it has landed).

- [ ] **Step 5: Fix the permission asks**

`app/(tabs)/_layout.tsx` mounts `useMyGoals` purely to pass `hasGoal` to
`PermissionAsks`. Replace it:

```tsx
import { useSquadEvents } from '@/features/events/queries.ts';
```

```tsx
  const squad = useMySquad(session?.user.id);
  const events = useSquadEvents(squad.data?.id);
```

```tsx
      <PermissionAsks
        userId={session?.user.id}
        hasSquad={Boolean(squad.data)}
        hasEvent={(events.data ?? []).length > 0}
      />
```

Rename `hasGoal` to `hasEvent` in `PermissionAsks.tsx` and in
`src/features/permissions/ask-order.ts`, and update
`ask-order.test.ts`'s assertions. The *ordering rule* does not change — an
Event is the same kind of signal a Goal was: evidence the user has committed to
something and is therefore worth asking for notifications.

- [ ] **Step 6: Typecheck and run everything**

```bash
npm run typecheck
npm test
```

Expected: both PASS. This is the commit where the tree becomes green again after
Task 5 deliberately left it red.

- [ ] **Step 7: Verify by hand**

```bash
npm run ios
xcrun simctl ui booted content_size accessibility-extra-extra-extra-large
# relaunch before screenshotting — RN caches text measurements
xcrun simctl io booted screenshot /tmp/battle-xxxl.png
```

With two real accounts in one squad, confirm:
- Creating a Battle shows a computed HP before submitting, and the submit button
  is disabled until the history query resolves.
- A second Battle is refused with the sentence, not the constraint name.
- Both members see the same card with the same numbers.
- The bar moves when either member syncs — pooled, not per-member.
- No text is clipped at XXXL and the difficulty buttons stack rather than
  overflowing.
- Tapping the card opens `/event/<id>` and the orbit nav is covered, then
  returns when you go back.

Open the Accessibility Inspector and confirm the Battle card is **one** element.

- [ ] **Step 8: Commit**

```bash
git add src app "app/(tabs)"
git commit -m "feat(events): the Battle, on the Squad tab, replacing Goals"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`
- Modify: `docs/mvp-scope.md`
- Modify: `docs/user-journey.md`
- Modify: `docs/legal/privacy-policy.md`

Documentation updates are part of the change, not a follow-up.

- [ ] **Step 1: Add deviations #45, #48 and #49**

In `docs/roadmap.md`'s approved-deviations table, add three rows in the table's
existing style — what the spec said, what was built, and *why*, at length.

**#45 — Goals removed at the surface; `goals` reshaped into `challenge_events`.**
Record the reshape-not-drop reasoning (RLS, column grants, the XP rollup and the
erasure triggers all survive, and the erasure path is not worth reopening), and
record **the `closed_at` refinement in full**: spec §9 keeps banked goal XP,
a completion's FK holds its goal row alive, that row's `kind` is `cumulative`,
and the new checks are therefore written
`check (closed_at is not null or kind in ('battle','adventure'))` — a validated
constraint rather than `NOT VALID`, because an unvalidated constraint is a trap
for the next reader. Note that every read filters `closed_at is null` and that
`challenge_events_one_live_per_kind` is a partial unique index over the same
column. Note also that `create_goal` was dropped **by exact argument list** (ten
parameters) and that `can_see_goal` had **two**, not one.

**#48 — Events are pooled, reversing squad goals' per-member N-of-M.** Record
that `required_days` and `required_members` are dropped with their
biconditionals, that `planEventCompletions` pays **every participant on the
frozen roster** when the pooled bar is met including a non-contributor, and that
this is the mechanic rather than an oversight: pooled means the strong member
carries, and paying only contributors rebuilds the rule the pivot removed.
Record the two operational traps: `pooledDays()` must take each date **once**,
because `event_progress()` repeats the pooled figure on every participant's row;
and `daysUnresolved` counts distinct **dates**, not rows, or a six-person squad's
first day reads as six finalized days.

**#49 — Event targets are snapshotted at creation, unlike Challenge targets.**
Record the asymmetry and its reasoning at length, because "why is this one
derived and that one stored" is the question the next reader will have: a
Challenge derives fresh on every read and nothing stateful exists for a revision
to invalidate, while an Event inherits §8's Goal invariant — a target that moves
mid-window silently re-grades every day already counted, which is why a
Challenge had to be a sibling concept rather than a `GoalKind` in the first
place. Record that **the client computes the number and the server stores it
verbatim**, that this is the one place a client decides a stored figure, and why
it was accepted (reimplementing the median in plpgsql is a second implementation
needing a differential test — exactly what deviation #18 declined to pay — and
the exposure is a squad setting an easy boss for itself). Record `bossHp`'s
floor and why it exists: a pooled median of 0 means a boss defeated in the same
second it is created.

Also record, under #47 or #45 as fits: **`event_progress()`'s `value` column is
behind plan 1's reciprocal consent gate and `pooled_value` is not**, with the
two-person inversion named as a known limit.

Numbers #44, #46, #47, #50, #51 and #52 belong to the other four plans. Do not
claim them here.

- [ ] **Step 2: Update `CLAUDE.md`**

The existing Goals block (the 2026-08-17 "Goals gained a second metric" one) is
now almost entirely stale. **Replace it** with a dated Events block:

- **Goals became Events on 2026-08-25** (deviations #45, #48, #49). `goals` is
  `challenge_events`, `goal_participants` is `event_participants`,
  `goal_completions` is `event_completions`. `create_goal()`,
  `abandon_goal()`, `goal_window_scores()` and `can_see_goal()` are dropped.
- **`closed_at is null` is not optional on any read.** The table still holds
  every pre-pivot Goal row so banked XP does not vanish; the `kind` and `metric`
  checks are conditional on `closed_at`, and omitting the filter renders a
  points goal as a Battle.
- **An Event's target is snapshotted at creation; a Challenge's is derived on
  every read.** Both comments say so, and the asymmetry is deviation #49.
  Progress stays a read-time projection, so revisions still replay — the
  *target* is fixed, the *progress* is replayed.
- **Pooled means every roster member is paid**, contributor or not.
- **`pooledDays()` takes each date once.** `event_progress()` repeats
  `pooled_value` on every participant's row; summing it multiplies the day by
  the squad size.
- **`recalculate_user_xp` is a full recompute written out whole** and both this
  plan and the quests plan rewrite it. Read the deployed body before editing.
- **`goal_completed` survives as a notification trigger and routes to `/`.**
  `notification_log.kind` is free text, historical rows say it, and a push sent
  before the deploy can be tapped after it.

Also fix the two older CLAUDE.md paragraphs that name goal surfaces: the
disclosure block lists `GoalCard`, `/goal/new` and `SquadGoalPanel` as gated —
none of those exist, and Events are ungated.

- [ ] **Step 3: Update `docs/mvp-scope.md`**

Goals are OUT. Battle is IN; **Adventure is OUT with its stated reason** (same
engine as Battle, ship after the engine is proven live). Add the vocabulary row:
say **Event**, and **Challenge** only for `/train`.

- [ ] **Step 4: Update `docs/user-journey.md`**

The squad flow no longer has a goal. Rewrite the walkthrough so a squad's shared
commitment is a Battle created from the Squad tab, and remove the personal-goal
path entirely — there is no personal Event.

- [ ] **Step 5: Update the privacy policy**

`event_progress()` projects a member's raw active calories to squadmates behind
the consent gate, and the pooled figure unconditionally. If
`docs/legal/privacy-policy.md` claims squadmates reach only scores, that claim is
now false, and **a stale privacy claim is the worst kind**. Name the pooled
disclosure and the two-person inversion.

- [ ] **Step 6: Run everything and commit**

```bash
npm test
npm run typecheck
git add docs/ CLAUDE.md
git commit -m "docs: record Events, pooling and the snapshotted boss target"
```

Expected: both PASS. If `npm test` fails, fix the code — not the test.

---

## Definition of done

- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes (all three checks — tsc, workspace tsc, deno check).
- [ ] `node supabase/scripts/smoke-sync.mjs` passes against the deployed `finalize-days`.
- [ ] `./supabase/scripts/remote-sql.sh "select oid::regprocedure from pg_proc where proname like '%goal%'"` returns nothing.
- [ ] `./supabase/scripts/remote-sql.sh "select oid::regprocedure from pg_proc where proname in ('create_event','event_progress','can_see_event','abandon_event')"` returns exactly four rows, one each.
- [ ] `./supabase/scripts/remote-sql.sh "select prosrc from pg_proc where proname = 'recalculate_user_xp'"` names `daily_scores` and `event_completions` (and `quest_completions` if plan 3 landed).
- [ ] No account's `total_xp` fell: compare `select id, total_xp from profiles order by id` before and after applying the migration.
- [ ] `grep -rn "goal" src app packages --include="*.ts" --include="*.tsx" -i` returns only the deliberate historical mentions — the `goal_completed` notification trigger and the comments explaining it.
- [ ] Two real accounts in one squad see the same Battle card with the same pooled figure, and the bar moves when either one syncs.
- [ ] Xcode's Accessibility Inspector reports the Battle card as **one** element.
- [ ] A screenshot at `accessibility-extra-extra-extra-large`, taken after a relaunch, shows the creation form's difficulty buttons stacked rather than overflowing.

# Three-Stat Model, Phase 1: Engine Primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add every new scoring decision the three-stat model needs as pure,
tested functions in `@kairo/core`, without touching the `CoreStat` union — so
the repository stays green and every subtle rule is pinned by tests before
anything is wired up.

**Architecture:** Four new zero-dependency modules in `packages/kairo-core/src/`.
Each takes primitives (numbers, strings, booleans) and returns primitives. None
of them import `CoreStat`, `CORE_STATS`, or anything from `scoring.ts`, because
changing that union is Phase 2's job and would break every consumer at once.
Nothing in this phase is called by `computeDailyScore` yet. That is deliberate:
this phase is worthless to users and extremely valuable to Phase 2, which
becomes a wiring exercise over logic that is already proven.

**Tech Stack:** TypeScript (strict), Vitest, no runtime dependencies. Imports
use explicit `.ts` extensions, which Deno requires and Vite/Metro both accept.

**Spec:** `docs/superpowers/specs/2026-08-18-three-stat-attribute-model-design.md`

## Global Constraints

- **`packages/kairo-core` takes no dependencies, ever.** Pure TypeScript: no
  I/O, no clock reads, no randomness. Every function takes what it needs as an
  argument.
- **Do not add a second implementation of scoring.** These are new primitives,
  not a parallel engine. Nothing here duplicates `tierFor`, `recBonusFor` or
  `computeDailyScore` — those stay untouched and authoritative until Phase 2.
- **Imports use explicit `.ts` extensions** (e.g. `from './types.ts'`).
- **Every new module is exported from `packages/kairo-core/src/index.ts`.**
- **Tier bands (verbatim from spec §2):** `MND` Bronze 5h, Silver 6h, Gold 7h;
  above 9h scores **Bronze, never none**.
- **Shift rules (verbatim from spec §2):** AGI — each active hour beyond 3
  lowers bands by 5%, capped at 25%. STR — each 12 verified exercise minutes
  lowers bands by 5%, capped at 25% (reached at 60 minutes).
- **Normalization (verbatim from spec §2):** a day's stat points scale by
  `3 / earnable stats`.
- **Capability window (verbatim from spec §3):** MND counts toward earnable
  stats if trusted sleep data arrived in the **last 14 days**.
- **Trust layers (verbatim from spec §3):** user-entered is discarded;
  allowlisted bundle id scores normally; unknown-but-not-user-entered **scores,
  and sets `flagged`** — never rejected.
- Run the core suite with `npm run test:core`. A single file:
  `npm run test:core -- --run src/<file>.test.ts`.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/kairo-core/src/mind.ts` | MND's tier bands, including the oversleep floor |
| `packages/kairo-core/src/mind.test.ts` | Tests for the above |
| `packages/kairo-core/src/shifts.ts` | Threshold shifts for AGI (spread) and STR (workout), and the shift application |
| `packages/kairo-core/src/shifts.test.ts` | Tests for the above |
| `packages/kairo-core/src/capability.ts` | How much of the game a user can play: the 14-day sleep capability window, earnable stat count, normalization factor |
| `packages/kairo-core/src/capability.test.ts` | Tests for the above |
| `packages/kairo-core/src/trust.ts` | Three-way trust verdict over a sample's origin metadata, shared by sleep and workouts |
| `packages/kairo-core/src/trust.test.ts` | Tests for the above |
| `packages/kairo-core/src/index.ts` | Modify: export the four new modules |

---

### Task 1: MND tier bands

**Files:**
- Create: `packages/kairo-core/src/mind.ts`
- Test: `packages/kairo-core/src/mind.test.ts`
- Modify: `packages/kairo-core/src/index.ts`

**Interfaces:**
- Consumes: `Tier` from `./types.ts` (existing:
  `'none' | 'bronze' | 'silver' | 'gold'`)
- Produces: `mindTierFor(sleepMinutes: number): Tier`,
  `MIND_THRESHOLD_HOURS: { bronze: number; silver: number; gold: number }`,
  `MIND_OVERSLEEP_HOURS: number`

- [ ] **Step 1: Write the failing test**

Create `packages/kairo-core/src/mind.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { MIND_OVERSLEEP_HOURS, MIND_THRESHOLD_HOURS, mindTierFor } from './mind.ts';

const hours = (h: number): number => h * 60;

describe('mindTierFor', () => {
  it('scores nothing below the bronze band', () => {
    expect(mindTierFor(hours(0))).toBe('none');
    expect(mindTierFor(hours(4.9))).toBe('none');
  });

  it('scores each band at its exact boundary', () => {
    expect(mindTierFor(hours(5))).toBe('bronze');
    expect(mindTierFor(hours(6))).toBe('silver');
    expect(mindTierFor(hours(7))).toBe('gold');
  });

  it('scores the middle of each band', () => {
    expect(mindTierFor(hours(5.5))).toBe('bronze');
    expect(mindTierFor(hours(6.5))).toBe('silver');
    expect(mindTierFor(hours(8))).toBe('gold');
  });

  // Nine hours is still a good night. The old recBonusFor paid its top figure
  // for `hrs <= 9`, and the tier boundary has to land in the same place or a
  // replayed day silently changes meaning.
  it('still scores gold at exactly nine hours', () => {
    expect(mindTierFor(hours(9))).toBe('gold');
  });

  // Oversleep flattens to bronze and never to none. MND is a promoted bonus:
  // spec §2 says "Bronze, never none", because a stat that punishes a long
  // night is a stat that punishes illness, jet lag and recovery.
  it('flattens oversleep to bronze rather than zero', () => {
    expect(mindTierFor(hours(9.1))).toBe('bronze');
    expect(mindTierFor(hours(12))).toBe('bronze');
    expect(mindTierFor(hours(24))).toBe('bronze');
  });

  it('treats a negative reading as no data rather than throwing', () => {
    expect(mindTierFor(-1)).toBe('none');
  });

  it('publishes its bands so nothing restates them', () => {
    expect(MIND_THRESHOLD_HOURS).toEqual({ bronze: 5, silver: 6, gold: 7 });
    expect(MIND_OVERSLEEP_HOURS).toBe(9);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test:core -- --run src/mind.test.ts`
Expected: FAIL — `Failed to resolve import "./mind.ts"`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/kairo-core/src/mind.ts`:

```typescript
import type { Tier } from './types.ts';

/**
 * MND's tier bands, in hours of attributed sleep.
 *
 * Promoted from the REC bonus (roadmap deviation #41). The figures are a
 * public-health range, not a personal one: spec §2 chose fixed bands over a
 * rolling personal baseline because a leaderboard cannot explain why Gold
 * means something different for the person above you.
 */
export const MIND_THRESHOLD_HOURS = {
  bronze: 5,
  silver: 6,
  gold: 7,
} as const;

/**
 * Above this, the night flattens to Bronze — never to none.
 *
 * `recBonusFor` already paid less above nine hours (200, against 500 for a
 * healthy night), so the shape is inherited rather than invented. What must
 * not be inherited is a zero: MND is a promoted *bonus*, and a stat that pays
 * nothing for a twelve-hour night punishes illness, jet lag and recovery — the
 * exact behaviours the stat exists to reward.
 */
export const MIND_OVERSLEEP_HOURS = 9;

export function mindTierFor(sleepMinutes: number): Tier {
  const hrs = sleepMinutes / 60;
  if (hrs > MIND_OVERSLEEP_HOURS) return 'bronze';
  if (hrs >= MIND_THRESHOLD_HOURS.gold) return 'gold';
  if (hrs >= MIND_THRESHOLD_HOURS.silver) return 'silver';
  if (hrs >= MIND_THRESHOLD_HOURS.bronze) return 'bronze';
  return 'none';
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm run test:core -- --run src/mind.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Export the module**

In `packages/kairo-core/src/index.ts`, add after the existing
`export * from './strain.ts';` line:

```typescript
export * from './mind.ts';
```

- [ ] **Step 6: Verify the whole core suite and types are still green**

Run: `npm run test:core && npm run typecheck`
Expected: PASS. Nothing else imports `mind.ts` yet, so no existing test changes.

- [ ] **Step 7: Commit**

```bash
git add packages/kairo-core/src/mind.ts packages/kairo-core/src/mind.test.ts packages/kairo-core/src/index.ts
git commit -m "feat(core): MND tier bands, with oversleep flattening to bronze

Promoted from the REC bonus per deviation #41. Nothing calls this yet;
Phase 2 wires it into computeDailyScore.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Threshold shifts for AGI and STR

**Files:**
- Create: `packages/kairo-core/src/shifts.ts`
- Test: `packages/kairo-core/src/shifts.test.ts`
- Modify: `packages/kairo-core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `spreadShift(activeHours: number): number`,
  `workoutShift(verifiedMinutes: number): number`,
  `shiftedThreshold(threshold: number, shift: number): number`,
  `MAX_THRESHOLD_SHIFT: number`, `SPREAD_SHIFT_FLOOR_HOURS: number`,
  `WORKOUT_SHIFT_MINUTES_PER_STEP: number`.
  Shifts are returned as a **fraction** (`0.25` means "bands are 25% lower").

- [ ] **Step 1: Write the failing test**

Create `packages/kairo-core/src/shifts.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  MAX_THRESHOLD_SHIFT,
  shiftedThreshold,
  spreadShift,
  workoutShift,
} from './shifts.ts';

describe('spreadShift', () => {
  // VIT's old bronze band was 3 active hours. Below it, nothing is earned —
  // the shift is VIT's ladder expressed as generosity, so it starts where
  // VIT started.
  it('gives nothing at or below three active hours', () => {
    expect(spreadShift(0)).toBe(0);
    expect(spreadShift(3)).toBe(0);
  });

  it('gives five percent per active hour beyond three', () => {
    expect(spreadShift(4)).toBeCloseTo(0.05);
    expect(spreadShift(6)).toBeCloseTo(0.15);
  });

  it('caps at twenty-five percent', () => {
    expect(spreadShift(8)).toBeCloseTo(MAX_THRESHOLD_SHIFT);
    expect(spreadShift(24)).toBeCloseTo(MAX_THRESHOLD_SHIFT);
  });

  // Active hours are whole hours by construction (aggregateBuckets counts
  // buckets), but the function must not pay a partial hour if that ever changes.
  it('does not pay for a partial hour', () => {
    expect(spreadShift(4.9)).toBeCloseTo(0.05);
  });

  it('treats a negative reading as none rather than a negative shift', () => {
    expect(spreadShift(-5)).toBe(0);
  });
});

describe('workoutShift', () => {
  it('gives nothing without verified minutes', () => {
    expect(workoutShift(0)).toBe(0);
    expect(workoutShift(11)).toBe(0);
  });

  it('gives five percent per twelve verified minutes', () => {
    expect(workoutShift(12)).toBeCloseTo(0.05);
    expect(workoutShift(36)).toBeCloseTo(0.15);
  });

  // Sixty minutes was END's old gold band. The cap lands there on purpose.
  it('caps at twenty-five percent, reached at sixty minutes', () => {
    expect(workoutShift(60)).toBeCloseTo(MAX_THRESHOLD_SHIFT);
    expect(workoutShift(600)).toBeCloseTo(MAX_THRESHOLD_SHIFT);
  });

  it('treats a negative reading as none', () => {
    expect(workoutShift(-30)).toBe(0);
  });
});

describe('shiftedThreshold', () => {
  // The headline example from spec §2: a fully spread day reaches AGI gold at
  // 7,500 steps instead of 10,000.
  it('lowers a band by the shift', () => {
    expect(shiftedThreshold(10_000, 0.25)).toBe(7_500);
    expect(shiftedThreshold(400, 0.25)).toBe(300);
  });

  it('returns the band unchanged when there is no shift', () => {
    expect(shiftedThreshold(10_000, 0)).toBe(10_000);
  });

  it('returns whole units, because thresholds are compared against raw counts', () => {
    expect(Number.isInteger(shiftedThreshold(1_000, 0.15))).toBe(true);
    expect(shiftedThreshold(1_000, 0.15)).toBe(850);
  });

  // A shift can only ever make a band easier. Guarding here rather than at
  // every call site keeps the invariant in one place.
  it('never raises a band, whatever it is handed', () => {
    expect(shiftedThreshold(10_000, -1)).toBe(10_000);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test:core -- --run src/shifts.test.ts`
Expected: FAIL — `Failed to resolve import "./shifts.ts"`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/kairo-core/src/shifts.ts`:

```typescript
/**
 * Threshold shifts — how END and VIT survive the three-stat model.
 *
 * **Shifts, deliberately, and never point multipliers.** A stored multiplier
 * stacks with the squad program's read-time weight, which is exactly why
 * deviation #10 pulled the featured-stat rotation out of stored scoring: an
 * AGI week in a running squad scored 2.25x. A stored spread multiplier would
 * rebuild that trap at 3x. Making the *band* easier cannot stack, and it is
 * easier to say out loud — moving all day makes Gold arrive sooner, rather
 * than making Gold worth more.
 */

/** No shift may exceed this, whatever the inputs. */
export const MAX_THRESHOLD_SHIFT = 0.25;

const SHIFT_STEP = 0.05;

/** VIT's old bronze band. Below it, spreading has earned nothing. */
export const SPREAD_SHIFT_FLOOR_HOURS = 3;

/** Twelve minutes per step puts the cap at sixty — END's old gold band. */
export const WORKOUT_SHIFT_MINUTES_PER_STEP = 12;

function capped(steps: number): number {
  return Math.min(MAX_THRESHOLD_SHIFT, Math.max(0, steps) * SHIFT_STEP);
}

/** VIT's signal: how much of the day carried movement. */
export function spreadShift(activeHours: number): number {
  return capped(Math.floor(activeHours) - SPREAD_SHIFT_FLOOR_HOURS);
}

/**
 * END's signal: how much verified exercise the day carried.
 *
 * "Verified" is the caller's problem — an unverified session contributes zero
 * minutes here, so a hand-typed workout shifts nothing. See `trust.ts`.
 */
export function workoutShift(verifiedMinutes: number): number {
  return capped(Math.floor(Math.max(0, verifiedMinutes) / WORKOUT_SHIFT_MINUTES_PER_STEP));
}

/**
 * Applies a shift to one tier band.
 *
 * Clamps at zero so a shift can only ever make a band easier — the invariant
 * lives here rather than at every call site.
 */
export function shiftedThreshold(threshold: number, shift: number): number {
  const applied = Math.min(MAX_THRESHOLD_SHIFT, Math.max(0, shift));
  return Math.round(threshold * (1 - applied));
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm run test:core -- --run src/shifts.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Export the module**

In `packages/kairo-core/src/index.ts`, add after the `./mind.ts` export:

```typescript
export * from './shifts.ts';
```

- [ ] **Step 6: Verify the whole core suite and types are still green**

Run: `npm run test:core && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/kairo-core/src/shifts.ts packages/kairo-core/src/shifts.test.ts packages/kairo-core/src/index.ts
git commit -m "feat(core): threshold shifts carrying END and VIT's signals

Shifts rather than multipliers, so nothing can stack with a squad
program's read-time weight (the trap deviation #10 documented).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Capability window and normalization

**Files:**
- Create: `packages/kairo-core/src/capability.ts`
- Test: `packages/kairo-core/src/capability.test.ts`
- Modify: `packages/kairo-core/src/index.ts`

**Interfaces:**
- Consumes: `addDays(localDate: string, days: number): string` from `./day.ts`
  (existing).
- Produces:
  `hasSleepCapability(trustedSleepDates: readonly string[], today: string): boolean`,
  `earnableStats(hasSleep: boolean): number`,
  `normalizationFactor(earnable: number, totalStats: number): number`,
  `SLEEP_CAPABILITY_WINDOW_DAYS: number`.

**Note for the implementer:** `normalizationFactor` takes `totalStats` as an
argument rather than reading `CORE_STATS.length`. That is not an oversight —
this phase must not import the `CoreStat` union, which Phase 2 changes from
four members to three. Phase 2 passes `CORE_STATS.length` at the call site.

- [ ] **Step 1: Write the failing test**

Create `packages/kairo-core/src/capability.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  SLEEP_CAPABILITY_WINDOW_DAYS,
  earnableStats,
  hasSleepCapability,
  normalizationFactor,
} from './capability.ts';

describe('hasSleepCapability', () => {
  it('is false when no trusted sleep has ever arrived', () => {
    expect(hasSleepCapability([], '2026-08-18')).toBe(false);
  });

  it('is true when sleep arrived today', () => {
    expect(hasSleepCapability(['2026-08-18'], '2026-08-18')).toBe(true);
  });

  // The whole point of the window: one missed night must change nothing, or
  // the model punishes a flat battery.
  it('is true when the most recent night was a week ago', () => {
    expect(hasSleepCapability(['2026-08-11'], '2026-08-18')).toBe(true);
  });

  it('includes the fourteenth day and excludes the fifteenth', () => {
    expect(SLEEP_CAPABILITY_WINDOW_DAYS).toBe(14);
    expect(hasSleepCapability(['2026-08-05'], '2026-08-18')).toBe(true);
    expect(hasSleepCapability(['2026-08-04'], '2026-08-18')).toBe(false);
  });

  // Someone who abandons a wearable stops being a three-stat user, rather
  // than being divided by three forever with MND stuck at zero. That is the
  // failure mode profiles.has_wearable has, being deliberately sticky.
  it('is false once the wearable has been unused for a fortnight', () => {
    expect(hasSleepCapability(['2026-07-01', '2026-07-20'], '2026-08-18')).toBe(false);
  });

  it('ignores dates in the future', () => {
    expect(hasSleepCapability(['2026-09-01'], '2026-08-18')).toBe(false);
  });
});

describe('earnableStats', () => {
  it('counts three stats for a user with sleep capability', () => {
    expect(earnableStats(true)).toBe(3);
  });

  it('counts two stats for a phone-only user', () => {
    expect(earnableStats(false)).toBe(2);
  });
});

describe('normalizationFactor', () => {
  it('leaves a three-stat user unscaled', () => {
    expect(normalizationFactor(3, 3)).toBeCloseTo(1);
  });

  // Spec §2's parity arithmetic: (2 x 1,200) x 1.5 + 800 = 4,400, which is
  // exactly a wearable user's (3 x 1,200) x 1.0 + 800.
  it('scales a phone-only user up by half', () => {
    expect(normalizationFactor(2, 3)).toBeCloseTo(1.5);
  });

  it('closes the ceiling gap between the two', () => {
    const phoneOnly = 2 * 1_200 * normalizationFactor(2, 3) + 800;
    const wearable = 3 * 1_200 * normalizationFactor(3, 3) + 800;
    expect(phoneOnly).toBeCloseTo(wearable);
    expect(phoneOnly).toBeCloseTo(4_400);
  });

  it('never divides by zero', () => {
    expect(normalizationFactor(0, 3)).toBe(1);
    expect(normalizationFactor(-1, 3)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test:core -- --run src/capability.test.ts`
Expected: FAIL — `Failed to resolve import "./capability.ts"`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/kairo-core/src/capability.ts`:

```typescript
import { addDays } from './day.ts';

/**
 * How much of the game a user can play, and what that does to their score.
 *
 * MND is the only stat that can be unreachable — it needs a trusted sleep
 * source. Left alone, that would make a wearable worth 27% of the daily
 * ceiling and a permanent leaderboard gradient, which lands hardest on the
 * users least likely to own one. So a day's stat points scale by
 * `total stats / earnable stats` (spec §2), and a wearable buys a third route
 * to the same ceiling rather than a higher one.
 */

/**
 * Trusted sleep inside this trailing window makes MND earnable.
 *
 * **Both obvious alternatives are traps, and both were found in design.**
 * Keying off *today's* data inverts the incentive: skip tracking tonight, be
 * normalized as a two-stat user, and score more for sleeping less. Keying off
 * `profiles.has_wearable` fails the other way, because that flag is
 * deliberately sticky — someone who abandons a wearable would be divided by
 * three forever with MND stuck at zero, punished twice for one thing.
 *
 * A fortnight is long enough that one missed night is invisible, and short
 * enough that abandoning a wearable is noticed. Gaming it costs fourteen
 * nights of untracked sleep to buy a normalization bump worth far less.
 */
export const SLEEP_CAPABILITY_WINDOW_DAYS = 14;

/**
 * `trustedSleepDates` are local dates (`YYYY-MM-DD`) on which trusted sleep
 * data arrived. Untrusted nights must not be passed here — see `trust.ts`.
 * Lexicographic comparison is exact for this format.
 */
export function hasSleepCapability(
  trustedSleepDates: readonly string[],
  today: string,
): boolean {
  const windowStart = addDays(today, -(SLEEP_CAPABILITY_WINDOW_DAYS - 1));
  return trustedSleepDates.some((date) => date >= windowStart && date <= today);
}

export function earnableStats(hasSleep: boolean): number {
  return hasSleep ? 3 : 2;
}

/**
 * `totalStats` is passed in rather than read from `CORE_STATS.length` so this
 * module never imports the `CoreStat` union. Phase 2 changes that union from
 * four members to three; this file must not need editing when it does.
 */
export function normalizationFactor(earnable: number, totalStats: number): number {
  if (earnable <= 0) return 1;
  return totalStats / earnable;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm run test:core -- --run src/capability.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Export the module**

In `packages/kairo-core/src/index.ts`, add after the `./shifts.ts` export:

```typescript
export * from './capability.ts';
```

- [ ] **Step 6: Verify the whole core suite and types are still green**

Run: `npm run test:core && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/kairo-core/src/capability.ts packages/kairo-core/src/capability.test.ts packages/kairo-core/src/index.ts
git commit -m "feat(core): sleep capability window and score normalization

A 14-day trailing window decides whether MND is earnable, because both
obvious alternatives invert the incentive or punish twice. Normalization
closes the wearable ceiling gap at 4,400 either way.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Sample trust verdict

**Files:**
- Create: `packages/kairo-core/src/trust.ts`
- Test: `packages/kairo-core/src/trust.test.ts`
- Modify: `packages/kairo-core/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type SampleTrust = 'trusted' | 'flagged' | 'rejected'`,
  `interface SampleOrigin { wasUserEntered: boolean; sourceBundleId: string | null }`,
  `sampleTrust(origin: SampleOrigin, allowlist: readonly string[]): SampleTrust`,
  `scoresAtAll(trust: SampleTrust): boolean`.

**Note for the implementer:** the allowlist itself is **not** defined here. It
lives server-side in the Edge Function (spec §3) so it can change without an app
release, and so a forged client cannot promote itself past a list it does not
hold. This module only decides, given a list.

- [ ] **Step 1: Write the failing test**

Create `packages/kairo-core/src/trust.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { sampleTrust, scoresAtAll } from './trust.ts';

const ALLOWLIST = ['com.apple.health.watch', 'com.ouraring.oura', 'com.northcube.sleepcycle'];

describe('sampleTrust', () => {
  // Layer one. Apple flags its own manual-entry path, and the spike confirmed
  // HKWasUserEntered is typed on sleep samples today. This is what makes the
  // trivial cheat — open Health, type "9h" — cost nothing to catch.
  it('rejects anything the user typed in, whatever wrote it', () => {
    expect(sampleTrust({ wasUserEntered: true, sourceBundleId: null }, ALLOWLIST)).toBe('rejected');
    expect(
      sampleTrust({ wasUserEntered: true, sourceBundleId: 'com.ouraring.oura' }, ALLOWLIST),
    ).toBe('rejected');
  });

  it('trusts a sensor source on the allowlist', () => {
    expect(
      sampleTrust({ wasUserEntered: false, sourceBundleId: 'com.ouraring.oura' }, ALLOWLIST),
    ).toBe('trusted');
  });

  // Layer three. A legitimate but obscure sleep app scoring zero is
  // indistinguishable from Kairo being broken, and `flagged` is already
  // documented as social-only — never a ban, never a score reduction (§20).
  it('flags an unknown source rather than rejecting it', () => {
    expect(
      sampleTrust({ wasUserEntered: false, sourceBundleId: 'com.unknown.sleepapp' }, ALLOWLIST),
    ).toBe('flagged');
  });

  it('flags a sample with no source at all', () => {
    expect(sampleTrust({ wasUserEntered: false, sourceBundleId: null }, ALLOWLIST)).toBe('flagged');
  });

  it('flags everything when the allowlist is empty', () => {
    expect(sampleTrust({ wasUserEntered: false, sourceBundleId: 'com.ouraring.oura' }, [])).toBe(
      'flagged',
    );
  });

  it('matches bundle ids exactly, never by prefix', () => {
    expect(
      sampleTrust({ wasUserEntered: false, sourceBundleId: 'com.ouraring.oura.fake' }, ALLOWLIST),
    ).toBe('flagged');
  });
});

describe('scoresAtAll', () => {
  it('scores trusted and flagged samples, and only discards rejected ones', () => {
    expect(scoresAtAll('trusted')).toBe(true);
    expect(scoresAtAll('flagged')).toBe(true);
    expect(scoresAtAll('rejected')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test:core -- --run src/trust.test.ts`
Expected: FAIL — `Failed to resolve import "./trust.ts"`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/kairo-core/src/trust.ts`:

```typescript
/**
 * Three-way trust verdict over a health sample's origin, shared by sleep and
 * workouts (spec §3).
 *
 * **The allowlist is not here on purpose.** It lives server-side in the Edge
 * Function, so it can change without an app release and so a forged client
 * cannot promote itself past a list it does not hold. The client sends the
 * bundle identifier and the user-entered flag; the server decides. Same
 * arrangement `profiles.has_wearable` already uses — capability observed from
 * data, never asserted.
 */

export type SampleTrust = 'trusted' | 'flagged' | 'rejected';

export interface SampleOrigin {
  /** Apple's `HKWasUserEntered` metadata, as read off the sample. */
  wasUserEntered: boolean;
  /** `sourceRevision.source.bundleIdentifier`, or null if absent. */
  sourceBundleId: string | null;
}

export function sampleTrust(
  origin: SampleOrigin,
  allowlist: readonly string[],
): SampleTrust {
  if (origin.wasUserEntered) return 'rejected';
  if (origin.sourceBundleId !== null && allowlist.includes(origin.sourceBundleId)) {
    return 'trusted';
  }
  return 'flagged';
}

/**
 * A flagged sample still scores. `flagged` is a social signal (§20), never a
 * ban and never a score reduction — reading it as "discard" is the mistake
 * this function exists to prevent.
 */
export function scoresAtAll(trust: SampleTrust): boolean {
  return trust !== 'rejected';
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm run test:core -- --run src/trust.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Export the module**

In `packages/kairo-core/src/index.ts`, add after the `./capability.ts` export:

```typescript
export * from './trust.ts';
```

- [ ] **Step 6: Verify the entire suite, not just core**

Run: `npm test && npm run typecheck`
Expected: PASS throughout — core, schema (PGlite), Edge Function planners, and
all three typecheck passes. Nothing in this phase is referenced by
`computeDailyScore`, any migration, or any Edge Function, so no existing test
should change.

- [ ] **Step 7: Commit**

```bash
git add packages/kairo-core/src/trust.ts packages/kairo-core/src/trust.test.ts packages/kairo-core/src/index.ts
git commit -m "feat(core): three-way trust verdict for sleep and workout samples

User-entered is rejected, allowlisted sources are trusted, unknown
sources score and are flagged. The allowlist stays server-side so a
forged client cannot promote itself past it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase exit criteria

- `npm test` and `npm run typecheck` both pass.
- Four new modules exist, each exported from `index.ts`, each with tests.
- **Nothing in `scoring.ts`, `types.ts`, any migration, or any Edge Function has
  been modified.** If any of those files appear in this phase's diff, something
  went wrong — the `CoreStat` union belongs to Phase 2.
- The following spec rules are now pinned by tests rather than by prose: the
  MND oversleep floor, the nine-hour boundary, both shift caps and where they
  land, the 14-day window's inclusive edges, the parity arithmetic at 4,400,
  and that a flagged sample still scores.

## What Phase 2 inherits

Phase 2 (`CoreStat` union change, consumers, migrations 1–3, replay and tuning)
becomes a wiring exercise over proven logic. Specifically it will:

- call `mindTierFor` from a new `rawFor`/`tierFor` branch for `MND`;
- call `spreadShift`/`workoutShift` and pass the result through
  `shiftedThreshold` when reading the `THRESHOLDS` table;
- call `normalizationFactor(earnableStats(hasSleepCapability(...)), CORE_STATS.length)`
  and apply it to stat points before the consistency bonus is added;
- call `sampleTrust` inside `sync-health`, holding the allowlist server-side.

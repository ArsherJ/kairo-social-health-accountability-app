# Living Mirror Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Today’s dashboard stack with one emotionally calm KAIRO scene, one real step reading, one quest-backed next step, and an optional details sheet while keeping all existing scoring, XP, Daily Walk, Challenge, race, and health-ingestion rules intact.

**Architecture:** A pure living-mirror resolver composes three smaller decisions: Motion location/static art, the existing quest set’s visible next step, and one bounded unseen reaction. The Today route remains the I/O boundary: it gathers existing query data plus owner-only records/workouts, passes semantic results to dumb renderers, and keeps the complete three-quest state in a modal details sheet. Static PNG priority is reaction pose → non-neutral Mind state → Motion pose → base; Body uses only ring/shadow presence because the current full-character PNGs cannot compose.

**Tech Stack:** Expo Router, React Native 0.86, React 19, TypeScript 6, TanStack Query, Zustand, MMKV, Supabase, Vitest, `@kairo/core`.

**Spec:** `docs/superpowers/specs/2026-09-01-living-mirror-beta-design.md`

## Global Constraints

- This is the current beta’s static-art implementation; do not add Rive, Reanimated, SVG, blur, another native dependency, or flattened Body × Mind × pose assets.
- Do not change scoring, thresholds, normalization, Mastery, records, quest generation/XP, Daily Walk rules, Challenge rules, health ingestion, database schema, migrations, or Edge Functions.
- Import `DAILY_STEP_BASELINE`; never introduce a literal Daily Walk or race finish value.
- Today may show raw health units, Level, Streak, quest progress, and the Daily Walk run. It must not show score totals, tier names, engine keys, or the Mastery rail/coins.
- Real-world activity counts without opening the app. Do not add a claim action, app-open reward, care meter, decay, guilt, illness, countdown pressure, or scheduled notification.
- Without `has_sleep_source`, omit Mind readings and sleep quests and use neutral Mind presentation. Unknown sleep is never rendered as zero.
- Preserve the exact three quests produced by `todayQuests()`. Show one selected quest on Today and all three states in details; never synthesize or re-grade a quest.
- A Strength Challenge only changes selection priority when `profiles.trains_strength` is true; it never creates a Challenge-specific quest.
- Keep the personal profile Streak and the Daily Walk run separate in name and value.
- Challenges remain gated by `disclosure.stage === 'full'`; hide on `stage`, and keep `/train` navigation guarded by its existing `resolved && stage` rule.
- Use `src/ui/Text.tsx` through `@/ui/index.ts` for every rendered string and preserve explicit `.ts`/`.tsx` import extensions.
- Group accessibility with both halves of the project convention: an accessible parent with a composed label, plus descendants hidden with `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`.
- Telemetry payloads may contain only categories (`motion`, `body`, `none`) and reaction kinds; never raw health figures, quest ids, workout ids, or occurrence ids.
- Preserve user changes in the worktree and use `apply_patch` for manual edits.

---

## File map

### New pure decision modules

- `src/features/quests/next-step.ts` — ranks only the existing three `TodayQuest` entries and writes the visible gentle sentence.
- `src/features/character/living-mirror.ts` — resolves Motion location, Body presence tier, Mind visibility/state, static figure selection, and the composed character label.
- `src/features/train/today-strength-model.ts` — reduces owner-readable workout rows to display-only verified strength minutes and a stable latest identity.
- `src/features/character/living-reaction.ts` — creates same-day candidates, applies priority, and returns one presentation plus all occurrences consumed for that opening.
- `src/features/character/today-details.ts` — formats semantic details sections and accessibility labels without rendering or querying.
- Matching `*.test.ts` files pin every boundary and copy rule.

### New I/O and rendering modules

- `src/features/train/useTodayStrengthSummary.ts` — fetches today’s owner-only workout evidence and calls the pure reducer.
- `src/features/character/useLivingReaction.ts` — reads/writes occurrence markers, freezes one decision per opening, and ends the bounded reaction.
- `src/features/character/MotionScenery.tsx` — decorative location geometry only; it receives a resolved location.
- `src/features/character/TodayNextStep.tsx` — the one visible prompt and details trigger.
- `src/features/character/TodayDetailsSheet.tsx` — bounded accessible bottom sheet over Today; it receives already-resolved rows.
- `src/ui/modal-owner.ts` — mutual exclusion for permission, onboarding-welcome, and Today-detail native modals.

### Existing files changed

- `app/(tabs)/index.tsx` — becomes the thin Today composition/I/O boundary.
- `src/features/character/Diorama.tsx` and `CharacterFigure.tsx` — render supplied location, static figure selection, and Body presence with no health interpretation.
- `src/features/character/TodayHud.tsx` — keeps compact Level/Streak and steps; removes Today’s Mastery coins.
- `src/features/character/SyncStatus.tsx` — can stay silent for a healthy fresh sync inside details.
- `src/features/permissions/PermissionAsks.tsx` and `src/features/onboarding/WelcomePopups.tsx` — share the modal owner so native modals never compete.
- `src/features/character/moments.ts` — replaces the retired first-sync callout marker with fixed-size reaction occurrence/observed-level storage.
- `src/features/telemetry/events.ts` and `daily-marker.ts` — add category-only Living Mirror measurement.
- `src/features/character/KairoLab.tsx` — adds a development-only Living Mirror state matrix for simulator QA.
- `src/features/character/useDisclosure.ts`, `CLAUDE.md`, `docs/roadmap.md`, `docs/user-journey.md`, and `docs/mvp-scope.md` — describe the shipped composition and deviation #59.

### Retired one-consumer Today surfaces

- Delete `src/features/quests/QuestRings.tsx`.
- Delete `src/features/character/TodayTiles.tsx`.
- Delete `src/features/train/DailyWalkCard.tsx`.
- Delete `src/features/train/TrainEntry.tsx`.
- Delete `src/features/squad/RaceLine.tsx`.
- Delete `src/features/character/FirstSyncCallout.tsx`, `first-sync.ts`, and `first-sync.test.ts`.
- Remove the now-unused `useTodaySteps()` query and only the retired `heroSentence`, `sleepLine`, and `laneLine` copy/tests. Keep `ceilingLine` and `spreadLine` because the lab and relevant-state details still use them.

---

### Task 1: Select one actionable quest without changing the quest set

**Files:**

- Create: `src/features/quests/next-step.ts`
- Create: `src/features/quests/next-step.test.ts`
- Read: `src/features/quests/queries.ts`
- Read: `src/features/quests/quest-copy.ts`

**Interfaces:**

- Consumes: `readonly TodayQuest[]` from `todayQuests()` and `strengthChallengeOptedIn: boolean`.
- Produces: `questCategory(metric)`, `selectNextStep(input)`, and `nextStepSentence(selection, characterName)`.
- `NextStepSelection` is exactly `{ kind: 'quest'; index: number; category: 'motion' | 'body'; entry: TodayQuest } | { kind: 'rest' }`.

- [ ] **Step 1: Write the failing selector and copy tests**

```ts
import { describe, expect, it } from 'vitest';
import type { QuestDef, QuestState } from '@kairo/core';
import { nextStepSentence, selectNextStep } from './next-step.ts';
import type { TodayQuest } from './queries.ts';

function entry(metric: QuestDef['metric'], fraction: number, met = false): TodayQuest {
  const target = metric === 'distance_m' ? 5_000 : metric === 'active_hours' ? 4 : 1_000;
  return {
    quest: { id: `q-${metric}`, tier: 'starter', metric, target, xp: 10 },
    state: { value: met ? target : Math.round(target * fraction), fraction, met } as QuestState,
  };
}

describe('selectNextStep', () => {
  it('prefers an opted-in Body quest over a nearer Motion quest', () => {
    const quests = [entry('steps', 0.9), entry('active_kcal', 0.2), entry('distance_m', 0.8)];
    expect(selectNextStep({ quests, strengthChallengeOptedIn: true })).toMatchObject({
      kind: 'quest', index: 1, category: 'body',
    });
  });

  it('otherwise chooses the nearest incomplete Motion quest', () => {
    const quests = [entry('steps', 0.4), entry('active_kcal', 0.95), entry('distance_m', 0.8)];
    expect(selectNextStep({ quests, strengthChallengeOptedIn: false })).toMatchObject({
      kind: 'quest', index: 2, category: 'motion',
    });
  });

  it('filters completed quests and immutable Mind observations', () => {
    const quests = [entry('sleep_minutes', 0.9), entry('steps', 0.2, true), entry('active_kcal', 0.3)];
    expect(selectNextStep({ quests, strengthChallengeOptedIn: false })).toMatchObject({
      kind: 'quest', index: 2, category: 'body',
    });
  });

  it('uses stable quest order to break equal fractions', () => {
    const quests = [entry('steps', 0.5), entry('distance_m', 0.5), entry('active_kcal', 0.1)];
    expect(selectNextStep({ quests, strengthChallengeOptedIn: false })).toMatchObject({ index: 0 });
  });

  it('gives permission to stop when nothing actionable remains', () => {
    const quests = [entry('steps', 1, true), entry('active_kcal', 1, true), entry('sleep_minutes', 0.4)];
    expect(selectNextStep({ quests, strengthChallengeOptedIn: true })).toEqual({ kind: 'rest' });
  });
});

describe('nextStepSentence', () => {
  it('uses raw units and never exposes XP, tiers, or engine keys', () => {
    const selected = selectNextStep({ quests: [entry('steps', 0.4)], strengthChallengeOptedIn: false });
    const line = nextStepSentence(selected, 'Dagit');
    expect(line).toContain('Dagit');
    expect(line).toMatch(/steps/i);
    expect(line).not.toMatch(/XP|bronze|silver|gold|AGI|STR|MND/);
  });

  it('makes rest companionship explicit without guilt', () => {
    expect(nextStepSentence({ kind: 'rest' }, 'Dagit')).toBe(
      'You have done what can be changed today. Dagit can rest with you.',
    );
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npx vitest run src/features/quests/next-step.test.ts`

Expected: FAIL because `./next-step.ts` does not exist.

- [ ] **Step 3: Implement the deterministic selector and metric-specific sentence**

```ts
import type { QuestMetric } from '@kairo/core';
import type { TodayQuest } from './queries.ts';

export type QuestCategory = 'motion' | 'body' | 'mind';
export type NextStepSelection =
  | { kind: 'quest'; index: number; category: 'motion' | 'body'; entry: TodayQuest }
  | { kind: 'rest' };

export function questCategory(metric: QuestMetric): QuestCategory {
  if (metric === 'sleep_minutes') return 'mind';
  if (metric === 'active_kcal') return 'body';
  return 'motion';
}

function nearest(entries: readonly { entry: TodayQuest; index: number }[]) {
  return [...entries].sort((a, b) =>
    b.entry.state.fraction - a.entry.state.fraction || a.index - b.index
  )[0];
}

export function selectNextStep(input: {
  quests: readonly TodayQuest[];
  strengthChallengeOptedIn: boolean;
}): NextStepSelection {
  const actionable = input.quests
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.state.met && questCategory(entry.quest.metric) !== 'mind');

  const body = input.strengthChallengeOptedIn
    ? nearest(actionable.filter(({ entry }) => questCategory(entry.quest.metric) === 'body'))
    : undefined;
  const motion = nearest(actionable.filter(({ entry }) => questCategory(entry.quest.metric) === 'motion'));
  const chosen = body ?? motion ?? nearest(actionable);
  if (!chosen) return { kind: 'rest' };
  return {
    kind: 'quest',
    index: chosen.index,
    category: questCategory(chosen.entry.quest.metric) as 'motion' | 'body',
    entry: chosen.entry,
  };
}

function remaining(selection: Extract<NextStepSelection, { kind: 'quest' }>): number {
  return Math.max(0, selection.entry.quest.target - (selection.entry.state.value ?? 0));
}

export function nextStepSentence(selection: NextStepSelection, characterName: string): string {
  if (selection.kind === 'rest') {
    return `You have done what can be changed today. ${characterName} can rest with you.`;
  }
  const left = remaining(selection);
  switch (selection.entry.quest.metric) {
    case 'steps':
      return `${characterName} is ready for ${left.toLocaleString()} more steps with you.`;
    case 'distance_m':
      return `${characterName} has ${Number((left / 1_000).toFixed(1))} km left on today's path.`;
    case 'active_hours':
      return `${characterName} is ready for ${left} more active ${left === 1 ? 'hour' : 'hours'}, whenever you are.`;
    case 'active_kcal':
      return `${characterName} noticed today's effort. ${left.toLocaleString()} active kcal would clear this step.`;
    case 'sleep_minutes':
      return `You have done what can be changed today. ${characterName} can rest with you.`;
  }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run src/features/quests/next-step.test.ts src/features/quests/quest-copy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the pure selector**

```bash
git add src/features/quests/next-step.ts src/features/quests/next-step.test.ts
git commit -m "feat: select one quest-backed next step"
```

---

### Task 2: Resolve the Living Mirror’s semantic scene

**Files:**

- Create: `src/features/character/living-mirror.ts`
- Create: `src/features/character/living-mirror.test.ts`

**Interfaces:**

- Consumes: `NextStepSelection`, steps, sleep capability/reading, lifetime Body points, and an optional `LivingReaction` supplied by Task 4.
- Produces: `MotionLocation`, `StaticFigureSelection`, `BodyPresence`, `LivingReaction`, `motionLocationForSteps()`, `staticFigureSelection()`, `livingCharacterLabel()`, and `resolveLivingMirror()`.

- [ ] **Step 1: Write failing boundary, capability, and priority tests**

```ts
import { describe, expect, it } from 'vitest';
import { DAILY_STEP_BASELINE } from '@kairo/core';
import {
  livingCharacterLabel,
  motionLocationForSteps,
  resolveLivingMirror,
  staticFigureSelection,
  type LivingReaction,
} from './living-mirror.ts';

describe('motionLocationForSteps', () => {
  const at = (fraction: number) => Math.ceil(DAILY_STEP_BASELINE * fraction);
  it.each([
    [0, 'branch'],
    [at(0.25) - 1, 'branch'],
    [at(0.25), 'treeline'],
    [at(0.5), 'valley'],
    [at(0.75), 'ridge'],
    [DAILY_STEP_BASELINE, 'cleared'],
  ] as const)('maps %s steps to %s', (steps, location) => {
    expect(motionLocationForSteps(steps)).toBe(location);
  });

  it('uses a neutral fallback for invalid input', () => {
    expect(motionLocationForSteps(Number.NaN)).toBe('branch');
    expect(motionLocationForSteps(-1)).toBe('branch');
  });
});

describe('staticFigureSelection', () => {
  const reaction: LivingReaction = {
    kind: 'level', occurrence: 'level:2->3', pose: 'race_victory', sentence: 'Level 3.', priority: 50,
  };
  it('uses reaction, non-neutral Mind, Motion, then base priority', () => {
    expect(staticFigureSelection({ reaction, mind: { visible: true, state: 'sleepy' }, motionPose: 'walk' }))
      .toEqual({ kind: 'pose', pose: 'race_victory' });
    expect(staticFigureSelection({ reaction: null, mind: { visible: true, state: 'sleepy' }, motionPose: 'walk' }))
      .toEqual({ kind: 'state', state: 'sleepy' });
    expect(staticFigureSelection({ reaction: null, mind: { visible: true, state: 'normal' }, motionPose: 'walk' }))
      .toEqual({ kind: 'pose', pose: 'walk' });
    expect(staticFigureSelection({ reaction: null, mind: { visible: false, state: 'normal' }, motionPose: null }))
      .toEqual({ kind: 'base' });
  });
});

describe('resolveLivingMirror', () => {
  it('hides an unavailable or unknown Mind reading instead of showing zero', () => {
    for (const hasSleepSource of [false, true]) {
      const model = resolveLivingMirror({
        steps: 2_500,
        hasSleepSource,
        sleepMinutes: null,
        lifetimeBodyPoints: 0,
        nextStep: { kind: 'rest' },
        reaction: null,
      });
      expect(model.mind).toEqual({ visible: false, state: 'normal', minutes: null });
      expect(JSON.stringify(model)).not.toContain('0h');
    }
  });

  it('maps verified sleep and lifetime Body independently', () => {
    const model = resolveLivingMirror({
      steps: DAILY_STEP_BASELINE,
      hasSleepSource: true,
      sleepMinutes: 480,
      lifetimeBodyPoints: 50_000,
      nextStep: { kind: 'rest' },
      reaction: null,
    });
    expect(model.motion.location).toBe('cleared');
    expect(model.mind).toMatchObject({ visible: true, state: 'well_rested', minutes: 480 });
    expect(model.body.tier).toBe('strong');
  });
});

it('composes one useful image label without naming a physique tier', () => {
  const label = livingCharacterLabel({
    characterName: 'Dagit', level: 7, location: 'ridge', mind: { visible: true, state: 'well_rested' },
  });
  expect(label).toBe('Dagit, level 7, at the Ridge, looking well rested');
  expect(label).not.toMatch(/slim|fit|strong|AGI|STR|MND/);
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npx vitest run src/features/character/living-mirror.test.ts`

Expected: FAIL because `living-mirror.ts` does not exist.

- [ ] **Step 3: Implement the semantic model using existing authorities**

```ts
import { DAILY_STEP_BASELINE } from '@kairo/core';
import type { KairoPose, SleepState, StrengthTier } from './character-contract.ts';
import { sleepStateFor, strengthTierFor } from './character-resolver.ts';
import type { NextStepSelection } from '@/features/quests/next-step.ts';

export const MOTION_LOCATIONS = ['branch', 'treeline', 'valley', 'ridge', 'cleared'] as const;
export type MotionLocation = (typeof MOTION_LOCATIONS)[number];
export type StaticFigureSelection =
  | { kind: 'base' }
  | { kind: 'pose'; pose: KairoPose }
  | { kind: 'state'; state: SleepState };
export type ReactionKind = 'level' | 'record' | 'daily_walk' | 'workout' | 'motion_location';
export interface LivingReaction {
  kind: ReactionKind;
  occurrence: string;
  pose: KairoPose;
  sentence: string;
  priority: number;
}
export interface BodyPresence { tier: StrengthTier; aura: 'none' | 'present' | 'strong'; shadowWeight: number }

export function motionLocationForSteps(value: number): MotionLocation {
  const steps = Number.isFinite(value) ? Math.max(0, value) : 0;
  const fraction = Math.min(1, steps / DAILY_STEP_BASELINE);
  if (fraction >= 1) return 'cleared';
  if (fraction >= 0.75) return 'ridge';
  if (fraction >= 0.5) return 'valley';
  if (fraction >= 0.25) return 'treeline';
  return 'branch';
}

function motionPose(location: MotionLocation): KairoPose {
  if (location === 'branch') return 'idle';
  if (location === 'treeline' || location === 'valley') return 'walk';
  return 'run';
}

function bodyPresence(points: number): BodyPresence {
  const tier = strengthTierFor(Number.isFinite(points) ? Math.max(0, points) : 0);
  if (tier === 'strong') return { tier, aura: 'strong', shadowWeight: 0.07 };
  if (tier === 'fit') return { tier, aura: 'present', shadowWeight: 0.02 };
  return { tier, aura: 'none', shadowWeight: -0.03 };
}

export function staticFigureSelection(input: {
  reaction: LivingReaction | null;
  mind: { visible: boolean; state: SleepState };
  motionPose: KairoPose | null;
}): StaticFigureSelection {
  if (input.reaction) return { kind: 'pose', pose: input.reaction.pose };
  if (input.mind.visible && input.mind.state !== 'normal') return { kind: 'state', state: input.mind.state };
  if (input.motionPose) return { kind: 'pose', pose: input.motionPose };
  return { kind: 'base' };
}

export function resolveLivingMirror(input: {
  steps: number;
  hasSleepSource: boolean;
  sleepMinutes: number | null;
  lifetimeBodyPoints: number;
  nextStep: NextStepSelection;
  reaction: LivingReaction | null;
}) {
  const location = motionLocationForSteps(input.steps);
  const hasMindReading = input.hasSleepSource && input.sleepMinutes !== null && Number.isFinite(input.sleepMinutes);
  const mind = {
    visible: hasMindReading,
    state: hasMindReading ? sleepStateFor(input.sleepMinutes) : 'normal' as SleepState,
    minutes: hasMindReading ? input.sleepMinutes : null,
  };
  const pose = motionPose(location);
  return {
    motion: { location, fraction: Math.min(1, Math.max(0, input.steps) / DAILY_STEP_BASELINE), pose },
    body: bodyPresence(input.lifetimeBodyPoints),
    mind,
    nextStep: input.nextStep,
    reaction: input.reaction,
    figure: staticFigureSelection({ reaction: input.reaction, mind, motionPose: pose }),
  };
}

export const MOTION_LOCATION_NAMES: Record<MotionLocation, string> = {
  branch: 'Branch', treeline: 'Treeline', valley: 'Valley', ridge: 'Ridge', cleared: 'Clearing',
};
export function livingCharacterLabel(input: {
  characterName: string;
  level: number;
  location: MotionLocation;
  mind: { visible: boolean; state: SleepState };
}): string {
  const rest = input.mind.visible && input.mind.state === 'well_rested'
    ? ', looking well rested'
    : input.mind.visible && input.mind.state === 'sleepy'
      ? ', taking the day calmly'
      : '';
  return `${input.characterName}, level ${input.level}, at the ${MOTION_LOCATION_NAMES[input.location]}${rest}`;
}
```

- [ ] **Step 4: Run the focused tests and typecheck this seam**

Run: `npx vitest run src/features/character/living-mirror.test.ts src/features/character/character-resolver.test.ts && npm run typecheck`

Expected: PASS, with no unused or invalid imports.

- [ ] **Step 5: Commit the semantic resolver**

```bash
git add src/features/character/living-mirror.ts src/features/character/living-mirror.test.ts
git commit -m "feat: resolve the living mirror scene"
```

---

### Task 3: Read a display-only verified strength summary

**Files:**

- Create: `src/features/train/today-strength-model.ts`
- Create: `src/features/train/today-strength-model.test.ts`
- Create: `src/features/train/useTodayStrengthSummary.ts`
- Modify: `src/features/health/useHealthSync.ts`
- Read: `supabase/functions/_shared/scoring-inputs.ts`

**Interfaces:**

- Consumes: owner-readable `workout_sessions` evidence for one local date.
- Produces: `TodayStrengthRow`, `TodayStrengthSummary`, `summarizeTodayStrength(rows)`, `todayStrengthKey(userId, localDate)`, and `useTodayStrengthSummary(userId, localDate)`.
- `TodayStrengthSummary` is `{ verifiedMinutes: number; latestOccurrence: string | null }` and has display/reaction authority only.

- [ ] **Step 1: Write failing verification, units, and stable-identity tests**

```ts
import { describe, expect, it } from 'vitest';
import { STRENGTH_ACTIVITY_TYPES } from '@kairo/core';
import { WORKOUT_SOURCE_ALLOWLIST } from '../../../supabase/functions/_shared/scoring-inputs.ts';
import {
  DISPLAY_WORKOUT_SOURCE_ALLOWLIST,
  summarizeTodayStrength,
  type TodayStrengthRow,
} from './today-strength-model.ts';

function row(overrides: Partial<TodayStrengthRow> = {}): TodayStrengthRow {
  return {
    hkUuid: 'session-a',
    startedAt: '2026-09-01T01:00:00.000Z',
    activityType: STRENGTH_ACTIVITY_TYPES[0],
    durationS: 3_600,
    sourceBundleId: DISPLAY_WORKOUT_SOURCE_ALLOWLIST[0],
    wasUserEntered: false,
    hasHeartRateEvidence: true,
    ...overrides,
  };
}

describe('summarizeTodayStrength', () => {
  it('keeps its display allowlist equal to the server scoring authority', () => {
    expect(DISPLAY_WORKOUT_SOURCE_ALLOWLIST).toEqual(WORKOUT_SOURCE_ALLOWLIST);
  });

  it('sums verified strength seconds once and converts them to minutes', () => {
    expect(summarizeTodayStrength([row(), row({ hkUuid: 'session-b', durationS: 1_800 })]))
      .toEqual({ verifiedMinutes: 90, latestOccurrence: 'workout:session-b' });
  });

  it.each([
    { activityType: 37 },
    { hasHeartRateEvidence: false },
    { wasUserEntered: true },
    { sourceBundleId: 'com.apple.Health' },
  ])('excludes unverified evidence %#', (override) => {
    expect(summarizeTodayStrength([row(override)])).toEqual({
      verifiedMinutes: 0, latestOccurrence: null,
    });
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npx vitest run src/features/train/today-strength-model.test.ts`

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Implement the display reducer with the core trust predicate**

```ts
import { STRENGTH_ACTIVITY_TYPES, workoutVerified } from '@kairo/core';

// Display-only mirror. The test above pins this to the server authority so a
// server allowlist change cannot silently make Today claim a different result.
export const DISPLAY_WORKOUT_SOURCE_ALLOWLIST = [
  'com.apple.workout',
  'com.apple.Fitness',
] as const;

export interface TodayStrengthRow {
  hkUuid: string;
  startedAt: string;
  activityType: number;
  durationS: number;
  sourceBundleId: string | null;
  wasUserEntered: boolean;
  hasHeartRateEvidence: boolean;
}
export interface TodayStrengthSummary { verifiedMinutes: number; latestOccurrence: string | null }

export function summarizeTodayStrength(rows: readonly TodayStrengthRow[]): TodayStrengthSummary {
  const verified = rows.filter((row) =>
    (STRENGTH_ACTIVITY_TYPES as readonly number[]).includes(row.activityType) &&
    workoutVerified({
      wasUserEntered: row.wasUserEntered,
      sourceBundleId: row.sourceBundleId,
      hasHeartRateEvidence: row.hasHeartRateEvidence,
    }, DISPLAY_WORKOUT_SOURCE_ALLOWLIST),
  );
  const verifiedMinutes = verified.reduce((sum, row) => sum + Math.max(0, row.durationS), 0) / 60;
  const latest = [...verified].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  return { verifiedMinutes, latestOccurrence: latest ? `workout:${latest.hkUuid}` : null };
}
```

- [ ] **Step 4: Add the owner-only one-day query**

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
import { summarizeTodayStrength, type TodayStrengthRow } from './today-strength-model.ts';

export const todayStrengthKey = (userId: string | undefined, localDate: string | undefined) =>
  ['today-strength', userId ?? 'none', localDate ?? 'none'] as const;

export function useTodayStrengthSummary(userId: string | undefined, localDate: string | undefined) {
  return useQuery({
    queryKey: todayStrengthKey(userId, localDate),
    enabled: Boolean(userId && localDate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('hk_uuid, started_at, activity_type, duration_s, source_bundle_id, was_user_entered, has_heart_rate_evidence')
        .eq('user_id', userId as string)
        .eq('local_date', localDate as string);
      if (error) throw new Error(error.message);
      const rows: TodayStrengthRow[] = (data ?? []).map((row) => ({
        hkUuid: String(row.hk_uuid),
        startedAt: String(row.started_at),
        activityType: Number(row.activity_type),
        durationS: Number(row.duration_s ?? 0),
        sourceBundleId: row.source_bundle_id ?? null,
        wasUserEntered: Boolean(row.was_user_entered),
        hasHeartRateEvidence: Boolean(row.has_heart_rate_evidence),
      }));
      return summarizeTodayStrength(rows);
    },
  });
}
```

In `useHealthSync.ts`, import `todayStrengthKey` and invalidate it beside `todayBucketsKey` after a successful sync:

```ts
void queryClient.invalidateQueries({ queryKey: todayStrengthKey(userId, localDate) });
```

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx vitest run src/features/train/today-strength-model.test.ts supabase/functions/_shared/scoring-inputs.test.ts && npm run typecheck`

Expected: PASS; the parity assertion fails if either allowlist differs.

- [ ] **Step 6: Commit the strength projection**

```bash
git add src/features/train/today-strength-model.ts src/features/train/today-strength-model.test.ts src/features/train/useTodayStrengthSummary.ts src/features/health/useHealthSync.ts
git commit -m "feat: project verified strength for today"
```

---

### Task 4: Present one unseen reaction per opening

**Files:**

- Create: `src/features/character/living-reaction.ts`
- Create: `src/features/character/living-reaction.test.ts`
- Create: `src/features/character/useLivingReaction.ts`
- Modify: `src/features/character/moments.ts`

**Interfaces:**

- Consumes: current local date/location/level, today’s records, Daily Walk state, verified workout occurrence, character name, and `STAT_NAMES` injected as data.
- Produces: `reactionCandidates(input)`, `selectLivingReaction(candidates, seen)`, reaction store functions, and `useLivingReaction(input)`.
- Occurrence storage is fixed to five category keys plus one observed-level key per account; it is not an append-only progression ledger.

- [ ] **Step 1: Write failing priority, occurrence, midnight, and backfill tests**

```ts
import { describe, expect, it } from 'vitest';
import { reactionCandidates, selectLivingReaction } from './living-reaction.ts';

const base = {
  localDate: '2026-09-01',
  characterName: 'Dagit',
  previousLevel: 2,
  currentLevel: 3,
  motionLocation: 'ridge' as const,
  dailyWalkMet: true,
  recordStatsToday: ['AGI'] as const,
  verifiedWorkoutOccurrence: 'workout:abc',
  statNames: { AGI: 'Motion', STR: 'Body', MND: 'Mind' },
};

describe('Living Mirror reactions', () => {
  it('prioritizes level, achievement, workout, then location', () => {
    const candidates = reactionCandidates(base);
    expect(candidates.map((candidate) => candidate.kind)).toEqual([
      'level', 'record', 'daily_walk', 'workout', 'motion_location',
    ]);
    expect(selectLivingReaction(candidates, {}).reaction?.kind).toBe('level');
  });

  it('consumes lower-priority simultaneous changes instead of queuing a reel', () => {
    const result = selectLivingReaction(reactionCandidates(base), {});
    expect(result.reaction?.kind).toBe('level');
    expect(result.consumed).toHaveLength(5);
  });

  it('does not replay stored occurrences', () => {
    const candidates = reactionCandidates(base);
    const seen = Object.fromEntries(candidates.map((candidate) => [candidate.kind, candidate.occurrence]));
    expect(selectLivingReaction(candidates, seen).reaction).toBeNull();
  });

  it('does not turn an initial observed level into a level-up', () => {
    expect(reactionCandidates({ ...base, previousLevel: null }).some((item) => item.kind === 'level')).toBe(false);
  });

  it('ignores historical records and only builds same-day occurrences', () => {
    expect(reactionCandidates({ ...base, recordStatsToday: [], verifiedWorkoutOccurrence: null })
      .some((item) => item.kind === 'record')).toBe(false);
  });

  it('uses date plus location so midnight creates a new location occurrence', () => {
    const first = reactionCandidates({ ...base, currentLevel: 2, previousLevel: 2, dailyWalkMet: false, recordStatsToday: [], verifiedWorkoutOccurrence: null });
    const next = reactionCandidates({ ...base, localDate: '2026-09-02', currentLevel: 2, previousLevel: 2, dailyWalkMet: false, recordStatsToday: [], verifiedWorkoutOccurrence: null });
    expect(first.at(-1)?.occurrence).toBe('motion:2026-09-01:ridge');
    expect(next.at(-1)?.occurrence).toBe('motion:2026-09-02:ridge');
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npx vitest run src/features/character/living-reaction.test.ts`

Expected: FAIL because `living-reaction.ts` does not exist.

- [ ] **Step 3: Implement candidate construction and selection**

Use the exact priorities and stable ids below:

```ts
const PRIORITY = { level: 50, record: 40, daily_walk: 40, workout: 30, motion_location: 20 } as const;

export const REACTION_KINDS = [
  'level', 'record', 'daily_walk', 'workout', 'motion_location',
] as const satisfies readonly ReactionKind[];

export interface ReactionCandidateInput {
  localDate: string;
  characterName: string;
  previousLevel: number | null;
  currentLevel: number;
  motionLocation: MotionLocation;
  dailyWalkMet: boolean;
  recordStatsToday: readonly CoreStat[];
  verifiedWorkoutOccurrence: string | null;
  statNames: Record<CoreStat, string>;
}

export function reactionCandidates(input: ReactionCandidateInput): LivingReaction[] {
  const items: LivingReaction[] = [];
  if (input.previousLevel !== null && input.currentLevel > input.previousLevel) {
    items.push({
      kind: 'level', priority: PRIORITY.level,
      occurrence: `level:${input.previousLevel}->${input.currentLevel}`,
      pose: 'race_victory',
      sentence: `${input.characterName} noticed the change. Level ${input.currentLevel} suits you.`,
    });
  }
  if (input.recordStatsToday.length > 0) {
    const names = input.recordStatsToday.map((stat) => input.statNames[stat]).join(' and ');
    items.push({
      kind: 'record', priority: PRIORITY.record,
      occurrence: `record:${input.localDate}:${[...input.recordStatsToday].sort().join('+')}`,
      pose: 'race_victory', sentence: `${input.characterName} is celebrating a new ${names} best.`,
    });
  }
  if (input.dailyWalkMet) {
    items.push({
      kind: 'daily_walk', priority: PRIORITY.daily_walk,
      occurrence: `walk:${input.localDate}`, pose: 'race_victory',
      sentence: `${input.characterName} reached today's clearing. The Daily Walk is done.`,
    });
  }
  if (input.verifiedWorkoutOccurrence) {
    items.push({
      kind: 'workout', priority: PRIORITY.workout,
      occurrence: input.verifiedWorkoutOccurrence, pose: 'workout',
      sentence: `${input.characterName} carries today's strength work proudly.`,
    });
  }
  if (input.motionLocation !== 'branch') {
    items.push({
      kind: 'motion_location', priority: PRIORITY.motion_location,
      occurrence: `motion:${input.localDate}:${input.motionLocation}`,
      pose: input.motionLocation === 'treeline' || input.motionLocation === 'valley' ? 'walk' : 'run',
      sentence: `${input.characterName} reached the ${input.motionLocation}.`,
    });
  }
  return items.sort((a, b) => b.priority - a.priority);
}

export function selectLivingReaction(
  candidates: readonly LivingReaction[],
  seen: Partial<Record<ReactionKind, string>>,
): { reaction: LivingReaction | null; consumed: LivingReaction[] } {
  const unseen = candidates.filter((candidate) => seen[candidate.kind] !== candidate.occurrence);
  return { reaction: unseen[0] ?? null, consumed: unseen };
}
```

Import `CoreStat` from `@kairo/core`, `MotionLocation`/`LivingReaction`/`ReactionKind` from `living-mirror.ts`, and do not build a `tired` candidate.

- [ ] **Step 4: Replace first-sync moment storage with fixed reaction markers**

Keep the existing `kairo.moments` MMKV instance and add these APIs:

```ts
function reactionKey(userId: string, kind: ReactionKind): string {
  return `reaction.v1.${userId}.${kind}`;
}
function levelKey(userId: string): string {
  return `observed-level.v1.${userId}`;
}
export function readSeenReactions(userId: string): Partial<Record<ReactionKind, string>> {
  return Object.fromEntries(REACTION_KINDS.flatMap((kind) => {
    const value = storage.getString(reactionKey(userId, kind));
    return value === undefined ? [] : [[kind, value]];
  }));
}
export function markReactionsSeen(userId: string, reactions: readonly LivingReaction[]): void {
  for (const reaction of reactions) storage.set(reactionKey(userId, reaction.kind), reaction.occurrence);
}
export function readObservedLevel(userId: string): number | null {
  return storage.getNumber(levelKey(userId)) ?? null;
}
export function writeObservedLevel(userId: string, level: number): void {
  storage.set(levelKey(userId), level);
}
```

Remove `hasSeenFirstSync()` and `markFirstSyncSeen()` only when Task 8 deletes their sole component consumer.

- [ ] **Step 5: Add the one-decision-per-opening hook**

`useLivingReaction()` must wait until profile, buckets, records, walk history, and today-strength have each resolved or supplied cached data; then it evaluates once for that mounted Today screen. Use this core effect:

```ts
export interface UseLivingReactionInput {
  userId: string | undefined;
  ready: boolean;
  signals: Omit<ReactionCandidateInput, 'previousLevel'>;
  onImpression: (kind: ReactionKind) => void;
}

export function useLivingReaction(input: UseLivingReactionInput): LivingReaction | null {
const evaluated = useRef(false);
const [active, setActive] = useState<LivingReaction | null>(null);

useEffect(() => {
  evaluated.current = false;
  setActive(null);
}, [input.userId]);

useEffect(() => {
  if (!input.userId || !input.ready || evaluated.current) return;
  evaluated.current = true;
  try {
    const previousLevel = readObservedLevel(input.userId);
    const candidates = reactionCandidates({ ...input.signals, previousLevel });
    const selected = selectLivingReaction(candidates, readSeenReactions(input.userId));
    writeObservedLevel(input.userId, input.signals.currentLevel);
    if (!selected.reaction) return;
    markReactionsSeen(input.userId, selected.consumed);
    setActive(selected.reaction);
    input.onImpression(selected.reaction.kind);
  } catch (error) {
    console.warn('[living-mirror] reaction', error);
  }
}, [input]);

useEffect(() => {
  if (!active) return;
  const timer = setTimeout(() => setActive(null), 2_200);
  return () => clearTimeout(timer);
}, [active]);

return active;
}
```

Memoize the `input` object at the caller so the effect does not churn. Reduced Motion uses the same immediate static pose/sentence and timer; it adds no crossfade or movement.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npx vitest run src/features/character/living-reaction.test.ts src/features/character/living-mirror.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit reactions and occurrence storage**

```bash
git add src/features/character/living-reaction.ts src/features/character/living-reaction.test.ts src/features/character/useLivingReaction.ts src/features/character/moments.ts
git commit -m "feat: add bounded living mirror reactions"
```

---

### Task 5: Enforce one native modal owner

**Files:**

- Create: `src/ui/modal-owner.ts`
- Create: `src/ui/modal-owner.test.ts`
- Modify: `src/features/permissions/PermissionAsks.tsx`
- Modify: `src/features/onboarding/WelcomePopups.tsx`

**Interfaces:**

- Produces: `ModalOwner = 'permissions' | 'welcome' | 'today-details'`, `useModalOwner`, `claimModal(owner)`, and `releaseModal(owner)`.
- Task 6 consumes the same owner for Today details.

- [ ] **Step 1: Write the failing ownership test**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { claimModal, releaseModal, useModalOwner } from './modal-owner.ts';

describe('modal owner', () => {
  beforeEach(() => useModalOwner.setState({ owner: null }));

  it('allows one owner and rejects a competing modal', () => {
    expect(claimModal('permissions')).toBe(true);
    expect(claimModal('today-details')).toBe(false);
    expect(useModalOwner.getState().owner).toBe('permissions');
  });

  it('only lets the current owner release the host', () => {
    claimModal('welcome');
    releaseModal('today-details');
    expect(useModalOwner.getState().owner).toBe('welcome');
    releaseModal('welcome');
    expect(useModalOwner.getState().owner).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npx vitest run src/ui/modal-owner.test.ts`

Expected: FAIL because `modal-owner.ts` does not exist.

- [ ] **Step 3: Implement atomic ownership**

```ts
import { create } from 'zustand';

export type ModalOwner = 'permissions' | 'welcome' | 'today-details';
export const useModalOwner = create<{ owner: ModalOwner | null }>(() => ({ owner: null }));

export function claimModal(owner: ModalOwner): boolean {
  const current = useModalOwner.getState().owner;
  if (current !== null && current !== owner) return false;
  useModalOwner.setState({ owner });
  return true;
}
export function releaseModal(owner: ModalOwner): void {
  if (useModalOwner.getState().owner === owner) useModalOwner.setState({ owner: null });
}
```

- [ ] **Step 4: Lease the host from both existing native modals**

In `PermissionAsks`, observe `owner`, claim when `ask !== null && owner === null`, release when the ask ends, and set `<Modal visible={ask !== null && owner === 'permissions'} ...>`. In `WelcomePopups`, claim while its existing `open` flag is true, release on every close/unmount, and set `<Modal visible={open && owner === 'welcome'} ...>`.

Use these exact effects:

```ts
useEffect(() => {
  if (ask !== null && owner === null) claimModal('permissions');
  if (ask === null && owner === 'permissions') releaseModal('permissions');
}, [ask, owner]);

useEffect(() => {
  if (open && owner === null) claimModal('welcome');
  if (!open && owner === 'welcome') releaseModal('welcome');
}, [open, owner]);

useEffect(() => () => releaseModal('welcome'), []);
```

Every existing close callback must call its state setter; the effect owns release so a native dismissal and a button dismissal cannot diverge.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/ui/modal-owner.test.ts src/features/permissions/ask-order.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit modal mutual exclusion**

```bash
git add src/ui/modal-owner.ts src/ui/modal-owner.test.ts src/features/permissions/PermissionAsks.tsx src/features/onboarding/WelcomePopups.tsx
git commit -m "fix: serialize native modal presentation"
```

---

### Task 6: Build the optional details model and bottom sheet

**Files:**

- Create: `src/features/character/today-details.ts`
- Create: `src/features/character/today-details.test.ts`
- Create: `src/features/character/TodayDetailsSheet.tsx`
- Create: `src/features/character/TodayNextStep.tsx`
- Modify: `src/features/quests/quest-copy.ts`
- Modify: `src/features/quests/quest-copy.test.ts`
- Modify: `src/features/character/SyncStatus.tsx`

**Interfaces:**

- Consumes: raw day totals, verified strength minutes, sleep capability/reading, Daily Walk run, all `TodayQuest` states, selected index, disclosure stage, and existing SyncStatus props.
- Produces: `TodayDetailRow`, `TodayDetailSection`, `todayDetails(input)`, `TodayNextStep`, and `TodayDetailsSheet`.

- [ ] **Step 1: Export the existing raw-unit formatters with tests**

Rename the private `durationWords` and `distanceWords` in `quest-copy.ts` to exported `durationWords` and `distanceWords` without changing their behavior. Add assertions:

```ts
expect(distanceWords(5_000)).toBe('5 km');
expect(distanceWords(7_500)).toBe('7.5 km');
expect(durationWords(420)).toBe('7 hours');
expect(durationWords(450)).toBe('7h 30m');
```

- [ ] **Step 2: Write failing details-model tests**

```ts
import { describe, expect, it } from 'vitest';
import { todayDetails } from './today-details.ts';

const base = {
  totals: { steps: 4_321, distanceM: 3_250, activeKcal: 245, activeMinutes: 30, activeHours: 3 },
  verifiedStrengthMinutes: 45,
  hasSleepSource: true,
  sleepMinutes: 450,
  dailyWalkRun: 4,
  motionNote: null,
  quests: [],
  selectedQuestIndex: null,
};

describe('todayDetails', () => {
  it('separates personal Streak from the Daily Walk run and uses raw units', () => {
    const sections = todayDetails(base);
    expect(sections.find((section) => section.id === 'motion')?.rows.map((row) => row.value))
      .toEqual(['4,321 steps', '3.3 km', '4 days']);
    expect(JSON.stringify(sections)).not.toContain('Streak');
  });

  it('shows verified strength minutes only when positive', () => {
    expect(JSON.stringify(todayDetails(base))).toContain('45 min');
    expect(JSON.stringify(todayDetails({ ...base, verifiedStrengthMinutes: 0 }))).not.toContain('Strength session');
  });

  it('removes Mind completely without capability or a verified reading', () => {
    for (const patch of [{ hasSleepSource: false }, { sleepMinutes: null }]) {
      expect(todayDetails({ ...base, ...patch }).some((section) => section.id === 'mind')).toBe(false);
    }
  });

  it('shows a Motion explanation only when the scoring shift is relevant', () => {
    expect(JSON.stringify(todayDetails({ ...base, motionNote: 'Motion eased after three active hours.' })))
      .toContain('Motion eased after three active hours.');
    expect(JSON.stringify(todayDetails(base))).not.toContain("Today's Motion");
  });

  it('never emits score totals, tiers, XP, or engine keys', () => {
    expect(JSON.stringify(todayDetails(base))).not.toMatch(/bronze|silver|gold|XP|AGI|STR|MND|score/i);
  });
});
```

- [ ] **Step 3: Run tests and verify the missing-module failure**

Run: `npx vitest run src/features/character/today-details.test.ts src/features/quests/quest-copy.test.ts`

Expected: FAIL because `today-details.ts` does not exist.

- [ ] **Step 4: Implement the pure section model**

```ts
import type { DayTotals } from '@kairo/core';
import type { TodayQuest } from '@/features/quests/queries.ts';
import { distanceWords, durationWords, questHeadline, questProgressLine } from '@/features/quests/quest-copy.ts';

export interface TodayDetailRow { id: string; label: string; value: string; accessibilityLabel: string }
export interface TodayDetailSection { id: 'motion' | 'body' | 'mind' | 'quests'; title: string; rows: TodayDetailRow[] }

const row = (id: string, label: string, value: string): TodayDetailRow => ({
  id, label, value, accessibilityLabel: `${label}, ${value}`,
});

export function todayDetails(input: {
  totals: DayTotals;
  verifiedStrengthMinutes: number;
  hasSleepSource: boolean;
  sleepMinutes: number | null;
  dailyWalkRun: number;
  motionNote: string | null;
  quests: readonly TodayQuest[];
  selectedQuestIndex: number | null;
}): TodayDetailSection[] {
  const sections: TodayDetailSection[] = [
    {
      id: 'motion', title: 'Motion', rows: [
        row('steps', 'Steps', `${input.totals.steps.toLocaleString()} steps`),
        row('distance', 'Distance', distanceWords(input.totals.distanceM)),
        row('walk-run', 'Daily Walk run', `${input.dailyWalkRun} ${input.dailyWalkRun === 1 ? 'day' : 'days'}`),
        ...(input.motionNote ? [row('motion-note', "Today's Motion", input.motionNote)] : []),
      ],
    },
    {
      id: 'body', title: 'Body', rows: [
        row('energy', 'Active energy', `${Math.round(input.totals.activeKcal).toLocaleString()} kcal`),
        ...(input.verifiedStrengthMinutes > 0
          ? [row('strength', 'Verified strength session', `${Math.round(input.verifiedStrengthMinutes)} min`)]
          : []),
      ],
    },
  ];
  if (input.hasSleepSource && input.sleepMinutes !== null) {
    sections.push({ id: 'mind', title: 'Mind', rows: [row('sleep', 'Verified sleep', durationWords(input.sleepMinutes))] });
  }
  sections.push({
    id: 'quests', title: 'More for today',
    rows: input.quests.map((entry, index) => row(
      `quest-${index}`,
      index === input.selectedQuestIndex ? 'Current step' : questHeadline(entry.quest),
      `${index === input.selectedQuestIndex ? `${questHeadline(entry.quest)} · ` : ''}${questProgressLine(entry.quest, entry.state)}`,
    )),
  });
  return sections;
}
```

- [ ] **Step 5: Render the trigger and bounded sheet**

`TodayNextStep` renders one accessible prompt and one `Pressable` labeled **See today’s details**. The sheet follows `PermissionAsks`’ proven geometry: transparent `Modal`, bottom-aligned backdrop, `Panel` with `maxHeight: '85%'`, `ScrollView` using `flexGrow: 0` and `flexShrink: 1`, and a point width from `useWindowDimensions()`.

Use this component body so the prompt and action remain two ordered accessibility stops:

```tsx
export const TodayNextStep = forwardRef<View, {
  sentence: string;
  onDetails: () => void;
  detailsDisabled: boolean;
}>(function TodayNextStep({ sentence, onDetails, detailsDisabled }, ref) {
  return (
    <View style={styles.nextStep}>
      <Text accessibilityRole="summary" style={styles.sentence}>{sentence}</Text>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel="See today's details"
        disabled={detailsDisabled}
        onPress={onDetails}
      >
        <Text style={styles.detailsLink}>See today&apos;s details</Text>
      </Pressable>
    </View>
  );
});
```

The row body is exactly:

```tsx
<View
  key={row.id}
  accessible
  accessibilityLabel={row.accessibilityLabel}
  style={styles.row}
>
  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.rowBody}>
    <Text style={styles.rowLabel}>{row.label}</Text>
    <Text style={styles.rowValue}>{row.value}</Text>
  </View>
</View>
```

The modal contract is:

```tsx
<Modal
  visible={visible}
  transparent
  animationType={reduceMotion ? 'none' : 'slide'}
  onRequestClose={onClose}
  onDismiss={onDismiss}
>
  <View style={styles.backdrop} accessibilityViewIsModal>
    <Panel variant="plain" style={styles.sheet}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false}>
        <View style={{ width: sheetWidth }}>
          <Text accessibilityRole="header" style={styles.title}>Today with KAIRO</Text>
          {sections.map((section) => (
            <View key={section.id} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.rows.map((row) => (
                <View
                  key={row.id}
                  accessible
                  accessibilityLabel={row.accessibilityLabel}
                  style={styles.row}
                >
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={styles.rowBody}
                  >
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={styles.rowValue}>{row.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
          {showChallenges && <Pressable accessibilityRole="link" onPress={onChallenges}><Text>Open Challenges</Text></Pressable>}
          <Pressable accessibilityRole="link" onPress={onProgress}><Text>How progress works</Text></Pressable>
          <SyncStatus userId={userId} timeZone={timeZone} attentionOnly />
        </View>
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel="Close today's details" onPress={onClose}>
        <Text>Close</Text>
      </Pressable>
    </Panel>
  </View>
</Modal>
```

- [ ] **Step 6: Make healthy sync status quiet in details**

Add `attentionOnly = false` to `SyncStatus` and return `null` for `status.kind === 'fresh'` when true:

```ts
if (attentionOnly && status.kind === 'fresh') return null;
```

Keep `syncing`, `never`, `stale`, `failed`, and `no-data` visible. They are the relevant explanatory states.

- [ ] **Step 7: Run focused tests and typecheck**

Run: `npx vitest run src/features/character/today-details.test.ts src/features/quests/quest-copy.test.ts src/features/health/sync-status.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit the optional details surface**

```bash
git add src/features/character/today-details.ts src/features/character/today-details.test.ts src/features/character/TodayDetailsSheet.tsx src/features/character/TodayNextStep.tsx src/features/quests/quest-copy.ts src/features/quests/quest-copy.test.ts src/features/character/SyncStatus.tsx
git commit -m "feat: add Living Mirror details sheet"
```

---

### Task 7: Render location, static state priority, and Body presence

**Files:**

- Create: `src/features/character/MotionScenery.tsx`
- Modify: `src/features/character/CharacterFigure.tsx`
- Modify: `src/features/character/Diorama.tsx`
- Modify: `src/features/character/TodayHud.tsx`
- Modify: `src/features/character/character-assets.test.ts`
- Modify: `src/features/character/KairoLab.tsx`

**Interfaces:**

- Consumes: `MotionLocation`, `StaticFigureSelection`, `BodyPresence`, and a fully composed `figureLabel`.
- Produces: a renderer that interprets no health values and a development state matrix covering every location/Mind/Body/reaction combination.

- [ ] **Step 1: Extend the asset contract test before changing the renderer**

Add `CharacterFigure.tsx` as a Today full-character surface and assert it imports all three approved registries while remaining Rive-free:

```ts
const TODAY_FIGURE_PATH = resolve(REPO_ROOT, 'src/features/character/CharacterFigure.tsx');
const todayFigureSource = readFileSync(TODAY_FIGURE_PATH, 'utf8');
expect(todayFigureSource).toContain('KAIRO_BASE_ASSET');
expect(todayFigureSource).toContain('KAIRO_POSE_ASSETS');
expect(todayFigureSource).toContain('KAIRO_STATE_ASSETS');
expect(todayFigureSource).not.toMatch(/KairoRenderer|@rive-app\/react-native|\.riv/);
```

- [ ] **Step 2: Run the asset test and verify it fails on the current species asset**

Run: `npx vitest run src/features/character/character-assets.test.ts`

Expected: FAIL because `CharacterFigure.tsx` still imports `SPECIES_FIGURES` rather than the Living Mirror registries.

- [ ] **Step 3: Make CharacterFigure render only supplied semantics**

Replace `dominance`, `species`, and `lifetimePoints` props with:

```ts
function sourceFor(selection: StaticFigureSelection): ImageSourcePropType {
  if (selection.kind === 'pose') return KAIRO_POSE_ASSETS[selection.pose];
  if (selection.kind === 'state') return KAIRO_STATE_ASSETS[selection.state];
  return KAIRO_BASE_ASSET;
}

export function CharacterFigure({
  level, stage, height = 220, figure, body,
}: {
  level: number;
  stage: EvolutionStage;
  height?: number;
  figure: StaticFigureSelection;
  body: BodyPresence;
}) {
  const art = sourceFor(figure);
  const response = figureResponse({
    level, stage, height,
    aura: body.aura,
    shadowWeight: body.shadowWeight,
  });
  // Keep the current 190:212 display box and resizeMode="contain". Do not
  // scale width independently from height or use Body tier as a transform.
}
```

Use the existing `GroundShadow`, `PresenceRing`, and `useFloat`. Shade may deepen for `strong`, but Body tier must never distort the PNG.

- [ ] **Step 4: Draw semantic scenery without new assets**

`MotionScenery` receives only `location` and draws decorative React Native Views. Use cumulative layers so progress reads as travel rather than five unrelated themes:

```tsx
export function MotionScenery({ location }: { location: MotionLocation }) {
  const depth = MOTION_LOCATIONS.indexOf(location);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <View style={styles.horizon} />
      {depth >= 1 && <View style={[styles.land, styles.treeline]} />}
      {depth >= 2 && <View style={[styles.land, styles.valley]} />}
      {depth >= 3 && <View style={[styles.land, styles.ridge]} />}
      {depth >= 4 && <View style={styles.clearingGlow} />}
      <View style={styles.branch} />
    </View>
  );
}
```

Use only theme ramps, rounded Views, and opacity. Motion meaning must also be printed as text, so these layers remain decorative.

- [ ] **Step 5: Change Diorama to the supplied renderer contract**

The new props are:

```ts
{
  height: number;
  level: number;
  stage: EvolutionStage;
  location: MotionLocation;
  figure: StaticFigureSelection;
  body: BodyPresence;
  figureLabel: string;
  crest?: boolean;
  children?: ReactNode;
}
```

Render `<MotionScenery location={location} />` beneath the character, set the existing accessible stage’s `accessibilityLabel={figureLabel}`, and pass `figure`/`body` into `CharacterFigure`. Remove species/dominance/stat-name interpretation from this renderer.

- [ ] **Step 6: Remove the Today Mastery coin component**

Delete `TodayStatCoins` and its `CORE_STATS`, rating, stat-icon, and coin styles from `TodayHud.tsx`. Preserve `TodayChips` and `TodayCount` unchanged except for import cleanup.

- [ ] **Step 7: Add the development-only state matrix**

In `KairoLab.tsx`, add a **Living Mirror beta** section that renders:

- all five `MOTION_LOCATIONS` with their Motion pose;
- sleepy, normal, and well-rested Mind inputs;
- slim, fit, and strong Body presence;
- each reaction pose followed by the resolved fallback selection; and
- one no-sleep/unknown-reading state.

Use `resolveLivingMirror()` to produce every preview; do not hand-build renderer props in the lab. Keep `/kairo-lab` absent from production navigation.

- [ ] **Step 8: Run focused tests and typecheck**

Run: `npx vitest run src/features/character/character-assets.test.ts src/features/character/living-mirror.test.ts src/features/character/character-contract.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 9: Commit the Living Mirror renderer**

```bash
git add src/features/character/MotionScenery.tsx src/features/character/CharacterFigure.tsx src/features/character/Diorama.tsx src/features/character/TodayHud.tsx src/features/character/character-assets.test.ts src/features/character/KairoLab.tsx
git commit -m "feat: render KAIRO as a living mirror"
```

---

### Task 8: Replace Today’s dashboard stack and retire duplicates

**Files:**

- Modify: `app/(tabs)/index.tsx`
- Modify: `src/features/character/queries.ts`
- Modify: `src/features/character/kairo-voice.ts`
- Modify: `src/features/character/kairo-voice.test.ts`
- Modify: `src/features/character/moments.ts`
- Modify: `src/features/character/useDisclosure.ts`
- Delete: `src/features/quests/QuestRings.tsx`
- Delete: `src/features/character/TodayTiles.tsx`
- Delete: `src/features/train/DailyWalkCard.tsx`
- Delete: `src/features/train/TrainEntry.tsx`
- Delete: `src/features/squad/RaceLine.tsx`
- Delete: `src/features/character/FirstSyncCallout.tsx`
- Delete: `src/features/character/first-sync.ts`
- Delete: `src/features/character/first-sync.test.ts`

**Interfaces:**

- Consumes: every pure and rendering interface from Tasks 1–7.
- Produces: the approved Balanced Mirror hierarchy and no orphaned one-consumer Today components.

- [ ] **Step 1: Add a source-contract test for Today’s hierarchy**

Create `src/features/character/today-composition.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/(tabs)/index.tsx', 'utf8');

describe('Today Living Mirror composition', () => {
  it('renders the scene, one next step, and optional details', () => {
    expect(source).toContain('<Diorama');
    expect(source).toContain('<TodayNextStep');
    expect(source).toContain('<TodayDetailsSheet');
  });

  it('does not reintroduce dashboard or race surfaces', () => {
    expect(source).not.toMatch(/QuestRings|TodayStatCoins|TodayTiles|DailyWalkCard|TrainEntry|RaceLine|FirstSyncCallout/);
    expect(source).not.toMatch(/useSquadLeaderboard|useOwnRecentDays|rankRacers|ghostRivals/);
  });
});
```

- [ ] **Step 2: Run the composition test and verify it fails**

Run: `npx vitest run src/features/character/today-composition.test.ts`

Expected: FAIL because Today still imports the retired dashboard surfaces.

- [ ] **Step 3: Replace Today’s query and resolver block**

Keep these queries: profile, today score, buckets, vitals, Streak, squad (for `WelcomePopups` only), disclosure/scored days, quest completions, walk history, stat records, and today strength. Remove Today’s leaderboard, recent-day, race-rank, and dominance reads.

The core composition is:

```ts
const quests = todayQuests({
  userId,
  localDate: localToday,
  scoredDays: scoredDays.data ?? 0,
  tierOverride: profile.data?.quest_tier_override ?? null,
  hasSleep: profile.data?.has_sleep_source ?? false,
  day: totals && {
    steps: totals.steps,
    activeKcal: totals.activeKcal,
    activeHours: totals.activeHours,
    distanceM: totals.distanceM,
    sleepMinutes: vitals.data?.sleepMinutes ?? null,
  },
  completedIds: completions.data ?? [],
});
const nextStep = selectNextStep({
  quests,
  strengthChallengeOptedIn: profile.data?.trains_strength ?? false,
});
const walk = localToday && walkHistory.data
  ? dailyWalkState({ todaySteps: totals?.steps, today: localToday, days: walkHistory.data })
  : null;
const recordStatsToday = (records.data ?? [])
  .filter((record) => record.localDate === localToday)
  .map((record) => record.stat);
const reaction = useLivingReaction({
  userId,
  ready: Boolean(
    localToday && profile.data && buckets.data && vitals.isFetched &&
    walkHistory.isFetched && records.isFetched && strength.isFetched
  ),
  signals: {
    localDate: localToday ?? '',
    characterName,
    currentLevel: level,
    motionLocation: motionLocationForSteps(steps),
    dailyWalkMet: walk?.met ?? false,
    recordStatsToday,
    verifiedWorkoutOccurrence: strength.data?.latestOccurrence ?? null,
    statNames: STAT_NAMES,
  },
  onImpression: () => {},
});
const mirror = resolveLivingMirror({
  steps,
  hasSleepSource: profile.data?.has_sleep_source ?? false,
  sleepMinutes: vitals.data?.sleepMinutes ?? null,
  lifetimeBodyPoints: profile.data?.str_total ?? 0,
  nextStep,
  reaction,
});
const sections = todayDetails({
  totals: totals ?? EMPTY_DAY_TOTALS,
  verifiedStrengthMinutes: strength.data?.verifiedMinutes ?? 0,
  hasSleepSource: profile.data?.has_sleep_source ?? false,
  sleepMinutes: vitals.data?.sleepMinutes ?? null,
  dailyWalkRun: walk?.streak ?? 0,
  motionNote: totals
    ? spreadLine({
        activeHours: totals.activeHours,
        goldSteps: shiftedThreshold(DAILY_STEP_BASELINE, spreadShift(totals.activeHours)),
        baseSteps: DAILY_STEP_BASELINE,
      })
    : null,
  quests,
  selectedQuestIndex: nextStep.kind === 'quest' ? nextStep.index : null,
});
```

Define the fallback once and do not render its zeroes as confirmed while `buckets.data` is absent; the scene may use Branch, but open-details remains disabled until confirmed/cached totals exist:

```ts
const EMPTY_DAY_TOTALS: DayTotals = {
  steps: 0,
  distanceM: 0,
  activeKcal: 0,
  activeMinutes: 0,
  activeHours: 0,
};
```

- [ ] **Step 4: Render only the approved Balanced Mirror hierarchy**

Inside `<Screen bleed>`, render:

```tsx
const modalOwner = useModalOwner((state) => state.owner);
const detailsTriggerRef = useRef<View>(null);
const openDetails = () => {
  claimModal('today-details');
};
const closeDetails = () => {
  releaseModal('today-details');
};
const restoreDetailsFocus = () => {
  const node = findNodeHandle(detailsTriggerRef.current);
  if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
};

<Diorama
  height={HERO_HEIGHT}
  level={level}
  stage={stage}
  location={mirror.motion.location}
  figure={mirror.figure}
  body={mirror.body}
  figureLabel={livingCharacterLabel({
    characterName, level, location: mirror.motion.location, mind: mirror.mind,
  })}
  crest={ceilingReached}
>
  <View style={[styles.hud, { paddingTop: insets.top + space.sm }]}>
    <TodayChips level={level} xp={xp} streak={streak.data?.current_streak ?? 0} />
    <View style={styles.hudGap} />
    <Text style={styles.location}>{MOTION_LOCATION_NAMES[mirror.motion.location]}</Text>
    <TodayCount steps={steps} />
  </View>
</Diorama>

<View style={styles.page}>
  <TodayNextStep
    sentence={reaction?.sentence ?? (ceilingReached ? ceilingLine(characterName) : nextStepSentence(nextStep, characterName))}
    onDetails={openDetails}
    detailsDisabled={!buckets.data}
    ref={detailsTriggerRef}
  />
</View>
```

Render `TodayDetailsSheet` as a sibling after `Screen` using the exact ownership/navigation contract below. Challenge and help callbacks release the modal before routing.

```tsx
<TodayDetailsSheet
  visible={modalOwner === 'today-details'}
  sections={sections}
  userId={userId}
  timeZone={timeZone}
  showChallenges={disclosure.stage === 'full'}
  onClose={closeDetails}
  onDismiss={restoreDetailsFocus}
  onChallenges={() => {
    closeDetails();
    router.push('/train');
  }}
  onProgress={() => {
    closeDetails();
    router.push('/progress');
  }}
/>
```

Keep `WelcomePopups` mounted for accounts that have not completed its once-ever sequence; the modal owner serializes it with details/permissions.

- [ ] **Step 5: Preserve quest completion telemetry and first-score telemetry**

Keep the existing `markFirstScoreSeen()` implementation and the `quest_cleared.{slot}` daily-marker effect exactly keyed to the unchanged `quests` array. Moving a quest into details must not change completion or XP semantics.

- [ ] **Step 6: Delete the replaced one-consumer components and dead route logic**

Delete the files listed above. Remove Today’s `buildRacers()` helper, race imports, Mastery coin import, disclosure countdown paragraph, permanent help link, sleep/lane tiles, standalone sync row, Daily Walk card, Challenge card, and first-sync callout.

Remove `useTodaySteps()` from `character/queries.ts`. Remove only `heroSentence`, `sleepLine`, and `laneLine` plus their tests from `kairo-voice`; preserve `spreadLine` and `ceilingLine`. Update `useDisclosure`’s comment to say the Today details Challenge link is hidden at `core`; `/train` remains the only navigation gate.

- [ ] **Step 7: Run focused tests, orphan scan, and typecheck**

Run:

```bash
npx vitest run src/features/character/today-composition.test.ts src/features/quests/next-step.test.ts src/features/character/today-details.test.ts src/features/character/kairo-voice.test.ts
rg -n "QuestRings|TodayStatCoins|TodayTiles|DailyWalkCard|TrainEntry|RaceLine|FirstSyncCallout|useTodaySteps" app src
npm run typecheck
```

Expected: tests and typecheck PASS; `rg` returns no references to retired names.

- [ ] **Step 8: Commit the Today replacement**

```bash
git add -A app/'(tabs)'/index.tsx src/features/character src/features/quests src/features/train src/features/squad
git commit -m "feat: replace Today with the Balanced Living Mirror"
```

---

### Task 9: Measure the beta without measuring private health values

**Files:**

- Modify: `src/features/telemetry/events.ts`
- Modify: `src/features/telemetry/daily-marker.ts`
- Modify: `app/(tabs)/index.tsx`
- Create: `src/features/telemetry/living-mirror-events.test.ts`

**Interfaces:**

- Produces event types `today_seen`, `today_details_opened`, `next_step_shown`, and `character_reaction_seen`.
- Daily markers add `today_seen` and `next_step_shown`; details taps and actual reaction presentations are event-driven rather than render-driven.

- [ ] **Step 1: Write the telemetry source-policy test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const today = readFileSync('app/(tabs)/index.tsx', 'utf8');
const events = readFileSync('src/features/telemetry/events.ts', 'utf8');

describe('Living Mirror telemetry', () => {
  it.each(['today_seen', 'today_details_opened', 'next_step_shown', 'character_reaction_seen'])
    ('declares and emits %s', (name) => {
      expect(events).toContain(`'${name}'`);
      expect(today).toContain(`'${name}'`);
    });

  it('never sends raw health or stable identity fields', () => {
    expect(today).not.toMatch(/track\([^)]*(steps|distanceM|activeKcal|sleepMinutes|verifiedMinutes|occurrence|quest\.id)/s);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails on missing event types**

Run: `npx vitest run src/features/telemetry/living-mirror-events.test.ts`

Expected: FAIL because the four event names are absent.

- [ ] **Step 3: Add event names and daily markers**

Extend `AppEventType` with the four names and document their lifetimes. Extend `DailyMarker`/`ALL_MARKERS` with:

```ts
| 'today_seen'
| 'next_step_shown'
```

Keep the existing marker key version because the storage shape is unchanged: one marker key holding the last local date.

- [ ] **Step 4: Emit category-only events at semantic moments**

Add one effect after the resolved `nextStep` exists:

```ts
useEffect(() => {
  if (!userId || !localToday || quests.length === 0) return;
  if (claimDaily(userId, 'today_seen', localToday)) void track(userId, 'today_seen');
  if (claimDaily(userId, 'next_step_shown', localToday)) {
    void track(userId, 'next_step_shown', {
      category: nextStep.kind === 'quest' ? nextStep.category : 'none',
    });
  }
}, [userId, localToday, quests.length, nextStep.kind, nextStep.kind === 'quest' ? nextStep.category : 'none']);
```

The details handler is:

```ts
function openDetails() {
  if (!claimModal('today-details')) return;
  void track(userId, 'today_details_opened');
}
```

The reaction hook callback is:

```ts
const trackReactionImpression = useCallback((kind: ReactionKind) => {
  void track(userId, 'character_reaction_seen', { kind });
}, [userId]);
```

No payload includes an occurrence id or health number.

- [ ] **Step 5: Run telemetry tests and typecheck**

Run: `npx vitest run src/features/telemetry/living-mirror-events.test.ts src/features/telemetry/buffer.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit beta measurement**

```bash
git add src/features/telemetry/events.ts src/features/telemetry/daily-marker.ts src/features/telemetry/living-mirror-events.test.ts app/'(tabs)'/index.tsx
git commit -m "feat: measure Living Mirror engagement"
```

---

### Task 10: Update product authority and verify the complete beta

**Files:**

- Modify: `docs/roadmap.md`
- Modify: `docs/user-journey.md`
- Modify: `docs/mvp-scope.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-09-01-living-mirror-beta-design.md`

**Interfaces:**

- Consumes: the shipped implementation and approved spec.
- Produces: deviation #59 and one non-contradictory description of Today for future implementation and QA work.

- [ ] **Step 1: Record deviation #59 in the roadmap**

Append this row after #58, preserving the table’s existing columns:

```markdown
| 59 | Today as a character hero surrounded by three quest rings, race copy, stat coins, observation tiles, Daily Walk and Challenge cards (#50/#55/#58) | **Living Mirror beta.** KAIRO is the interface: Motion changes one scene location, lifetime Body changes ring/shadow presence, and verified sleep selects the daily Mind image. Today shows one step reading and one quest-backed next step; the complete raw-unit day, all three quest states, Daily Walk run and gated Challenge link move into one optional details sheet. | Founder decision 2026-09-01, spec `docs/superpowers/specs/2026-09-01-living-mirror-beta-design.md`. Companionship is primary, achievement secondary and social momentum optional. The three-quest engine, XP, scoring, race, Daily Walk and health collection are unchanged; activity counts without an app open. Static full-character PNGs cannot compose, so beta priority is reaction → non-neutral Mind → Motion pose → base, with Body expressed independently through presence. No care meter, punishment, new notification, schema, Edge Function, native dependency or Rive runtime. |
```

- [ ] **Step 2: Replace stale Today/disclosure prose in authoritative docs**

Use this paragraph in both `user-journey.md`’s Today section and `mvp-scope.md`’s Today section, adjusting only surrounding heading level:

```markdown
Today is the **Living Mirror**: KAIRO remains the largest visual, standing in a Motion location derived from live steps against `DAILY_STEP_BASELINE`. Compact Level and personal Streak remain in the scene; the day has one large raw reading (steps), one gentle next step selected from the unchanged three daily quests, and **See today's details**. Details contains Motion steps/distance/Daily Walk run, Body active energy and verified strength minutes when present, verified Mind sleep only when capable and measured, every quest state, relevant sync help, progress help, and the `full`-gated Challenge link. The Sky tab owns the race, You owns Mastery and records, and opening Kairo is never required for activity to count.
```

Update the progressive-disclosure table so Today’s gated item is “Challenge link in Today details”; per-stat detail remains on You and `/train` retains its route guard. Remove references to `TodayPanel`, three visible rings/cards, race summary on Today, Strain/Sleep tiles, and “Today adds no requests.”

- [ ] **Step 3: Update engineering invariants**

In `CLAUDE.md`, replace the stale Today block with these enforceable statements:

```markdown
**Today is the Living Mirror as of deviation #59.** Its always-visible order is the KAIRO scene, compact Level/personal Streak, Motion location plus one step figure, one quest-backed next step, then **See today's details**. The Sky owns the race; You owns Mastery and records. Do not put race copy, Mastery coins, three quest rings, sleep/lane tiles, a Daily Walk card, or a Challenge card back on Today.

**The visible next step never changes the quest contract.** `todayQuests()` still resolves exactly three entries from account + local date + tier + `has_sleep_source`; `selectNextStep()` only ranks those entries. The server grades the same set and completion XP still latches. An incomplete sleep quest is an observation in details, never a daytime action.

**The personal Streak and Daily Walk run are different.** The HUD reads `streaks.current_streak`; Motion details reads `dailyWalkState().streak`. Never alias either value or label.

**Static Living Mirror art is priority, not composition.** Current PNGs are flattened full-character images. Render one of reaction pose → non-neutral Mind state → Motion pose → base. Body uses ring/shadow presence; do not distort the canonical figure or manufacture pose × state × Body exports.

**Today now adds two owner-only reads deliberately:** today’s verified strength-session evidence and personal records. Neither reaches a projection or telemetry. The strength display predicate is contract-tested against the server allowlist; scoring remains server-authoritative.

**Native modals lease `src/ui/modal-owner.ts`.** Permission asks, welcome cards and Today details must never be visible under different owners in the same frame.
```

Also add the four telemetry types to the existing telemetry invariant, with daily/per-tap/per-occurrence lifetimes and the category-only payload rule.

- [ ] **Step 4: Run the complete automated suite**

Run:

```bash
npm run test:core
npm run typecheck
npm test
```

Expected: every command exits 0. Record the test counts in the commit message body or execution notes.

- [ ] **Step 5: Run static policy scans**

Run:

```bash
rg -n "QuestRings|TodayStatCoins|TodayTiles|DailyWalkCard|TrainEntry|RaceLine|FirstSyncCallout|useTodaySteps" app src
rg -n "\b(AGI|STR|MND|Bronze|Silver|Gold)\b" 'app/(tabs)/index.tsx' src/features/character/TodayDetailsSheet.tsx src/features/character/TodayNextStep.tsx src/features/character/today-details.ts
rg -n "10_000|10000" 'app/(tabs)/index.tsx' src/features/character/living-mirror.ts src/features/character/TodayDetailsSheet.tsx src/features/character/today-details.ts
git status --short
```

Expected: the first three scans return no matches; `git status` lists only the intended documentation/status edits before the final commit.

- [ ] **Step 6: Verify the visual and accessibility matrix in the iOS simulator**

Run `npm run ios`, then open `/kairo-lab` and Today. Check all of the following:

- Branch, Treeline, Valley, Ridge, and Clearing are visually distinct and also named in text.
- KAIRO remains larger than the step numeral; the next-step sentence stays fully visible on the smallest supported iPhone.
- Sleepy and well-rested images override Motion pose; normal/unknown/no-source states use Motion pose and show no `0h` or empty Mind row.
- Slim/fit/strong preview changes only ring/shadow presence and never stretches the figure.
- Level, record/Daily Walk, workout, and location reactions show one immediate static pose/sentence, expire after 2.2 seconds, and do not replay on reopen.
- Reduce Motion disables float and modal transition; the final pose/sentence still appears.
- Dynamic Type at the largest accessibility size keeps scene HUD groups out of the character, makes the details sheet scroll, and leaves Close reachable.
- VoiceOver order is character → Level → Streak (when nonzero) → location/steps → next step → details. Each details row is one stop; dismissal returns focus to **See today's details**.
- Opening details while Permission or Welcome owns the modal does nothing; once that surface closes, details can open normally.
- A `core` account sees no Challenge link; a `full` account does, and `/train` still guards cold deep links.
- Offline/cached state retains the last confirmed scene and values; fresh healthy sync copy is absent, while syncing/stale/failed/no-data remain available in details.

- [ ] **Step 7: Mark the design status implemented after verification**

Change the spec status from:

```markdown
**Status:** Design approved; awaiting written-spec review
```

to:

```markdown
**Status:** Implemented and verified in the current beta
```

- [ ] **Step 8: Commit documentation and verification status**

```bash
git add docs/roadmap.md docs/user-journey.md docs/mvp-scope.md CLAUDE.md docs/superpowers/specs/2026-09-01-living-mirror-beta-design.md
git commit -m "docs: record Living Mirror beta deviation"
```

- [ ] **Step 9: Confirm the final branch is clean**

Run: `git status --short`

Expected: no output.

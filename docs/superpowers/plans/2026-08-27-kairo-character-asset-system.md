# KAIRO Character Asset System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full KAIRO MVP as one canonical, embedded Rive character whose sleep state, strength tier, sustained pose, one-shot reaction, and seven cosmetic slots are resolved from typed product data, with static PNG fallbacks and thumbnails everywhere live Rive is inappropriate.

**Architecture:** The Bible, character spec, golden reference, and three checked-in JSON manifests form the semantic contract. Pure TypeScript validates those manifests and resolves product values into stable character IDs. One local `kairo_v1.riv` owns KAIRO's rig, visual layers, animation graph, data-bound properties, and cosmetics. A React Native provider caches the Rive file, while each live renderer creates its own view-model instance. Today and onboarding render live Rive; list and race surfaces render versioned PNG exports. App UI continues to own habitat, layout, ground shadow, presence ring, and accessibility.

**Tech Stack:** TypeScript 6, Expo SDK 57, Expo Router, React Native 0.86, `@rive-app/react-native` stable `~0.4.19`, Rive Editor, Vitest 3, Metro, PNG asset exports, iOS and Android development builds.

**Spec:** `docs/superpowers/specs/2026-08-27-kairo-character-asset-system-design.md`

## Global Constraints

- Use the canonical sources in this order: `assets/CHARACTER_BIBLE.md`, `assets/CHARACTER_SPEC.json`, `assets/reference/KAIRO_GOLDEN_REFERENCE.png`, then `assets/character/README.md`.
- Preserve the golden reference's head silhouette, eye placement, beak, crest, wing roots, proportions, feet, and base palette. Do not reinterpret KAIRO while rigging.
- Use the applicable repository skills during execution: `kairo-character-assets` for canonical art and exports, `kairo-poses-states` for motion semantics, `kairo-cosmetics` for wearable layers, and `kairo-rive` for the `.riv` file and runtime integration. Use `imagegen` only for a bitmap source or repair that Rive Editor cannot produce faithfully from the approved reference.
- Keep one embedded `.riv`. Do not create a `.riv` per pose, state, strength tier, or cosmetic.
- Keep cosmetics as selectable layers. Do not flatten state × pose × cosmetic combinations into PNGs.
- Add no inventory, ownership, pricing, rarity, unlock, shop, currency, persistence, Supabase, scoring, HealthKit, or remote-asset work.
- Add only the stable Rive React Native line: `@rive-app/react-native@~0.4.19`. Do not adopt the 0.5 beta API in this plan.
- Load the `.riv` and every PNG through literal `require()` expressions owned by `character-assets.ts`; Metro cannot bundle computed asset paths reliably.
- Rive owns KAIRO's visual state and animation transitions. React Native owns habitat, layout, ground shadow, presence ring, accessible label, load/error fallback, and Reduced Motion gating.
- Never render a blank character box. Before Rive and Reduce Motion are both ready, and on any Rive error, render `kairo_base_front_v1.png`.
- Every live `KairoRenderer` has an independent view-model instance. Only the parsed `RiveFile` is shared.
- Today and onboarding are the only live-Rive product surfaces in this MVP. Sky markers, leaderboard rows, and event-member rows use static PNGs.
- `level_up` is a one-shot reaction, never a sustained pose. `race_victory` is a sustained result pose; `victory` is a one-shot reaction.
- A higher-priority reaction may preempt the active reaction. Equal- and lower-priority reactions are ignored, not queued. Completion returns to the latest valid sustained pose.
- Every cosmetic must work in all six poses. If Rive authoring proves one cannot fit without clipping or changing canonical anatomy, stop and request an explicit catalog or compatibility decision.
- Use the existing `mindTierFor` and `ratingForStatPoints`; do not duplicate their thresholds.
- Do not hand-edit generated `ios/` or `android/` native projects. This app uses CNG; regenerate them through `npm run prebuild` after the dependency and Metro contract land.
- Preserve unrelated staged and unstaged work. Stage and commit only the files named by the current task.
- Every code task starts with a focused failing test, reaches a focused pass, then runs `npm run typecheck` and `npm test` before commit. Binary-authoring tasks use an asset-existence test first and the KAIRO Lab/native runtime as the behavioral acceptance harness.

## Planned File Map

```text
assets/
  CHARACTER_BIBLE.md                              # add neck; poses/reactions agree
  CHARACTER_SPEC.json                            # schema 0.2 and Rive v1 identity
  reference/KAIRO_GOLDEN_REFERENCE.png           # unchanged canonical reference
  character/
    README.md                                     # asset authority and export rules
    KAIRO_V1_COMPATIBILITY.md                     # final pose/cosmetic QA matrix
    rive/kairo_v1.riv                             # one canonical embedded runtime asset
    base/kairo_base_front_v1.png
    poses/kairo_pose_{idle,sleep,walk,run,workout,race_victory}_v1.png
    states/kairo_state_{sleepy,normal,well_rested}_v1.png
    cosmetics/cosmetic_{slot}_{id}_v1.png

data/
  character.json                                  # asset, defaults, binding paths, slots
  cosmetics.json                                  # 12-item catalog and compatibility
  animations.json                                 # 6 poses, 5 reactions, transition policy

src/features/character/
  character-contract.ts                           # constants, types, checked-in validation
  character-contract.test.ts
  character-resolver.ts                           # product values -> semantic selection
  character-resolver.test.ts
  character-assets.ts                             # literal Metro requires only
  character-assets.test.ts                        # file and registry completeness
  character-surface-policy.ts                     # pure compact-context pose map
  rive-binding.ts                                 # pure property-write/reaction plan
  rive-binding.test.ts
  KairoRiveProvider.tsx                           # one shared RiveFile + motion readiness
  KairoRenderer.tsx                               # one VM instance, bindings, fallback
  KairoThumbnail.tsx                              # static compact renderer
  kairo-lab-contract.ts                           # pure Lab options/presets for tests
  KairoLab.tsx                                    # development contract/visual harness
  CharacterFigure.tsx                             # app-owned ring/shadow around renderer
  Diorama.tsx                                     # semantic inputs for Today
  species-art.ts                                  # habitat registry only after migration

app/
  _layout.tsx                                     # provider boundary
  kairo-lab.tsx                                   # development-only route
  (tabs)/index.tsx                                # live Today data and level-up occurrence
  (onboard)/name.tsx                              # live neutral KAIRO
  event/[id].tsx                                  # static KAIRO thumbnail

src/features/squad/
  SkyMarker.tsx                                   # static run thumbnail
  LeaderboardRow.tsx                              # static idle thumbnail
```

---

## Task 1: Land the canonical manifests and authority updates

**Files:**
- Create: `data/character.json`
- Create: `data/cosmetics.json`
- Create: `data/animations.json`
- Create: `src/features/character/character-contract.ts`
- Create: `src/features/character/character-contract.test.ts`
- Modify: `assets/CHARACTER_BIBLE.md`
- Modify: `assets/CHARACTER_SPEC.json`
- Modify: `assets/character/README.md`

**Interfaces:**
- Consumes: the approved design spec and golden reference.
- Produces: all stable semantic IDs, `KairoSelection`, `KairoRenderState`, manifest types, and `validateCharacterManifests()`.
- Does not consume React Native or Metro assets, so the module remains loadable by root Vitest.

- [ ] **Step 1: Write the failing contract test**

Create `character-contract.test.ts`. It must import the three manifests and the validator, then assert the exact contract:

```ts
import { describe, expect, it } from 'vitest';
import animations from '../../../data/animations.json';
import character from '../../../data/character.json';
import cosmetics from '../../../data/cosmetics.json';
import {
  COSMETIC_SLOTS,
  KAIRO_POSES,
  KAIRO_REACTIONS,
  SLEEP_STATES,
  STRENGTH_TIERS,
  validateCharacterManifests,
} from './character-contract.ts';

describe('KAIRO character contract', () => {
  it('has the approved semantic surface', () => {
    expect(SLEEP_STATES).toEqual(['sleepy', 'normal', 'well_rested']);
    expect(STRENGTH_TIERS).toEqual(['slim', 'fit', 'strong']);
    expect(KAIRO_POSES).toEqual([
      'idle',
      'sleep',
      'walk',
      'run',
      'workout',
      'race_victory',
    ]);
    expect(KAIRO_REACTIONS).toEqual([
      'happy',
      'excited',
      'tired',
      'victory',
      'level_up',
    ]);
    expect(COSMETIC_SLOTS).toEqual([
      'body',
      'feet',
      'back',
      'neck',
      'face',
      'head',
      'effect',
    ]);
    expect(KAIRO_POSES).not.toContain('level_up');
  });

  it('validates every checked-in manifest as one contract', () => {
    expect(validateCharacterManifests({ character, cosmetics, animations })).toEqual([]);
  });

  it('registers all 12 cosmetics for all six poses', () => {
    expect(cosmetics.items).toHaveLength(12);
    for (const item of cosmetics.items) {
      expect(item.compatiblePoses).toEqual(KAIRO_POSES);
    }
  });

  it('keeps level-up and victory semantics distinct', () => {
    expect(animations.poses.map((entry) => entry.id)).toContain('race_victory');
    expect(animations.poses.map((entry) => entry.id)).not.toContain('level_up');
    expect(animations.reactions.map((entry) => entry.id)).toContain('level_up');
    expect(animations.reactions.map((entry) => entry.id)).toContain('victory');
  });
});
```

- [ ] **Step 2: Run the test and record the expected failure**

Run:

```bash
npx vitest run --config vitest.config.ts src/features/character/character-contract.test.ts
```

Expected: FAIL because the manifests and contract module do not exist.

- [ ] **Step 3: Create the pure contract module**

Define readonly ID arrays and derived unions, then separate selection from the runtime-ready state:

```ts
export const SLEEP_STATES = ['sleepy', 'normal', 'well_rested'] as const;
export const STRENGTH_TIERS = ['slim', 'fit', 'strong'] as const;
export const KAIRO_POSES = [
  'idle',
  'sleep',
  'walk',
  'run',
  'workout',
  'race_victory',
] as const;
export const KAIRO_REACTIONS = ['happy', 'excited', 'tired', 'victory', 'level_up'] as const;
export const COSMETIC_SLOTS = ['body', 'feet', 'back', 'neck', 'face', 'head', 'effect'] as const;

export type SleepState = (typeof SLEEP_STATES)[number];
export type StrengthTier = (typeof STRENGTH_TIERS)[number];
export type KairoPose = (typeof KAIRO_POSES)[number];
export type KairoReactionId = (typeof KAIRO_REACTIONS)[number];
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];
export type CosmeticId =
  | 'runner_cap'
  | 'woven_salakot'
  | 'leaf_crown'
  | 'round_glasses'
  | 'flight_goggles'
  | 'sunlit_bandana'
  | 'sampaguita_garland'
  | 'trail_vest'
  | 'woven_cape'
  | 'trail_sneakers'
  | 'rain_boots'
  | 'firefly_aura';

export interface KairoSelection {
  sleepState: SleepState;
  strengthTier: StrengthTier;
  pose: KairoPose;
  cosmetics: Partial<Record<CosmeticSlot, CosmeticId>>;
  reaction?: { id: KairoReactionId; occurrence: string };
}

export interface KairoRenderState extends KairoSelection {
  reducedMotion: boolean;
}
```

`validateCharacterManifests()` must return deterministic path-specific strings and check:

- the same `schemaVersion: 1` and `characterId: "kairo_creature"` in all files;
- `assetVersion: "v1"`, artboard `KAIRO`, view model `KairoCharacter`, and state machine `KairoStateMachine`;
- exact property path/type pairs from the approved spec;
- defaults `normal + fit + idle`;
- exact slot order `10, 20, 30, 40, 50, 60, 100`;
- unique cosmetic IDs, correct slot/anchor pairs, footwear component anchors, and enum value equal to item ID;
- every item lists all six poses in canonical order;
- exact pose timing/completion and reaction priority/duration/affected-region data;
- no `level_up` pose and no `race_victory` reaction.

Do not throw from the validator. Tests and development diagnostics consume the returned list. The production resolver handles unknown inputs safely.

- [ ] **Step 4: Create the three exact manifests**

Use the approved paths:

```json
{
  "sleepState": { "path": "appearance/sleep_state", "type": "enum" },
  "strengthTier": { "path": "appearance/strength_tier", "type": "enum" },
  "pose": { "path": "motion/pose", "type": "enum" },
  "reaction": { "path": "motion/reaction", "type": "enum" },
  "playReaction": { "path": "motion/play_reaction", "type": "trigger" },
  "reducedMotion": { "path": "motion/reduced_motion", "type": "boolean" }
}
```

Add these cosmetic property definitions to `data/character.json` in slot order:

```json
{
  "body": { "path": "cosmetics/body", "type": "enum", "order": 10 },
  "feet": { "path": "cosmetics/feet", "type": "enum", "order": 20 },
  "back": { "path": "cosmetics/back", "type": "enum", "order": 30 },
  "neck": { "path": "cosmetics/neck", "type": "enum", "order": 40 },
  "face": { "path": "cosmetics/face", "type": "enum", "order": 50 },
  "head": { "path": "cosmetics/head", "type": "enum", "order": 60 },
  "effect": { "path": "cosmetics/effect", "type": "enum", "order": 100 }
}
```

Populate `data/cosmetics.json` with exactly the 12 rows in spec §6.2. Each enum has `none` plus its slot's IDs. Footwear contains both `{ "anchor": "left_foot" }` and `{ "anchor": "right_foot" }` components; other items contain their one approved primary anchor. Every `compatiblePoses` array is exactly `KAIRO_POSES`.

Populate `data/animations.json` with these exact behavior values:

```ts
const poses = [
  ['idle', 2.4, 'loop'],
  ['sleep', 2.8, 'loop'],
  ['walk', 0.8, 'loop'],
  ['run', 0.5, 'loop'],
  ['workout', 1.2, 'loop'],
  ['race_victory', 1.4, 'hold'],
] as const;

const reactions = [
  ['tired', 10, 1.2, ['face', 'crest', 'posture']],
  ['happy', 20, 0.9, ['face', 'crest', 'wings']],
  ['excited', 30, 1.1, ['face', 'crest', 'wings', 'root']],
  ['victory', 40, 1.4, ['face', 'wings', 'root']],
  ['level_up', 50, 1.8, ['face', 'crest', 'wings', 'root']],
] as const;
```

The JSON records `transitionSeconds: 0.18`, `interrupts: "pose"`, `queue: "ignore_equal_or_lower"`, `preemption: "higher_priority"`, `loop: false`, and `returnTo: "current_pose"` for reactions.

- [ ] **Step 5: Update the canonical authority files in the same change**

In `CHARACTER_BIBLE.md`, add `neck` to cosmetic slots, list only the six sustained poses, and list `level_up` only under reactions. In `CHARACTER_SPEC.json`, set schema version `0.2`, asset version `v1`, canonical Rive path `character/rive/kairo_v1.riv`, the six-pose/five-reaction lists, and the approved Rive names. Update `assets/character/README.md` to explain authority order, folder roles, naming/version rules, literal Metro registration, transparent export requirements, and that the `.riv` is the runtime visual source while JSON is the semantic source.

- [ ] **Step 6: Verify focused and full checks**

Run:

```bash
npx vitest run --config vitest.config.ts src/features/character/character-contract.test.ts
npm run typecheck
npm test
```

Expected: all PASS.

- [ ] **Step 7: Commit only Task 1 files**

```bash
git add assets/CHARACTER_BIBLE.md assets/CHARACTER_SPEC.json assets/character/README.md data/character.json data/cosmetics.json data/animations.json src/features/character/character-contract.ts src/features/character/character-contract.test.ts
git commit --only assets/CHARACTER_BIBLE.md assets/CHARACTER_SPEC.json assets/character/README.md data/character.json data/cosmetics.json data/animations.json src/features/character/character-contract.ts src/features/character/character-contract.test.ts -m "feat(character): define KAIRO asset contract"
```

---

## Task 2: Resolve product data and reaction occurrences in pure TypeScript

**Files:**
- Create: `src/features/character/character-resolver.ts`
- Create: `src/features/character/character-resolver.test.ts`

**Interfaces:**
- Consumes: `mindTierFor`, `ratingForStatPoints`, contract IDs, and the cosmetics catalog.
- Produces: `sleepStateFor()`, `strengthTierFor()`, `reactionForLevelChange()`, `sanitizeCosmetics()`, and `resolveKairoSelection()`.
- Never imports React, React Native, Rive, Metro assets, stores, queries, or the clock.

- [ ] **Step 1: Write boundary-first failing tests**

Import `statPointsForRating` from `@kairo/core` so the strength assertions exercise lifetime-point boundaries for ratings 5/6 and 20/21 without copying the progression curve.

```ts
describe('sleepStateFor', () => {
  it.each([
    [undefined, 'normal'],
    [null, 'normal'],
    [0, 'sleepy'],
    [299, 'sleepy'],
    [300, 'sleepy'],
    [360, 'normal'],
    [420, 'well_rested'],
    [540, 'well_rested'],
    [541, 'sleepy'],
  ])('maps %s scored minutes to %s', (minutes, expected) => {
    expect(sleepStateFor(minutes)).toBe(expected);
  });
});

describe('strengthTierFor', () => {
  it('uses neutral fit while lifetime STR is unresolved', () => {
    expect(strengthTierFor(undefined)).toBe('fit');
    expect(strengthTierFor(null)).toBe('fit');
  });

  it('maps rating boundaries rather than treating points as ratings', () => {
    expect(strengthTierFor(0)).toBe('slim');
    expect(strengthTierFor(statPointsForRating(6) - 1)).toBe('slim');
    expect(strengthTierFor(statPointsForRating(6))).toBe('fit');
    expect(strengthTierFor(statPointsForRating(21) - 1)).toBe('fit');
    expect(strengthTierFor(statPointsForRating(21))).toBe('strong');
  });
});

describe('reactionForLevelChange', () => {
  it('does not fire on initial data resolution', () => {
    expect(reactionForLevelChange(null, 8)).toBeUndefined();
  });

  it('creates a stable occurrence only for a real increase', () => {
    expect(reactionForLevelChange(8, 9)).toEqual({
      id: 'level_up',
      occurrence: 'level:8->9',
    });
    expect(reactionForLevelChange(9, 9)).toBeUndefined();
    expect(reactionForLevelChange(9, 8)).toBeUndefined();
  });
});
```

Also test defaults, unknown pose fallback, one item per slot, a cosmetic in the wrong slot being dropped, and valid selections surviving unchanged.

- [ ] **Step 2: Run the test and verify missing exports fail**

```bash
npx vitest run --config vitest.config.ts src/features/character/character-resolver.test.ts
```

Expected: FAIL because `character-resolver.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure resolver**

Use the shared engines rather than local thresholds:

```ts
export function sleepStateFor(minutes: number | null | undefined): SleepState {
  if (minutes == null) return 'normal';
  const tier = mindTierFor(minutes);
  if (tier === 'gold') return 'well_rested';
  if (tier === 'silver') return 'normal';
  return 'sleepy';
}

export function strengthTierFor(points: number | null | undefined): StrengthTier {
  if (points == null) return 'fit';
  const rating = ratingForStatPoints(points);
  if (rating <= 5) return 'slim';
  if (rating <= 20) return 'fit';
  return 'strong';
}

export function reactionForLevelChange(
  previous: number | null,
  current: number | null,
): KairoSelection['reaction'] {
  if (previous == null || current == null || current <= previous) return undefined;
  return { id: 'level_up', occurrence: `level:${previous}->${current}` };
}
```

`sanitizeCosmetics()` looks up IDs in the checked-in catalog, verifies the declared slot matches the selected slot, drops unknown/mismatched IDs, and logs a development-only diagnostic. `resolveKairoSelection()` defaults missing/invalid inputs to `normal + fit + idle + {}` and carries an already-created reaction occurrence unchanged.

- [ ] **Step 4: Verify the resolver and full suite**

```bash
npx vitest run --config vitest.config.ts src/features/character/character-resolver.test.ts
npm run typecheck
npm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/character/character-resolver.ts src/features/character/character-resolver.test.ts
git commit --only src/features/character/character-resolver.ts src/features/character/character-resolver.test.ts -m "feat(character): resolve KAIRO product state"
```

---

## Task 3: Author the complete canonical Rive file

**Files:**
- Create: `assets/character/rive/kairo_v1.riv`
- Create: `src/features/character/character-assets.test.ts`

**Interfaces:**
- Consumes: golden reference, updated Bible/spec, and all three manifests.
- Produces: artboard `KAIRO`, view model `KairoCharacter`, state machine `KairoStateMachine`, all semantic data-bound properties, six poses, five reactions, three sleep appearances, three strength appearances, seven cosmetic slots, and all 12 cosmetics.
- Behavioral verification occurs in Rive Editor now and in the native KAIRO Lab after Tasks 5–10.

- [ ] **Step 1: Write the failing asset-presence test**

Create a Node-only test that resolves the repository root and asserts the canonical binary and every required export path. Begin with the `.riv` assertion so this task has a visible red state:

```ts
const REQUIRED_RIVE = ['assets/character/rive/kairo_v1.riv'];

it('contains the embedded canonical Rive asset', () => {
  for (const relativePath of REQUIRED_RIVE) {
    expect(existsSync(resolve(REPO_ROOT, relativePath)), relativePath).toBe(true);
    expect(statSync(resolve(REPO_ROOT, relativePath)).size, relativePath).toBeGreaterThan(0);
  }
});
```

Run:

```bash
npx vitest run --config vitest.config.ts src/features/character/character-assets.test.ts
```

Expected: FAIL because `kairo_v1.riv` is absent.

- [ ] **Step 2: Build the canonical vector hierarchy in Rive Editor**

Use the `kairo-character-assets` and `kairo-rive` skills. Create one transparent 570×636 artboard named `KAIRO`; import the golden reference as a locked guide and construct this named hierarchy:

```text
KAIRO
  rig
    root
    body
    neck
    head
    beak_upper
    beak_lower
    eye_left
    eye_right
    crest
    wing_left
    wing_right
    leg_left
    leg_right
    foot_left
    foot_right
  appearance
    sleep_sleepy
    sleep_normal
    sleep_well_rested
    strength_slim
    strength_fit
    strength_strong
  cosmetics
    body
    feet
    back
    neck
    face
    head
    effect
```

Register the exact anchors from `CHARACTER_SPEC.json`: `head_top`, `head_center`, `neck`, `body_center`, `back`, `left_foot`, and `right_foot`. Keep anchor transforms parented to the relevant bones so cosmetics follow all six poses. Do not draw a habitat, shadow, ring, floor, or opaque background.

- [ ] **Step 3: Create the exact data-binding surface**

Create view model `KairoCharacter` with these properties and enum values:

```text
appearance/sleep_state     enum     sleepy | normal | well_rested
appearance/strength_tier   enum     slim | fit | strong
motion/pose                enum     idle | sleep | walk | run | workout | race_victory
motion/reaction            enum     happy | excited | tired | victory | level_up
motion/play_reaction       trigger
motion/reduced_motion      boolean
cosmetics/body             enum     none | trail_vest
cosmetics/feet             enum     none | trail_sneakers | rain_boots
cosmetics/back             enum     none | woven_cape
cosmetics/neck             enum     none | sunlit_bandana | sampaguita_garland
cosmetics/face             enum     none | round_glasses | flight_goggles
cosmetics/head             enum     none | runner_cap | woven_salakot | leaf_crown
cosmetics/effect           enum     none | firefly_aura
```

Set defaults to `normal`, `fit`, `idle`, `false`, and `none` for each cosmetic.

- [ ] **Step 4: Rig the nine persistent appearance combinations**

Use the approved anatomy as the neutral `fit + normal` base. Strength may alter controlled silhouette proportions, never identity landmarks:

- `slim`: slightly narrower torso/upper-wing mass while head, beak, eyes, crest, feet, and height remain canonical.
- `fit`: the golden-reference neutral proportions.
- `strong`: modestly broader torso/upper-wing mass without scaling the head or distorting anchors.

Sleep layers affect eyelids, eye openness, crest rest, and posture only:

- `sleepy`: lowered lids and subtly relaxed posture.
- `normal`: golden-reference neutral expression.
- `well_rested`: open alert eyes, lifted crest, and healthy posture without changing palette.

Switching either enum must preserve pose, reaction state, and cosmetics.

- [ ] **Step 5: Author the six sustained poses**

Use the `kairo-poses-states` skill and match manifest timing exactly:

```text
idle           2.4 s loop
sleep          2.8 s loop
walk           0.8 s loop
run            0.5 s loop
workout        1.2 s loop
race_victory   1.4 s entrance, then hold settled pose
transition     0.18 s normal blend
```

The six animations must preserve anchor attachment and the artboard footprint. Reduced Motion selects the settled frame of the current pose, disables looping/root translation, and still applies appearance and cosmetics.

- [ ] **Step 6: Author all 12 cosmetics as enum-controlled layers**

Use the `kairo-cosmetics` skill. Build the exact approved catalog and draw order. Footwear is a pair under one enum selection, with independent left/right components. For each cosmetic, scrub every sustained pose and verify:

- no clipping against the 570×636 artboard;
- no detachment from its registered anchor;
- no coverage of eyes, beak articulation, or canonical silhouette beyond its intentional wearable area;
- no layer-order inversion during turns or wing motion;
- transparent background and no baked shadow.

- [ ] **Step 7: Author reactions and state-machine arbitration**

Create `KairoStateMachine`. Pose changes use the 0.18-second transition. `motion/play_reaction` samples `motion/reaction` and enters the selected non-looping reaction. Implement the exact priorities and durations from `animations.json`. Higher priority preempts; equal/lower is ignored; nothing queues. Every completion returns to the latest pose enum, not the pose active when the reaction began.

In Rive Editor, exercise this deterministic sequence:

```text
idle -> happy -> run -> level_up -> workout
```

Expected: happy begins; run becomes the pending/current sustained pose; level_up preempts happy; workout becomes the latest sustained pose; level_up completes into workout. No reaction loops or app timer is involved.

- [ ] **Step 8: Export and save the binary**

Remove or hide the guide image, save/export the runtime file as `assets/character/rive/kairo_v1.riv`, close it, reopen the exported binary, and confirm the three exact names plus every view-model path remain present. Run the current asset test again and expect it to pass; Task 4 expands that test before creating the PNGs.

- [ ] **Step 9: Commit the Rive binary and its existence test**

```bash
git add assets/character/rive/kairo_v1.riv src/features/character/character-assets.test.ts
git commit --only assets/character/rive/kairo_v1.riv src/features/character/character-assets.test.ts -m "feat(character): author canonical KAIRO Rive rig"
```

---

## Task 4: Export versioned fallbacks, pose thumbnails, states, and cosmetic QA sheets

**Files:**
- Create: `assets/character/base/kairo_base_front_v1.png`
- Create: six files under `assets/character/poses/`
- Create: three files under `assets/character/states/`
- Create: 12 files under `assets/character/cosmetics/`
- Modify: `src/features/character/character-assets.test.ts`

**Interfaces:**
- Consumes: `kairo_v1.riv` only; exports are snapshots of the canonical rig, not separately redesigned art.
- Produces: transparent PNG fallbacks/previews and complete file assertions.

- [ ] **Step 1: Expand the failing asset test to list every exact export**

The required cosmetics are:

```text
cosmetic_head_runner_cap_v1.png
cosmetic_head_woven_salakot_v1.png
cosmetic_head_leaf_crown_v1.png
cosmetic_face_round_glasses_v1.png
cosmetic_face_flight_goggles_v1.png
cosmetic_neck_sunlit_bandana_v1.png
cosmetic_neck_sampaguita_garland_v1.png
cosmetic_body_trail_vest_v1.png
cosmetic_back_woven_cape_v1.png
cosmetic_feet_trail_sneakers_v1.png
cosmetic_feet_rain_boots_v1.png
cosmetic_effect_firefly_aura_v1.png
```

Add base, six pose, three state, and these 12 cosmetic paths to `REQUIRED_PNG`. Assert existence, nonzero size, and the PNG eight-byte signature. Run the focused test and expect all missing PNG paths to fail.

- [ ] **Step 2: Export the base and behavior PNGs from Rive**

Export on a transparent 570×636 canvas with KAIRO centered and no habitat/ring/shadow:

- base: front, `normal + fit + idle`, neutral settled frame, no cosmetics;
- poses: `normal + fit`, no cosmetics, one readable representative frame per six poses;
- states: `fit + idle`, no cosmetics, one neutral representative frame for each sleep state.

Preserve the artboard coordinate space in every file so fallback-to-live swaps do not jump.

- [ ] **Step 3: Export each cosmetic QA PNG**

Export only the selected cosmetic layer or paired footwear layers on the unchanged transparent 570×636 coordinate canvas. Hide KAIRO's base art in the exported PNG, but inspect the layer over KAIRO inside Rive before export. The result is an aligned QA/source preview, not a cropped store icon and not a flattened runtime variant.

- [ ] **Step 4: Visually inspect representative and boundary exports**

Open at least base, `sleep`, `run`, `race_victory`, `sleepy`, `well_rested`, both footwear items, `woven_cape`, `round_glasses`, and `firefly_aura`. Confirm transparency, identity, anchor placement, feet pairing, layer order, and unchanged footprint.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run --config vitest.config.ts src/features/character/character-assets.test.ts
npm run typecheck
npm test
git add assets/character/base assets/character/poses assets/character/states assets/character/cosmetics src/features/character/character-assets.test.ts
git commit --only assets/character/base assets/character/poses assets/character/states assets/character/cosmetics src/features/character/character-assets.test.ts -m "feat(character): export KAIRO fallback catalog"
```

---

## Task 5: Install and configure the stable Rive native runtime

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `metro.config.js`
- Create: `src/features/character/character-assets.ts`

**Interfaces:**
- Consumes: `.riv` and PNG files from Tasks 3–4.
- Produces: the installed native runtime, Metro `.riv` support, `KAIRO_RIVE`, `KAIRO_BASE_ASSET`, `KAIRO_POSE_ASSETS`, `KAIRO_STATE_ASSETS`, and `KAIRO_COSMETIC_ASSETS`.

- [ ] **Step 1: Extend the failing registry test before creating the registry**

Read `character-assets.ts` as text and assert that every runtime path is a literal `require('...')`. Assert `metro.config.js` adds `riv` without replacing the existing asset extensions. Run the focused test and expect failure because the registry does not exist and Metro lacks `riv`.

- [ ] **Step 2: Install the approved stable line**

```bash
npm install @rive-app/react-native@~0.4.19
```

Confirm the lockfile resolves a version `>=0.4.19` and `<0.5.0`.

- [ ] **Step 3: Add `.riv` to Metro's existing asset extensions**

Add this duplicate-safe extension without disturbing workspace configuration:

```js
if (!config.resolver.assetExts.includes('riv')) {
  config.resolver.assetExts.push('riv');
}
```

- [ ] **Step 4: Create the literal asset registry**

The registry starts with these explicit entries:

```ts
export const KAIRO_RIVE = require('../../../assets/character/rive/kairo_v1.riv');
export const KAIRO_BASE_ASSET = require('../../../assets/character/base/kairo_base_front_v1.png');

export const KAIRO_POSE_ASSETS: Record<KairoPose, ImageSourcePropType> = {
  idle: require('../../../assets/character/poses/kairo_pose_idle_v1.png'),
  sleep: require('../../../assets/character/poses/kairo_pose_sleep_v1.png'),
  walk: require('../../../assets/character/poses/kairo_pose_walk_v1.png'),
  run: require('../../../assets/character/poses/kairo_pose_run_v1.png'),
  workout: require('../../../assets/character/poses/kairo_pose_workout_v1.png'),
  race_victory: require('../../../assets/character/poses/kairo_pose_race_victory_v1.png'),
};
```

Add equally literal maps for base, states, and all 12 cosmetics. Do not generate paths from IDs.

- [ ] **Step 5: Verify focused and full checks**

```bash
npx vitest run --config vitest.config.ts src/features/character/character-assets.test.ts
npm run typecheck
npm test
npm run doctor
```

Expected: all PASS and Expo Doctor reports no dependency-version mismatch.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json metro.config.js src/features/character/character-assets.ts src/features/character/character-assets.test.ts
git commit --only package.json package-lock.json metro.config.js src/features/character/character-assets.ts src/features/character/character-assets.test.ts -m "feat(character): add embedded Rive runtime assets"
```

---

## Task 6: Bind semantic state to Rive without leaking product logic

**Files:**
- Create: `src/features/character/rive-binding.ts`
- Create: `src/features/character/rive-binding.test.ts`
- Create: `src/features/character/KairoRiveProvider.tsx`
- Create: `src/features/character/KairoRenderer.tsx`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `KairoSelection`, manifest property paths, `KAIRO_RIVE`, Rive async APIs, and `useReduceMotionState()`.
- Produces: `bindingPlanFor(state)`, shared-file provider context, and `<KairoRenderer selection height accessibilityLabel onReactionConsumed />`.
- `KairoRenderer` internally adds the provider's resolved Reduced Motion value to form `KairoRenderState`; before it is known, the renderer shows a PNG fallback.

- [ ] **Step 1: Write the pure binding-plan tests**

```ts
it('writes every persistent property in manifest order', () => {
  expect(bindingPlanFor({
    sleepState: 'sleepy',
    strengthTier: 'strong',
    pose: 'run',
    cosmetics: { head: 'runner_cap', feet: 'trail_sneakers' },
    reducedMotion: false,
  })).toEqual({
    enums: [
      ['appearance/sleep_state', 'sleepy'],
      ['appearance/strength_tier', 'strong'],
      ['motion/pose', 'run'],
      ['cosmetics/body', 'none'],
      ['cosmetics/feet', 'trail_sneakers'],
      ['cosmetics/back', 'none'],
      ['cosmetics/neck', 'none'],
      ['cosmetics/face', 'none'],
      ['cosmetics/head', 'runner_cap'],
      ['cosmetics/effect', 'none'],
    ],
    booleans: [['motion/reduced_motion', false]],
  });
});

it('fires once per reaction occurrence, including repeated ids', () => {
  const first = reactionCommand(undefined, { id: 'happy', occurrence: 'quest:10' });
  const repeat = reactionCommand('quest:10', { id: 'happy', occurrence: 'quest:10' });
  const second = reactionCommand('quest:10', { id: 'happy', occurrence: 'quest:11' });
  expect(first).toEqual({ enumValue: 'happy', trigger: true, occurrence: 'quest:10' });
  expect(repeat).toBeUndefined();
  expect(second).toEqual({ enumValue: 'happy', trigger: true, occurrence: 'quest:11' });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
npx vitest run --config vitest.config.ts src/features/character/rive-binding.test.ts
```

Expected: FAIL because `rive-binding.ts` does not exist.

- [ ] **Step 3: Implement `rive-binding.ts` as a pure adapter plan**

Read paths from `data/character.json`; do not repeat them as untracked strings. Missing cosmetics emit `none`. `reactionCommand()` changes the reaction enum before requesting the trigger and deduplicates only the exact occurrence string. No timer or reaction-duration logic appears here.

- [ ] **Step 4: Add the shared Rive-file provider**

`KairoRiveProvider` calls stable `useRiveFile(KAIRO_RIVE)`, exposes `{ riveFile, riveError, reduceMotion, motionReady }`, and never creates a view-model instance. Mount it inside the existing root providers in `app/_layout.tsx`, not once per screen.

Use `useReduceMotionState()` here so all live character surfaces share the same readiness rule. If file loading fails, preserve the error for development diagnostics and allow descendants to render static fallbacks.

- [ ] **Step 5: Implement a renderer with one instance per mount**

`KairoRenderer` must:

1. render `KAIRO_BASE_ASSET` until `riveFile` and `motionReady` are ready;
2. call `useViewModelInstance(character.viewModel, riveFile, { async: true })` for its own mount;
3. bind every enum/boolean property declared in the binding plan;
4. set the reaction enum, request `motion/play_reaction` once when `occurrence` changes, then call optional `onReactionConsumed(occurrence)` immediately after the trigger request so a later renderer remount cannot replay an already-delivered product event;
5. render artboard `KAIRO` and state machine `KairoStateMachine` with transparent background and contain fit;
6. show the same fallback after any load/binding/render error;
7. pass a settled `reducedMotion: true` state to Rive and never start app-side floating motion;
8. keep the accessible image label on the app-owned wrapper and hide Rive internals from the accessibility tree.

Use a small class error boundary around the native Rive view because native render failures cannot be caught by promise state alone. Development diagnostics include the property path that failed; production retains the fallback without crashing.

Add an internal `debugFailureMode?: 'file' | 'binding' | 'view'` renderer prop that is honored only when `__DEV__` is true. It must enter the same production fallback branches rather than drawing a fake error state; Task 10 uses it to prove every failure path.

- [ ] **Step 6: Verify pure adapter, type system, and full suite**

```bash
npx vitest run --config vitest.config.ts src/features/character/rive-binding.test.ts
npm run typecheck
npm test
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/character/rive-binding.ts src/features/character/rive-binding.test.ts src/features/character/KairoRiveProvider.tsx src/features/character/KairoRenderer.tsx app/_layout.tsx
git commit --only src/features/character/rive-binding.ts src/features/character/rive-binding.test.ts src/features/character/KairoRiveProvider.tsx src/features/character/KairoRenderer.tsx app/_layout.tsx -m "feat(character): bind semantic state to Rive"
```

---

## Task 7: Put live KAIRO on Today, including real level-up occurrences

**Files:**
- Modify: `src/features/character/CharacterFigure.tsx`
- Modify: `src/features/character/Diorama.tsx`
- Modify: `app/(tabs)/index.tsx`
- Modify: `src/features/character/character-resolver.test.ts`

**Interfaces:**
- Consumes: today's already-scored `sleepMinutes`, lifetime `profile.str_total`, profile level, live `KairoRenderer`, and existing ring/shadow calculations.
- Produces: live Today `idle` KAIRO and a one-shot `level_up` occurrence after an observed mounted increase.

- [ ] **Step 1: Add tests for the Today semantic input**

Test a helper that accepts unresolved query values and produces the exact neutral fallback, and confirm oversleep and lifetime STR boundaries flow through the existing engines. Keep the initial-level and level-change cases from Task 2.

- [ ] **Step 2: Replace the static figure inside the existing stage**

Keep `GroundShadow`, `PresenceRing`, the current accessible wrapper, and figure-response calculations. Replace the static species image and outer `useFloat()` animation with `KairoRenderer`. Rive's `idle` animation now owns the character motion; leaving `useFloat()` would double-animate it.

Extend `CharacterFigure` with semantic inputs:

```ts
interface CharacterFigureProps {
  level: number;
  stage: 1 | 2 | 3 | 4;
  dominance?: Dominance;
  height?: number;
  lifetimePoints?: Record<CoreStat, number>;
  sleepMinutes?: number | null;
  pose?: KairoPose;
  reaction?: KairoSelection['reaction'];
  cosmetics?: KairoSelection['cosmetics'];
}
```

Remove `species` from `CharacterFigure`; no character art resolves through `SPECIES_FIGURES` after this task. Keep `species` on `Diorama`, where the existing compatibility value still selects the habitat and contributes to the accessible label.

- [ ] **Step 3: Thread product state through `Diorama`**

Add `sleepMinutes` and optional `reaction/cosmetics/pose`. Derive strength from `lifetimePoints?.STR`; do not pass rating or duplicate threshold logic. Today uses `pose="idle"`.

- [ ] **Step 4: Generate level-up occurrences only after mounted resolution**

In Today, track the last resolved level in a ref. On first non-null resolution, store it and emit nothing. On a later increase, call `reactionForLevelChange(previous, current)` and store that occurrence in state; then advance the ref. Do not fire for remount, refetch with the same value, decrease, or initial load.

Pass `vitals.data?.sleepMinutes`, lifetime points, and the reaction into `Diorama`. Thread `onReactionConsumed` back to Today and clear state only when its occurrence still matches the delivered occurrence. This acknowledges delivery without guessing the animation duration; Rive continues and completes the reaction internally.

- [ ] **Step 5: Verify**

```bash
npx vitest run --config vitest.config.ts src/features/character/character-resolver.test.ts
npm run typecheck
npm test
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/character/CharacterFigure.tsx src/features/character/Diorama.tsx "app/(tabs)/index.tsx" src/features/character/character-resolver.test.ts
git commit --only src/features/character/CharacterFigure.tsx src/features/character/Diorama.tsx "app/(tabs)/index.tsx" src/features/character/character-resolver.test.ts -m "feat(character): render live KAIRO on Today"
```

---

## Task 8: Put live neutral KAIRO in onboarding

**Files:**
- Modify: `app/(onboard)/name.tsx`

**Interfaces:**
- Consumes: `KairoRenderer` and resolver defaults.
- Produces: live onboarding KAIRO with `normal + fit + idle + no cosmetics`, static fallback before readiness, and unchanged onboarding persistence/navigation.

- [ ] **Step 1: Write a failing source-boundary test, then record current behavior**

Extend `character-assets.test.ts` to read `app/(onboard)/name.tsx` and require a `KairoRenderer` import while rejecting `SPECIES_FIGURES`. Run the focused test and expect it to fail against the current static image. Then run the existing onboarding-related tests and inspect the name screen's submit path. The task changes only the figure; it must not alter validation, profile creation, navigation, or when the profile row commits.

- [ ] **Step 2: Replace `SPECIES_FIGURES` with the live renderer**

Resolve this exact selection:

```ts
const ONBOARDING_KAIRO: KairoSelection = {
  sleepState: 'normal',
  strengthTier: 'fit',
  pose: 'idle',
  cosmetics: {},
};
```

Keep the current dimensions and accessible image semantics. `kairo_base_front_v1.png` appears while the shared file or Reduced Motion setting is unresolved.

- [ ] **Step 3: Verify and commit**

```bash
npm run typecheck
npm test
git add "app/(onboard)/name.tsx" src/features/character/character-assets.test.ts
git commit --only "app/(onboard)/name.tsx" src/features/character/character-assets.test.ts -m "feat(onboarding): meet live KAIRO"
```

---

## Task 9: Add static KAIRO thumbnails and migrate compact surfaces

**Files:**
- Create: `src/features/character/character-surface-policy.ts`
- Create: `src/features/character/KairoThumbnail.tsx`
- Modify: `src/features/squad/SkyMarker.tsx`
- Modify: `src/features/squad/LeaderboardRow.tsx`
- Modify: `app/event/[id].tsx`
- Modify: `src/features/character/species-art.ts`

**Interfaces:**
- Consumes: `KAIRO_POSE_ASSETS`.
- Produces: `<KairoThumbnail pose size accessibilityLabel decorative />` with no Rive/native runtime import.
- Mapping: active sky marker `run`; leaderboard and event member `idle`.

- [ ] **Step 1: Add a pure mapping assertion**

Create `character-surface-policy.ts` as a pure module and extend `character-assets.test.ts` to assert its compact-context mapping:

```ts
expect(KAIRO_THUMBNAIL_POSE).toEqual({
  skyMarker: 'run',
  leaderboard: 'idle',
  eventMember: 'idle',
});
```

Run the test and expect failure before the mapping exists.

- [ ] **Step 2: Implement the static component**

Use React Native `Image`, `resizeMode="contain"`, and `accessibilityIgnoresInvertColors`. Decorative instances hide themselves completely. Meaningful instances use `accessible`, `accessibilityRole="image"`, and the caller's label. Do not import `@rive-app/react-native` from this file.

- [ ] **Step 3: Migrate all compact call sites**

Replace direct `SPECIES_FIGURES` lookup in the three named compact contexts. Preserve each component's current layout and parent grouping rules. Rows and markers that already have a grouped accessible label render the thumbnail as decorative so KAIRO is not announced twice.

After migration, remove only `SPECIES_FIGURES` from `species-art.ts`; keep `SPECIES_HABITATS` because `Diorama` still owns the eagle habitat.

- [ ] **Step 4: Prove no compact surface mounts live Rive**

Run:

```bash
rg -n "KairoRenderer|@rive-app/react-native" src/features/squad app/event
```

Expected: no matches.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run --config vitest.config.ts src/features/character/character-assets.test.ts
npm run typecheck
npm test
git add src/features/character/character-surface-policy.ts src/features/character/KairoThumbnail.tsx src/features/character/character-assets.test.ts src/features/squad/SkyMarker.tsx src/features/squad/LeaderboardRow.tsx "app/event/[id].tsx" src/features/character/species-art.ts
git commit --only src/features/character/character-surface-policy.ts src/features/character/KairoThumbnail.tsx src/features/character/character-assets.test.ts src/features/squad/SkyMarker.tsx src/features/squad/LeaderboardRow.tsx "app/event/[id].tsx" src/features/character/species-art.ts -m "feat(character): use static KAIRO thumbnails in compact UI"
```

---

## Task 10: Build the development-only KAIRO Lab

**Files:**
- Create: `src/features/character/kairo-lab-contract.ts`
- Create: `src/features/character/KairoLab.tsx`
- Create: `app/kairo-lab.tsx`

**Interfaces:**
- Consumes: all manifests, resolver, live renderer, and static registry.
- Produces: a development-only contract/visual QA route; no production navigation entry.

- [ ] **Step 1: Add a contract completeness test for lab controls**

Create the test first in `character-contract.test.ts`, importing `KAIRO_LAB_CONTROLS` from the new pure `kairo-lab-contract.ts`. Assert its arrays equal the contract's three sleep states, three strength tiers, six poses, five reactions, seven slots, and 12 catalog item IDs. Also assert the four preset states resolve to valid contract values. Run it and expect failure because the pure Lab contract does not exist.

- [ ] **Step 2: Implement the visual harness**

The lab provides:

- selectors for sleep, strength, sustained pose, and one item or `none` per cosmetic slot;
- buttons for each reaction that generate a new occurrence counter every press;
- a Reduced Motion override for settled-frame inspection;
- explicit forced file-load, binding, and view-error modes that exercise the real fallback component path;
- a one-instance/two-instance switch so independent view-model state can be inspected;
- live Rive and current pose fallback side by side;
- 190×212 and 72×72 previews on both cream and habitat grounds;
- current semantic state and view-model property paths as readable diagnostics;
- manifest validation errors, Rive load errors, and binding errors in development;
- presets for neutral, sleepy/slim/run, rested/strong/workout, and fully accessorized race victory.

Use existing UI primitives and scrolling; do not add a design-system or form dependency.

- [ ] **Step 3: Guard the route**

`app/kairo-lab.tsx` renders `<KairoLab />` only under `__DEV__`; production immediately redirects to `/`. Do not add it to tabs, onboarding, settings, or any production link.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run --config vitest.config.ts src/features/character/character-contract.test.ts
npm run typecheck
npm test
git add src/features/character/kairo-lab-contract.ts src/features/character/KairoLab.tsx app/kairo-lab.tsx src/features/character/character-contract.test.ts
git commit --only src/features/character/kairo-lab-contract.ts src/features/character/KairoLab.tsx app/kairo-lab.tsx src/features/character/character-contract.test.ts -m "feat(character): add KAIRO contract lab"
```

---

## Task 11: Regenerate native projects and complete device-level acceptance

**Files:**
- Create: `assets/character/KAIRO_V1_COMPATIBILITY.md`
- Modify generated native files only through CNG if those directories are tracked by repository policy.

**Interfaces:**
- Consumes: the completed Rive asset, runtime integration, Lab, Today, onboarding, and compact thumbnails.
- Produces: reproducible native verification evidence and the signed-off pose/cosmetic compatibility matrix.

- [ ] **Step 1: Run all static verification before native generation**

```bash
npm run typecheck
npm test
npm run doctor
git diff --check
```

Expected: all PASS with no whitespace errors.

- [ ] **Step 2: Regenerate through Expo CNG**

```bash
npm run prebuild
```

Inspect the diff. Accept only Rive autolinking and ordinary Expo-generated changes. Do not hand-patch Pods, Gradle, Xcode, or Android project files.

- [ ] **Step 3: Build and launch both development clients**

```bash
npm run ios
npm run android
```

If only one native toolchain is available locally, complete that build, record the unavailable toolchain explicitly in the compatibility report, and use the existing EAS development profile for the other platform before declaring the MVP complete.

- [ ] **Step 4: Exercise the full KAIRO Lab matrix**

On each platform:

1. visit every sleep × strength combination in idle;
2. visit all six poses for each of the 12 cosmetics, yielding 72 compatibility checks;
3. verify both footwear components in walk, run, and race victory;
4. fire every reaction from idle and run;
5. preempt `happy` with `level_up` and confirm return to the latest pose;
6. attempt equal/lower-priority reactions during `level_up` and confirm they are ignored;
7. toggle Reduce Motion and confirm the settled pose, cosmetics, and appearance remain visible without looping/root motion;
8. force or simulate a Rive load error and confirm the static fallback remains visible;
9. verify two simultaneous renderer mounts do not share selection or reaction state.

- [ ] **Step 5: Verify product surfaces**

Confirm:

- Today renders live idle KAIRO with the scored sleep state and lifetime STR tier;
- initial level resolution never fires `level_up`, while a real in-session increase fires once;
- onboarding renders live neutral KAIRO and its submission flow is unchanged;
- active sky markers use static run art;
- leaderboard and event-member rows use static idle art;
- habitat, ground shadow, presence ring, layout, and accessible labels still belong to the app;
- loading, Reduce Motion resolution, and Rive failure never produce a blank character area.

- [ ] **Step 6: Write the compatibility report**

Create `KAIRO_V1_COMPATIBILITY.md` with:

- Rive asset/version/hash;
- tested app commit and Rive runtime version;
- iOS and Android device/OS/build results;
- a 12-row table with all six pose columns marked pass;
- nine sleep × strength persistent-state results;
- five reaction timing/preemption results;
- Reduced Motion, load fallback, independent-instance, Today, onboarding, and thumbnail results;
- any explicit user-approved exception. Without an approved exception, every cell must pass.

- [ ] **Step 7: Run final verification and commit evidence**

```bash
npm run typecheck
npm test
npm run doctor
git diff --check
git status --short
```

Review `git status` before staging so unrelated user work is not included. Then:

```bash
git add assets/character/KAIRO_V1_COMPATIBILITY.md
git commit --only assets/character/KAIRO_V1_COMPATIBILITY.md -m "test(character): verify KAIRO MVP compatibility"
```

If CNG produced tracked, required native changes, include only those reviewed files in this final commit. If the native directories are ignored, do not force-add them.

---

## Completion Gate

The MVP is complete only when all of the following are true:

- canonical Bible/spec/manifests agree and their validator returns no errors;
- `kairo_v1.riv` contains the exact artboard, view model, state machine, and property paths;
- all three sleep states, three strength tiers, six poses, five reactions, seven slots, and 12 cosmetics work in the native Lab;
- all 12 cosmetics pass all six poses;
- Today and onboarding use live Rive, while compact contexts use static PNGs;
- the shared file does not cause shared per-renderer state;
- Reduced Motion and load/error paths always show KAIRO;
- level-up reacts only to a real post-mount level increase;
- native iOS and Android verification is recorded;
- `npm run typecheck`, `npm test`, `npm run doctor`, and `git diff --check` pass.

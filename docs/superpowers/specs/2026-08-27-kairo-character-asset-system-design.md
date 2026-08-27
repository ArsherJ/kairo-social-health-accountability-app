# KAIRO Character Asset System Design

**Date:** 2026-08-27
**Status:** Approved in chat
**Scope:** Full MVP character content, Rive authoring, runtime composition, static fallbacks, and asset-management contracts

## 1. Outcome

KAIRO becomes one canonical Philippine-eagle-inspired character whose appearance is composed from independent product inputs:

```text
canonical base
+ Body/strength appearance
+ daily sleep state
+ sustained pose
+ temporary reaction
+ one cosmetic per slot
= rendered KAIRO
```

One embedded Rive file owns the visual layers and transitions. Versioned JSON files own the runtime-facing semantic catalog. Pure TypeScript resolves app data into that catalog. React Native binds the resolved values to Rive on large, owned-character surfaces and uses static PNG exports in small or non-owned contexts.

The system does not create flattened exports for every combination. With the approved catalog, the seven cosmetic slots alone allow 864 configurations including `none`; multiplying those by three sleep states, three strength tiers, and six poses yields 46,656 steady-state combinations before reactions. The design keeps those dimensions composable and validates representative boundaries instead.

## 2. Canonical authority and approved decisions

The implementation follows these sources in order:

1. `assets/CHARACTER_BIBLE.md`
2. `assets/CHARACTER_SPEC.json`
3. `assets/reference/KAIRO_GOLDEN_REFERENCE.png`
4. `assets/character/README.md`

The golden reference created on 2026-08-27 establishes the previously missing base palette, neutral anatomy, front/three-quarter/side views, and proportions. The implementation must preserve its head silhouette, eye placement, beak, crest, wing roots, proportions, feet, and base colors.

The following canonical changes were explicitly approved:

- Add `neck` to the Bible's cosmetic slots so the Bible matches the existing `neck` slot and anchor in `CHARACTER_SPEC.json`.
- Remove `level_up` from the pose list and retain it as a reaction.
- Treat `race_victory` as a sustained result pose and `victory` as a separate one-shot reaction.
- Record the canonical Rive asset and version in `CHARACTER_SPEC.json`.
- Author the full MVP rather than a reduced vertical slice.

`CHARACTER_SPEC.json` advances from schema version `0.1` to `0.2` when these changes land. The Bible and spec change in the same commit as the new contract so they cannot temporarily disagree.

## 3. Scope

### Included

- One canonical, embedded `kairo_v1.riv` created in Rive Editor from the golden reference.
- Three daily sleep appearances: `sleepy`, `normal`, `well_rested`.
- Three Body/strength appearances: `slim`, `fit`, `strong`.
- Six sustained poses: `idle`, `sleep`, `walk`, `run`, `workout`, `race_victory`.
- Five one-shot reactions: `happy`, `excited`, `tired`, `victory`, `level_up`.
- Twelve embedded cosmetics across every approved slot.
- Three versioned JSON manifests and pure validation.
- A typed resolver and Rive adapter.
- Live Rive on Today and onboarding.
- Static KAIRO thumbnails in races, leaderboards, and event-member rows.
- Static loading/failure fallbacks and a settled Rive presentation for Reduced Motion.
- A development-only KAIRO Lab for complete contract and visual QA.
- Native development-build verification.

### Excluded

- Cosmetic ownership, selection persistence, inventory, rarity, price, currency, shop UI, or entitlements.
- Supabase schema or migration changes.
- New scoring rules, HealthKit reads, or gameplay-event definitions.
- Remote Rive downloads or runtime network access.
- Flattened pose × state × tier × cosmetic exports.
- Live Rive in race lanes, leaderboards, or event-member rows.

## 4. Repository structure

```text
assets/
  CHARACTER_BIBLE.md
  CHARACTER_SPEC.json
  reference/
    KAIRO_GOLDEN_REFERENCE.png
  character/
    README.md
    rive/
      kairo_v1.riv
    base/
      kairo_base_front_v1.png
    poses/
      kairo_pose_idle_v1.png
      kairo_pose_sleep_v1.png
      kairo_pose_walk_v1.png
      kairo_pose_run_v1.png
      kairo_pose_workout_v1.png
      kairo_pose_race_victory_v1.png
    states/
      kairo_state_sleepy_v1.png
      kairo_state_normal_v1.png
      kairo_state_well_rested_v1.png
    cosmetics/
      cosmetic_{slot}_{id}_v1.png

data/
  character.json
  cosmetics.json
  animations.json

src/features/character/
  character-contract.ts
  character-resolver.ts
  character-assets.ts
  KairoRiveProvider.tsx
  KairoRenderer.tsx
  KairoThumbnail.tsx
  KairoLab.tsx
```

The PNGs are transparent production previews and fallbacks, not an alternate runtime compositor. The `.riv` file is the visual source used at runtime. The JSON files are the semantic contract and contain no computed module paths. `character-assets.ts` owns every Metro asset through literal `require()` calls.

## 5. Ownership boundaries

| Layer | Owner |
|---|---|
| Identity, palette, anatomy, anchors | Bible, spec, and golden reference |
| Allowed IDs, defaults, compatibility, property paths | JSON manifests |
| Health/progression interpretation | Pure TypeScript resolver |
| Visual layers, rig, transitions, looping, reaction completion | `kairo_v1.riv` |
| File lifetime, data binding, failure fallback | React Native adapter/components |
| Ground shadow, presence ring, layout, accessible label | Existing app UI |
| Shop, ownership, and selected-cosmetic persistence | Out of scope |

Rive receives semantic values. It never imports HealthKit data, reads stores, interprets points, performs network requests, or decides gameplay.

## 6. JSON contracts

All manifests use `schemaVersion: 1` and `characterId: "kairo_creature"`. IDs are stable, lowercase snake case, and distinct from player-facing copy.

### 6.1 `data/character.json`

This file identifies the runtime artifact and exact data-binding surface:

```json
{
  "schemaVersion": 1,
  "characterId": "kairo_creature",
  "assetVersion": "v1",
  "rive": {
    "artboard": "KAIRO",
    "viewModel": "KairoCharacter",
    "stateMachine": "KairoStateMachine"
  },
  "defaults": {
    "sleepState": "normal",
    "strengthTier": "fit",
    "pose": "idle"
  },
  "properties": {
    "sleepState": { "path": "appearance/sleep_state", "type": "enum" },
    "strengthTier": { "path": "appearance/strength_tier", "type": "enum" },
    "pose": { "path": "motion/pose", "type": "enum" },
    "reaction": { "path": "motion/reaction", "type": "enum" },
    "playReaction": { "path": "motion/play_reaction", "type": "trigger" },
    "reducedMotion": { "path": "motion/reduced_motion", "type": "boolean" }
  }
}
```

The complete file also records the approved slot order and points to the existing registered anchors without redefining their geometry. Anchor geometry lives in Rive; anchor identity lives in `CHARACTER_SPEC.json`.

### 6.2 `data/cosmetics.json`

Each item records a stable ID, player-facing name, slot, primary anchor, Rive enum value, component anchors where necessary, and compatible poses. It does not contain price, rarity, ownership, or unlock rules.

The approved catalog is:

| ID | Display name | Slot | Primary anchor |
|---|---|---|---|
| `runner_cap` | Runner Cap | `head` | `head_top` |
| `woven_salakot` | Woven Salakot | `head` | `head_top` |
| `leaf_crown` | Leaf Crown | `head` | `head_top` |
| `round_glasses` | Round Glasses | `face` | `head_center` |
| `flight_goggles` | Flight Goggles | `face` | `head_center` |
| `sunlit_bandana` | Sunlit Bandana | `neck` | `neck` |
| `sampaguita_garland` | Sampaguita Garland | `neck` | `neck` |
| `trail_vest` | Trail Vest | `body` | `body_center` |
| `woven_cape` | Woven Cape | `back` | `back` |
| `trail_sneakers` | Trail Sneakers | `feet` | `left_foot` |
| `rain_boots` | Rain Boots | `feet` | `left_foot` |
| `firefly_aura` | Firefly Aura | `effect` | `body_center` |

Footwear has two independently positioned components registered under one catalog item: left at `left_foot` and right at `right_foot`. This models a selected pair without pretending both feet share an origin.

MVP acceptance requires every cosmetic to work in all six poses. If the Rive authoring pass finds an item that cannot fit without clipping or changing anatomy, work stops for an explicit catalog or compatibility decision; the implementation does not silently ship an exception.

Cosmetic slot properties are enums with `none` plus that slot's item IDs:

```text
cosmetics/body
cosmetics/feet
cosmetics/back
cosmetics/neck
cosmetics/face
cosmetics/head
cosmetics/effect
```

Their draw order remains the numeric order already defined by `CHARACTER_SPEC.json`: body 10, feet 20, back 30, neck 40, face 50, head 60, effect 100.

### 6.3 `data/animations.json`

The animation manifest owns semantic categories and expected behavior, not vector layers or application timers.

- Poses are sustained selections. `idle`, `sleep`, `walk`, `run`, and `workout` loop. `race_victory` plays its entrance once and holds its settled result pose.
- Daily states persist until source data changes.
- Reactions are one-shot interruptions. They retain appearance and cosmetics, temporarily interrupt the pose, complete inside the Rive state machine, and return to the last still-valid pose.
- `level_up` exists only in reactions.
- `victory` and `race_victory` remain separate IDs and categories.

Approved nominal timings:

| Behavior | Duration | Completion |
|---|---:|---|
| `idle` | 2.4 s | loop |
| `sleep` | 2.8 s | loop |
| `walk` | 0.8 s | loop |
| `run` | 0.5 s | loop |
| `workout` | 1.2 s | loop |
| `race_victory` | 1.4 s entrance | hold settled pose |
| normal transition | 0.18 s | settle in destination |

Reaction behavior is fixed as follows:

| Reaction | Priority | Duration | Affected regions |
|---|---:|---:|---|
| `tired` | 10 | 1.2 s | face, crest, posture |
| `happy` | 20 | 0.9 s | face, crest, wings |
| `excited` | 30 | 1.1 s | face, crest, wings, root motion |
| `victory` | 40 | 1.4 s | face, wings, root motion |
| `level_up` | 50 | 1.8 s | face, crest, wings, root motion |

All reactions may interrupt a sustained pose. A higher-priority reaction may preempt the active reaction; an equal- or lower-priority reaction is ignored rather than queued. Every reaction is non-looping and uses `returnTo: "current_pose"`, reapplying the latest appearance and cosmetics when it completes. The app does not start a timeout to guess when Rive finished.

## 7. Typed app contract

The renderer accepts already resolved semantic state:

```ts
interface KairoRenderState {
  sleepState: 'sleepy' | 'normal' | 'well_rested';
  strengthTier: 'slim' | 'fit' | 'strong';
  pose: 'idle' | 'sleep' | 'walk' | 'run' | 'workout' | 'race_victory';
  cosmetics: Partial<Record<CosmeticSlot, CosmeticId>>;
  reaction?: {
    id: 'happy' | 'excited' | 'tired' | 'victory' | 'level_up';
    occurrence: string;
  };
  reducedMotion: boolean;
}
```

`occurrence` identifies a particular reaction event. Changing it replays the trigger even when the reaction ID is the same as the previous event. It is not persisted and carries no gameplay meaning.

The resolver's missing-input defaults are `normal + fit + idle + no cosmetics`. Unknown manifest or cosmetic IDs resolve safely to their defaults in production and produce a diagnostic in development. Invalid checked-in manifest data fails automated tests.

## 8. Product-to-character mapping

### Daily sleep state

The resolver uses the scored sleep value already used by KAIRO's product surfaces, never raw or user-entered sleep. It delegates banding to the existing `mindTierFor` function so the character cannot disagree with scoring:

| Scored Mind tier | Appearance |
|---|---|
| missing | `normal` |
| none or bronze | `sleepy` |
| silver | `normal` |
| gold | `well_rested` |

The existing oversleep rule maps a night over nine hours to bronze, therefore to `sleepy`; the character reflects the same rule the score used rather than inventing a second interpretation.

### Body/strength tier

Strength changes from cumulative `profiles.str_total`, never one day's workout. The resolver first calls `ratingForStatPoints` and then maps the existing rating to the approved visual tiers:

| Body rating | Appearance |
|---:|---|
| 1–5 | `slim` |
| 6–20 | `fit` |
| 21+ | `strong` |

Missing data uses neutral `fit` until the profile resolves. A known zero total produces rating 1 and therefore `slim`.

### Pose and reactions

Pose is explicit screen context rather than an inference from sleep or Body:

- Today and onboarding use live `idle`.
- A race lane uses the static `run` export.
- Quiet lanes, leaderboard rows, and event-member rows use the static neutral base/idle export.
- `race_victory` is available to a future live result surface without changing the contract.

Today fires `level_up` only when a mounted session observes a genuine increase from one resolved level to a larger resolved level. Initial loading does not celebrate. The other reactions remain available through the renderer and KAIRO Lab but are not attached to invented product events in this scope.

## 9. Rive artifact

`assets/character/rive/kairo_v1.riv` contains:

- one 570 × 636 transparent artboard named `KAIRO`;
- one view model named `KairoCharacter`;
- one state machine named `KairoStateMachine`;
- a centered figure with feet on the bottom edge;
- stable registered anchors for head, eyes, beak, neck, body, wing roots, back, and feet;
- embedded base, strength, daily-state, pose, reaction, cosmetic, and effect layers;
- no baked ground shadow, presence ring, habitat, glow, UI, text label, or background.

The rig preserves the golden-reference silhouette. Strength may adjust torso/chest/wing structure within the approved tier designs but may not move eye placement, beak, crest, wing roots, overall proportions, or foot shape. Sleep state affects face, feathers, and posture without changing identity. Cosmetics adapt to the rig; the rig never deforms to fit a cosmetic.

Data Binding enums control sleep state, strength tier, pose, reaction selection, and each cosmetic slot. A trigger plays the selected reaction. A boolean switches reduced-motion behavior.

When `motion/reduced_motion` is true, the state machine snaps to a settled frame, disables ambient loops and reactions, and preserves the selected appearance, pose silhouette, and cosmetics. It does not leave an empty or partially bound artboard.

## 10. Static exports

The Rive authoring pass also exports:

- one neutral, fit, idle, front-facing canonical fallback;
- six full-character pose previews;
- three full-character daily-state previews;
- twelve isolated cosmetic previews aligned to the 570 × 636 coordinate space.

All exports are transparent PNGs, centered, feet on the bottom edge where a full figure is present, and free of baked shadow, glow, ring, or habitat. The naming templates in `CHARACTER_SPEC.json` are mandatory.

The base fallback is the loading/error and pre–Reduced Motion resolution safety asset, as well as the default small thumbnail. Once Reduced Motion resolves true, the bound Rive artboard shows its settled frame so selected appearance and cosmetics remain visible. The static run pose is the race-lane thumbnail. Preview exports are not combined into a second composition engine.

## 11. React Native integration

The app adds stable `@rive-app/react-native` v0.4, constrained to `>=0.4.19 <0.5`, and uses only its non-deprecated asynchronous Data Binding APIs. The v0.5 runtime is beta and is not part of this change.

Because the runtime contains native code, the dependency requires a new Expo development build and cannot run in Expo Go. `expo-dev-client` is already installed. Native config remains owned by `app.config.ts` and generated through the existing CNG workflow; generated `ios/` and `android/` files are not hand-edited.

`metro.config.js` adds `riv` to `resolver.assetExts`. `character-assets.ts` imports the local Rive and every PNG with literal `require()` calls. Local `require()` keeps the Rive file in the Metro asset graph, so a later `.riv` content update can ship through Expo OTA after the native runtime is present in the installed build.

`KairoRiveProvider` loads one stable `RiveFile` and exposes its loading or error state. Each live `KairoRenderer` creates one asynchronous view-model instance and keeps it stable for that component lifetime. Prop changes update only the affected Data Binding properties.

`KairoRenderer` preserves the existing frame size and renders the app-owned `GroundShadow` and `PresenceRing` outside Rive. `KairoThumbnail` renders only literal static PNG sources and never initializes the native runtime.

## 12. Surface migration

| Existing surface | New renderer | State |
|---|---|---|
| Today `Diorama` / `CharacterFigure` | live `KairoRenderer` | actual sleep and Body appearance, idle pose, optional level-up reaction |
| Onboarding name screen | live `KairoRenderer` | normal, fit, idle, no cosmetics |
| Race and quiet lanes | `KairoThumbnail` | run for active race; idle for quiet lane |
| Leaderboard row | `KairoThumbnail` | idle |
| Event-member row | `KairoThumbnail` | idle |

The stored species column and existing `displaySpecies` compatibility behavior remain untouched. This system renders one KAIRO and does not reopen species selection or migrate profile data.

## 13. Loading, errors, and accessibility

No character surface may render blank.

- File-loading, view-model creation, property lookup, or Data Binding errors render `kairo_base_front_v1.png` in the same frame.
- Hook and property errors feed one fallback state. A component error boundary covers synchronous render failures; the stable integration does not depend on beta-only view error APIs.
- Diagnostics include the failed contract path in development without exposing user data.
- A malformed or missing `.riv` file does not remove the app-owned shadow, ring, layout, or accessible label.
- The accessible element remains the app wrapper with the existing image role and composed label. The Rive view and static image remain hidden from duplicate accessibility traversal.
- Reduced Motion is resolved before animation starts. Until it resolves, the settled static presentation is shown.
- Backgrounding/remounting restores the latest resolved state and does not replay an old reaction occurrence.

## 14. Development-only KAIRO Lab

The implementation includes a development-only component and route that is absent from production navigation and renders no production entry point.

The lab provides controls for:

- every sleep state;
- every strength tier;
- every pose;
- one item or `none` in every cosmetic slot;
- every reaction, including repeated firing of the same ID;
- reduced-motion mode;
- forced file, binding, and view fallback states;
- one and multiple simultaneous Rive instances;
- 190 × 212 and 72 × 72 previews on cream and habitat grounds.

The lab is a QA consumer of the public renderer contract, not an alternate implementation or an in-app cosmetic picker.

## 15. Validation and testing

### Pure automated tests

- Manifest schema versions, character IDs, and defaults agree.
- Every ID is unique within its namespace.
- Every cosmetic uses a registered slot and anchor.
- Footwear contains both registered foot components.
- The catalog contains exactly the approved twelve items.
- Every pose/state/reaction has exactly one semantic category.
- `level_up` exists only as a reaction.
- `victory` and `race_victory` remain distinct.
- Every Rive enum value referenced by a manifest is declared in the typed contract.
- The literal asset registry contains every required static export and the one Rive file.
- Sleep mapping covers missing, none, bronze, silver, gold, and oversleep boundaries.
- Body mapping covers missing, zero, ratings 5/6, and ratings 20/21.
- Unknown cosmetic IDs fall back to `none` in their slot.
- Reaction occurrences replay the same reaction ID and initial load does not trigger `level_up`.
- Reduced-motion resolution prevents animation from starting early.

### Repository checks

- `npm test`
- `npm run typecheck`
- `npm run doctor`
- Metro bundle resolution for `.riv` and every static asset

### Rive contract checks

- Artboard, state machine, view model, property paths, property types, defaults, enum values, and trigger exist exactly as documented.
- Each pose/state/tier/reaction is exercised in the development build.
- Reaction interruption, replay, completion, and return behavior are verified.
- Each cosmetic is tested in all six poses and at sleepy/strong boundary appearances.
- Representative cross-slot stacks cover head + face, neck + body + back, feet + pose extremes, and all slots together.
- Loading/error fallback, remount/background behavior, and multiple simultaneous instances are exercised.

### Visual checks

- Compare every deliverable against `assets/reference/KAIRO_GOLDEN_REFERENCE.png`.
- Verify locked silhouette, anatomy, palette, and attachment points.
- Verify transparency, 570 × 636 alignment, and feet baseline.
- Verify readability at the 190 × 212 app slot and 72 × 72 thumbnail.
- Verify cream and habitat backgrounds.
- Verify no baked shadow, ring, glow, or background.
- Verify reduced-motion frames and static fallbacks.

### Native checks

- Rebuild the Expo development client after adding the native runtime.
- Smoke-test the generated iOS app and Android app when the local platform toolchain is available.
- Record any platform that could not be exercised locally rather than implying coverage.
- Confirm steady rendering, transitions, background/foreground recovery, and acceptable memory/frame behavior in the KAIRO Lab.

## 16. Delivery

The completed change delivers:

- the canonical `.riv` artifact;
- all approved static exports;
- the three JSON manifests;
- updated canonical Bible, spec, and character README;
- typed contracts, resolver, adapter, renderers, and development lab;
- migrated app surfaces;
- pure automated tests and native build notes;
- a compatibility report naming any approved exception.

Any visual exception discovered during Rive authoring requires explicit approval before it changes a locked feature. Missing art or a broken Rive contract falls back safely; it is never patched by silently moving anatomy, inventing an anchor, or baking combinations together.

## 17. References

- Rive, [Adding Rive to Expo](https://rive.app/docs/runtimes/react-native/adding-rive-to-expo)
- Rive, [React Native migration guide](https://rive.app/docs/runtimes/react-native/migration-guide)
- Rive, [React Native Data Binding](https://rive.app/docs/runtimes/react-native/data-binding)
- Rive, [Loading Rive files](https://rive.app/docs/runtimes/react-native/loading-rive-files)
- Rive, [Caching a Rive file](https://rive.app/docs/runtimes/react-native/caching-a-rive-file)

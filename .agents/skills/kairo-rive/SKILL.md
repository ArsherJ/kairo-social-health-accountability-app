---
name: kairo-rive
description: Use when creating, reviewing, or integrating KAIRO `.riv` files, artboards, view models, state machines, data binding, animation layers, or Expo/React Native Rive runtime behavior; not for static assets or behavior design alone.
---

# KAIRO Rive

Keep the `.riv` file, behavior contract, and typed adapter aligned. Rive renders; it does not decide gameplay or interpret health data.

**REQUIRED BACKGROUND:** Use `kairo-character-assets` and `kairo-poses-states`; add `kairo-cosmetics` for wearable layers or attachments.

## Scope and runtime gate

The current app uses static art and no Rive dependency. Do not install a runtime or replace `CharacterFigure` for an artboard-only task. Runtime scope must name changed surfaces and static fallbacks.

Before dependency or API changes, verify Rive's official [Expo setup](https://rive.app/docs/runtimes/react-native/adding-rive-to-expo), [migration guide](https://rive.app/docs/runtimes/react-native/migration-guide), and [data-binding API](https://rive.app/docs/runtimes/react-native/data-binding). Use the stable, non-deprecated path. The runtime contains native code: use a development build, not Expo Go, and rebuild after native changes.

## File architecture

- Prefer one canonical artboard and one documented runtime-facing state-machine/view-model contract. Add artboards only for different render contexts.
- Compose reusable base, attribute, face/state, pose, reaction, cosmetic, and effect layers. Preserve the spec's anchors and attachment points.
- Do not duplicate artboards, state machines, or animations per cosmetic or state combination.
- Keep transitions visual and deterministic. The adapter maps product state to semantic properties; `.riv` never reads HealthKit, scoring, stores, or network state.

## Data contract

`kairo-poses-states` owns semantic categories, allowed values, priority, interruption, and return behavior. Do not rename or add properties to mirror current UI words without an approved contract change.

For every bound property, record its exact path, Rive type, allowed/default values, app owner, update rule, and fallback. Prefer Data Binding enums for multi-valued state and triggers for reactions. A multi-reaction design may use an enum plus a trigger; never hold a reaction boolean until an unrelated sync.

## React Native integration

- Keep `RiveFile` stable and reuse it. Do not recreate the file, view-model instance, or view on prop changes; update changed properties.
- Keep React state minimal and derive adapter values from existing props/data. Do not add stores or event channels merely to drive animation.
- Handle file, artboard, state-machine, binding, and view errors. Loading or failure renders the existing static KAIRO at the same size and accessibility role—never a blank character.
- Respect reduced motion immediately with a settled/static presentation. Preserve app-owned shadow, ring, layout, and labels until their replacement is explicitly designed.

## Verification

Check the exported file and runtime together:

- artboard, state machine, view model, property paths, types, defaults, and missing-input fallbacks;
- every enum value plus reaction replay, interruption, completion, and return;
- cosmetic anchors, clipping, layer order, and canonical silhouette;
- loading/error fallback, reduced motion, remount/background behavior, and multiple simultaneous instances;
- TypeScript tests for the pure app-to-Rive adapter and a development-build device smoke test for native behavior and performance.

Deliver the `.riv` artifact, versioned input contract, integration changes, tests, and native rebuild notes. Do not expand into gameplay/data changes or additional surfaces without explicit scope.

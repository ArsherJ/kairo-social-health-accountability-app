---
name: kairo-poses-states
description: Use when defining or reviewing KAIRO poses, expressions, reactions, attribute appearances, state composition, animation behavior, or transition semantics; not for gameplay scoring or `.riv` implementation details.
---

# KAIRO Poses and States

Model independent meanings, then compose them.

**REQUIRED BACKGROUND:** Use `kairo-character-assets` for canonical constraints.

## Semantic ownership

| Category | Question | Lifetime | Typical control |
|---|---|---|---|
| Pose | What is KAIRO doing? | Sustained or looping | Selected enum |
| Daily state | How does KAIRO currently present? | Until source data changes | Selected enum |
| Attribute tier | What progression or motion modifier applies? | Persistent until recalculated | Ordered enum |
| Reaction | What just happened? | One shot or bounded loop | Trigger with completion |

Every runtime ID has one category. If sources disagree—as they currently do for `level_up`—report the collision and obtain an ownership decision before implementation. Update the Bible and spec together when it changes.

Visual similarity does not make two meanings aliases. `sleepy` is a daily condition; `tired` is currently listed as a reaction. Do not merge, duplicate, or rename them without defined triggers, duration, and product approval.

Keep asset IDs separate from player-facing vocabulary. Check the current product source before writing visible labels; the app currently says **Motion**, **Body**, and **Mind**, while older character material uses Agility, Strength, and Intelligence.

## Composition contract

Compose independent regions and behaviors in this order:

1. canonical base and approved attribute appearance;
2. daily-state face, feathers, and posture treatment;
3. selected pose or locomotion;
4. bounded reaction overlay or interruption;
5. independently attached cosmetics.

For each reaction, define what it interrupts, whether it loops, its completion condition, and its return target. The safe default is the last still-valid pose with current states reapplied—not an unrelated idle and never an external sync that may not arrive.

Do not collapse three-valued states or tiers into booleans. Data refresh may update state inputs, but it does not own animation completion.

## Behavior handoff

Each behavior definition states:

- stable ID and semantic category;
- trigger or selection source;
- affected regions;
- loop/duration and transition timing;
- compatibility, priority, and fallback;
- interruption and return behavior.

Example: `level_up` as a reaction is a non-looping celebration, temporarily interrupts locomotion, retains state/attribute layers, and returns to the last valid pose when complete.

## Validation

Prefer composable layers and a compatibility table over pose × state × tier × reaction exports. Add a baked variant only when a named consumer cannot compose it and the deliverable is approved.

Test representative combinations and boundaries: neutral and extreme tiers, every reaction's entry/exit, interrupted poses, missing inputs, cosmetics at moving anchors, mobile-size readability, and a reduced-motion/static fallback. Preserve the canonical silhouette and attachment points throughout.

The current app still uses static placeholder art. Do not add Rive, runtime inputs, HealthKit lifecycle changes, or app copy changes unless those are explicitly in scope; use `kairo-rive` when `.riv` or runtime implementation begins.

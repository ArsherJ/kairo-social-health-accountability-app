import type { EvolutionStage } from '@kairo/core';

export const SLEEP_STATES = ['sleepy', 'normal', 'well_rested'] as const;
/**
 * **`summit` is the pose drawn at the ridge, and it is silent.**
 *
 * The Motion ladder's top band is `ridge` and the player sees that word; this
 * names the *drawing* they see standing there, and no surface speaks it — the
 * growth-stage names are the same kind of development vocabulary. Calling the
 * pose `ridge` too would give one word a third referent beside the step count
 * and the band, which is the collision `CONTEXT.md` records against it.
 *
 * It is a persistent look rather than a celebration: `daily_walk` still fires
 * its `race_victory` reaction when the line is crossed, wins the priority
 * cascade for `REACTION_HOLD_MS`, and then falls through to this for the rest
 * of the day.
 */
export const KAIRO_POSES = [
  'idle',
  'sleep',
  'walk',
  'run',
  'workout',
  'race_victory',
  'summit',
] as const;
/**
 * **`tired` has no producer, deliberately.** `living-reaction.ts` builds no
 * candidate for it: sleepiness is a *daily Mind state*, not an event, and it is
 * already carried by the `sleepy` state image that `staticFigureSelection`
 * picks. A one-shot celebration of somebody being tired is also the wrong
 * register for this app.
 *
 * It stays in the enum because this is the trigger vocabulary a future Rive
 * state machine binds to, and removing a value from a shared enum to re-add it
 * at integration is churn.
 */
export const KAIRO_REACTIONS = ['happy', 'excited', 'tired', 'victory', 'level_up'] as const;

/**
 * The growth stages, by name, in `EvolutionStage` order.
 *
 * **A development vocabulary.** These words name the checked-in artwork; no
 * player surface speaks them, and the figure's
 * accessible name says the level rather than the stage. They live here rather
 * than beside the art because the file paths are built from them by hand — a
 * template string in a `require` is a Metro miss, not a bundling error.
 */
export const GROWTH_STAGE_NAMES: Record<EvolutionStage, string> = {
  1: 'hatchling',
  2: 'fledgling',
  3: 'juvenile',
  4: 'adult',
};

/**
 * The stages in order, **derived from the one table that lists them**.
 *
 * `Object.keys` returns integer-like keys in ascending numeric order by
 * specification, so this is `[1, 2, 3, 4]` and a fifth stage is declared in one
 * place rather than two. The cast is what `Object.keys` costs — it widens to
 * `string[]` and TypeScript offers no key-preserving alternative — and it is
 * safe precisely because the table above is typed by `EvolutionStage`.
 */
export const GROWTH_STAGES = Object.keys(GROWTH_STAGE_NAMES).map(
  Number,
) as readonly EvolutionStage[];

/**
 * The stage the checked-in art is drawn at, and the one every other stage is
 * measured against — the adult's body is full size and the pose set that has no
 * pre-adult art (`race_victory`, `workout`, the Mind states) belongs to it.
 *
 * Named here rather than in each reader, because there were two readers within
 * a day of each other: `living-mirror.ts` deciding what a pre-adult reaction
 * draws, and `level-response.ts` deciding how much of the adult's size a stage
 * loses. Two `const ADULT_STAGE = 4` is a growth threshold restated, which is
 * exactly what deriving `GROWTH_STAGES` from `GROWTH_STAGE_NAMES` already
 * refused.
 *
 * Written rather than taken off the end of `GROWTH_STAGES`, which would need an
 * `undefined` answered for and would read no more clearly than the 4.
 */
export const ADULT_STAGE: EvolutionStage = 4;

export type SleepState = (typeof SLEEP_STATES)[number];
export type StrengthTier = 'slim' | 'fit' | 'strong';
export type KairoPose = (typeof KAIRO_POSES)[number];
export type KairoReactionId = (typeof KAIRO_REACTIONS)[number];

export interface KairoSelection {
  sleepState: SleepState;
  strengthTier: StrengthTier;
  pose: KairoPose;
  reaction?: { id: KairoReactionId; occurrence: string };
}

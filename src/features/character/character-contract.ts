import type { EvolutionStage } from '@kairo/core';

export const SLEEP_STATES = ['sleepy', 'normal', 'well_rested'] as const;
export const STRENGTH_TIERS = ['slim', 'fit', 'strong'] as const;
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
 * It stays in the enum because this is the manifest contract Rive binds to —
 * `data/animations.json` declares it and `validateCharacterManifests` asserts
 * all five — and removing a value from a shared enum to re-add it at
 * integration is churn.
 */
export const KAIRO_REACTIONS = ['happy', 'excited', 'tired', 'victory', 'level_up'] as const;

/**
 * The growth stages, by name, in `EvolutionStage` order.
 *
 * **A development vocabulary.** These words name the checked-in artwork and
 * label the asset lab; no player surface speaks them, and the figure's
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
 * exactly what deriving `GROWTH_STAGES` from `GROWTH_STAGE_NAMES` and
 * `firstLevelOfStage` from `evolutionStageForLevel` already refused.
 *
 * Written rather than taken off the end of `GROWTH_STAGES`, which would need an
 * `undefined` answered for and would read no more clearly than the 4.
 */
export const ADULT_STAGE: EvolutionStage = 4;

export type SleepState = (typeof SLEEP_STATES)[number];
export type StrengthTier = (typeof STRENGTH_TIERS)[number];
export type KairoPose = (typeof KAIRO_POSES)[number];
export type KairoReactionId = (typeof KAIRO_REACTIONS)[number];

export interface KairoSelection {
  sleepState: SleepState;
  strengthTier: StrengthTier;
  pose: KairoPose;
  reaction?: { id: KairoReactionId; occurrence: string };
}

export interface KairoRenderState extends KairoSelection {
  reducedMotion: boolean;
}

export type DataBindingPropertyType = 'enum' | 'trigger' | 'boolean';

export interface CharacterManifest {
  schemaVersion: 1;
  characterId: 'kairo_creature';
  assetVersion: 'v1';
  rive: { artboard: 'KAIRO'; viewModel: 'KairoCharacter'; stateMachine: 'KairoStateMachine' };
  defaults: { sleepState: 'normal'; strengthTier: 'fit'; pose: 'idle' };
  properties: Record<string, { path: string; type: DataBindingPropertyType }>;
}

export interface AnimationManifest {
  schemaVersion: 1;
  characterId: 'kairo_creature';
  transitionSeconds: number;
  poses: readonly { id: KairoPose; durationSeconds: number; completion: 'loop' | 'hold' }[];
  reactions: readonly {
    id: KairoReactionId;
    priority: number;
    durationSeconds: number;
    affectedRegions: readonly string[];
    interrupts: 'pose';
    queue: 'ignore_equal_or_lower';
    preemption: 'higher_priority';
    loop: false;
    returnTo: 'current_pose';
  }[];
}

export interface CharacterManifestBundle {
  character: unknown;
  animations: unknown;
}

type UnknownRecord = Record<string, unknown>;

const EXPECTED_PROPERTIES = {
  sleepState: { path: 'appearance/sleep_state', type: 'enum' },
  strengthTier: { path: 'appearance/strength_tier', type: 'enum' },
  pose: { path: 'motion/pose', type: 'enum' },
  reaction: { path: 'motion/reaction', type: 'enum' },
  playReaction: { path: 'motion/play_reaction', type: 'trigger' },
  reducedMotion: { path: 'motion/reduced_motion', type: 'boolean' },
} as const;

const CHARACTER_MANIFEST_KEYS = [
  'schemaVersion',
  'characterId',
  'assetVersion',
  'rive',
  'defaults',
  'properties',
] as const;
const ANIMATION_MANIFEST_KEYS = [
  'schemaVersion',
  'characterId',
  'transitionSeconds',
  'poses',
  'reactions',
] as const;
const REACTION_KEYS = [
  'id',
  'priority',
  'durationSeconds',
  'affectedRegions',
  'interrupts',
  'queue',
  'preemption',
  'loop',
  'returnTo',
] as const;

const EXPECTED_POSES = [
  ['idle', 2.4, 'loop'],
  ['sleep', 2.8, 'loop'],
  ['walk', 0.8, 'loop'],
  ['run', 0.5, 'loop'],
  ['workout', 1.2, 'loop'],
  ['race_victory', 1.4, 'hold'],
  // Held rather than looped: `summit` is the day's standing look after the
  // ridge, not a cycle.
  ['summit', 1.4, 'hold'],
] as const;

const EXPECTED_REACTIONS = [
  ['tired', 10, 1.2, ['face', 'crest', 'posture']],
  ['happy', 20, 0.9, ['face', 'crest', 'wings']],
  ['excited', 30, 1.1, ['face', 'crest', 'wings', 'root']],
  ['victory', 40, 1.4, ['face', 'wings', 'root']],
  ['level_up', 50, 1.8, ['face', 'crest', 'wings', 'root']],
] as const;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function sameArray(value: unknown, expected: readonly unknown[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

function addHeaderErrors(errors: string[], manifestName: string, value: unknown): UnknownRecord {
  const manifest = asRecord(value);
  if (manifest.schemaVersion !== 1) errors.push(`${manifestName}.schemaVersion must equal 1`);
  if (manifest.characterId !== 'kairo_creature') {
    errors.push(`${manifestName}.characterId must equal kairo_creature`);
  }
  return manifest;
}

function addExactKeyErrors(
  errors: string[],
  path: string,
  value: UnknownRecord,
  expectedKeys: readonly string[],
): void {
  const keys = Object.keys(value);
  for (const key of keys) {
    if (!expectedKeys.includes(key)) errors.push(`${path}.${key} must not be declared`);
  }
  if (!sameArray(keys.filter((key) => expectedKeys.includes(key)), expectedKeys)) {
    errors.push(`${path} must preserve canonical key order`);
  }
}

/** Returns ordered development diagnostics for malformed checked-in manifest data. */
export function validateCharacterManifests({
  character,
  animations,
}: CharacterManifestBundle): string[] {
  const errors: string[] = [];
  const characterManifest = addHeaderErrors(errors, 'character', character);
  const animationsManifest = addHeaderErrors(errors, 'animations', animations);

  addExactKeyErrors(errors, 'character', characterManifest, CHARACTER_MANIFEST_KEYS);
  addExactKeyErrors(errors, 'animations', animationsManifest, ANIMATION_MANIFEST_KEYS);

  if (characterManifest.assetVersion !== 'v1') errors.push('character.assetVersion must equal v1');
  const rive = asRecord(characterManifest.rive);
  addExactKeyErrors(errors, 'character.rive', rive, ['artboard', 'viewModel', 'stateMachine']);
  if (rive.artboard !== 'KAIRO') errors.push('character.rive.artboard must equal KAIRO');
  if (rive.viewModel !== 'KairoCharacter') errors.push('character.rive.viewModel must equal KairoCharacter');
  if (rive.stateMachine !== 'KairoStateMachine') {
    errors.push('character.rive.stateMachine must equal KairoStateMachine');
  }

  const defaults = asRecord(characterManifest.defaults);
  addExactKeyErrors(errors, 'character.defaults', defaults, [
    'sleepState',
    'strengthTier',
    'pose',
  ]);
  if (defaults.sleepState !== 'normal') errors.push('character.defaults.sleepState must equal normal');
  if (defaults.strengthTier !== 'fit') errors.push('character.defaults.strengthTier must equal fit');
  if (defaults.pose !== 'idle') errors.push('character.defaults.pose must equal idle');

  const properties = asRecord(characterManifest.properties);
  addExactKeyErrors(errors, 'character.properties', properties, Object.keys(EXPECTED_PROPERTIES));
  for (const [id, expected] of Object.entries(EXPECTED_PROPERTIES)) {
    const property = asRecord(properties[id]);
    addExactKeyErrors(errors, `character.properties.${id}`, property, ['path', 'type']);
    if (property.path !== expected.path || property.type !== expected.type) {
      errors.push(`character.properties.${id} must equal ${expected.path} (${expected.type})`);
    }
  }

  if (animationsManifest.transitionSeconds !== 0.18) {
    errors.push('animations.transitionSeconds must equal 0.18');
  }
  const poses = Array.isArray(animationsManifest.poses) ? animationsManifest.poses : [];
  if (poses.some((entry) => asRecord(entry).id === 'level_up')) {
    errors.push('animations.poses must not contain level_up');
  }
  if (poses.length !== EXPECTED_POSES.length) errors.push('animations.poses must contain seven poses');
  for (const [index, [id, durationSeconds, completion]] of EXPECTED_POSES.entries()) {
    const pose = asRecord(poses[index]);
    addExactKeyErrors(errors, `animations.poses[${index}]`, pose, [
      'id',
      'durationSeconds',
      'completion',
    ]);
    if (pose.id !== id || pose.durationSeconds !== durationSeconds || pose.completion !== completion) {
      errors.push(`animations.poses[${index}] must equal ${id} (${durationSeconds}s, ${completion})`);
    }
  }

  const reactions = Array.isArray(animationsManifest.reactions) ? animationsManifest.reactions : [];
  if (reactions.some((entry) => asRecord(entry).id === 'race_victory')) {
    errors.push('animations.reactions must not contain race_victory');
  }
  if (reactions.length !== EXPECTED_REACTIONS.length) errors.push('animations.reactions must contain five reactions');
  for (const [index, [id, priority, durationSeconds, affectedRegions]] of EXPECTED_REACTIONS.entries()) {
    const reaction = asRecord(reactions[index]);
    addExactKeyErrors(errors, `animations.reactions[${index}]`, reaction, REACTION_KEYS);
    if (
      reaction.id !== id ||
      reaction.priority !== priority ||
      reaction.durationSeconds !== durationSeconds ||
      !sameArray(reaction.affectedRegions, affectedRegions)
    ) {
      errors.push(`animations.reactions[${index}] must equal ${id} behavior`);
    }
    if (
      reaction.interrupts !== 'pose' ||
      reaction.queue !== 'ignore_equal_or_lower' ||
      reaction.preemption !== 'higher_priority' ||
      reaction.loop !== false ||
      reaction.returnTo !== 'current_pose'
    ) {
      errors.push(`animations.reactions[${index}] must use approved interruption behavior`);
    }
  }

  return errors;
}

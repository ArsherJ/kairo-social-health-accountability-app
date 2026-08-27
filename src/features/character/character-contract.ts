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

export type DataBindingPropertyType = 'enum' | 'trigger' | 'boolean';

export interface CharacterManifest {
  schemaVersion: 1;
  characterId: 'kairo_creature';
  assetVersion: 'v1';
  rive: { artboard: 'KAIRO'; viewModel: 'KairoCharacter'; stateMachine: 'KairoStateMachine' };
  defaults: { sleepState: 'normal'; strengthTier: 'fit'; pose: 'idle' };
  properties: Record<string, { path: string; type: DataBindingPropertyType }>;
  cosmeticProperties: Record<CosmeticSlot, { path: string; type: 'enum'; order: number }>;
}

export interface CosmeticManifest {
  schemaVersion: 1;
  characterId: 'kairo_creature';
  slotEnums: Record<CosmeticSlot, readonly ('none' | CosmeticId)[]>;
  items: readonly CosmeticManifestItem[];
}

export interface CosmeticManifestItem {
  id: CosmeticId;
  displayName: string;
  slot: CosmeticSlot;
  anchor: string;
  riveEnumValue: CosmeticId;
  components: readonly { anchor: string }[];
  compatiblePoses: readonly KairoPose[];
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
  cosmetics: unknown;
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

const EXPECTED_COSMETIC_PROPERTIES = {
  body: { path: 'cosmetics/body', type: 'enum', order: 10 },
  feet: { path: 'cosmetics/feet', type: 'enum', order: 20 },
  back: { path: 'cosmetics/back', type: 'enum', order: 30 },
  neck: { path: 'cosmetics/neck', type: 'enum', order: 40 },
  face: { path: 'cosmetics/face', type: 'enum', order: 50 },
  head: { path: 'cosmetics/head', type: 'enum', order: 60 },
  effect: { path: 'cosmetics/effect', type: 'enum', order: 100 },
} as const;

const EXPECTED_COSMETICS: readonly [CosmeticId, string, CosmeticSlot, string][] = [
  ['runner_cap', 'Runner Cap', 'head', 'head_top'],
  ['woven_salakot', 'Woven Salakot', 'head', 'head_top'],
  ['leaf_crown', 'Leaf Crown', 'head', 'head_top'],
  ['round_glasses', 'Round Glasses', 'face', 'head_center'],
  ['flight_goggles', 'Flight Goggles', 'face', 'head_center'],
  ['sunlit_bandana', 'Sunlit Bandana', 'neck', 'neck'],
  ['sampaguita_garland', 'Sampaguita Garland', 'neck', 'neck'],
  ['trail_vest', 'Trail Vest', 'body', 'body_center'],
  ['woven_cape', 'Woven Cape', 'back', 'back'],
  ['trail_sneakers', 'Trail Sneakers', 'feet', 'left_foot'],
  ['rain_boots', 'Rain Boots', 'feet', 'left_foot'],
  ['firefly_aura', 'Firefly Aura', 'effect', 'body_center'],
];

const CHARACTER_MANIFEST_KEYS = [
  'schemaVersion',
  'characterId',
  'assetVersion',
  'rive',
  'defaults',
  'properties',
  'cosmeticProperties',
] as const;
const COSMETIC_MANIFEST_KEYS = ['schemaVersion', 'characterId', 'slotEnums', 'items'] as const;
const ANIMATION_MANIFEST_KEYS = [
  'schemaVersion',
  'characterId',
  'transitionSeconds',
  'poses',
  'reactions',
] as const;
const COSMETIC_ITEM_KEYS = [
  'id',
  'displayName',
  'slot',
  'anchor',
  'riveEnumValue',
  'components',
  'compatiblePoses',
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
  cosmetics,
  animations,
}: CharacterManifestBundle): string[] {
  const errors: string[] = [];
  const characterManifest = addHeaderErrors(errors, 'character', character);
  const cosmeticsManifest = addHeaderErrors(errors, 'cosmetics', cosmetics);
  const animationsManifest = addHeaderErrors(errors, 'animations', animations);

  addExactKeyErrors(errors, 'character', characterManifest, CHARACTER_MANIFEST_KEYS);
  addExactKeyErrors(errors, 'cosmetics', cosmeticsManifest, COSMETIC_MANIFEST_KEYS);
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

  const cosmeticProperties = asRecord(characterManifest.cosmeticProperties);
  addExactKeyErrors(
    errors,
    'character.cosmeticProperties',
    cosmeticProperties,
    COSMETIC_SLOTS,
  );
  for (const slot of COSMETIC_SLOTS) {
    const expected = EXPECTED_COSMETIC_PROPERTIES[slot];
    const property = asRecord(cosmeticProperties[slot]);
    addExactKeyErrors(errors, `character.cosmeticProperties.${slot}`, property, [
      'path',
      'type',
      'order',
    ]);
    if (
      property.path !== expected.path ||
      property.type !== expected.type ||
      property.order !== expected.order
    ) {
      errors.push(
        `character.cosmeticProperties.${slot} must equal ${expected.path} (${expected.type}, order ${expected.order})`,
      );
    }
  }

  const items = Array.isArray(cosmeticsManifest.items) ? cosmeticsManifest.items : [];
  if (items.length !== EXPECTED_COSMETICS.length) errors.push('cosmetics.items must contain 12 items');
  if (!sameArray(items.map((item) => asRecord(item).id), EXPECTED_COSMETICS.map(([id]) => id))) {
    errors.push('cosmetics.items must preserve canonical item order');
  }
  const itemById = new Map<string, UnknownRecord>();
  for (let index = 0; index < items.length; index += 1) {
    const item = asRecord(items[index]);
    addExactKeyErrors(errors, `cosmetics.items[${index}]`, item, COSMETIC_ITEM_KEYS);
    if (Array.isArray(item.components)) {
      for (let componentIndex = 0; componentIndex < item.components.length; componentIndex += 1) {
        addExactKeyErrors(
          errors,
          `cosmetics.items[${index}].components[${componentIndex}]`,
          asRecord(item.components[componentIndex]),
          ['anchor'],
        );
      }
    }
    const id = item.id;
    if (typeof id !== 'string') {
      errors.push(`cosmetics.items[${index}].id must be a string`);
    } else if (itemById.has(id)) {
      errors.push(`cosmetics.items[${index}].id duplicates ${id}`);
    } else {
      itemById.set(id, item);
    }
  }

  for (const [id, displayName, slot, anchor] of EXPECTED_COSMETICS) {
    const item = itemById.get(id);
    if (!item) {
      errors.push(`cosmetics.items.${id} must be registered`);
      continue;
    }
    if (item.displayName !== displayName) {
      errors.push(`cosmetics.items.${id}.displayName must equal ${displayName}`);
    }
    if (item.slot !== slot || item.anchor !== anchor) {
      errors.push(`cosmetics.items.${id} must use ${slot}/${anchor}`);
    }
    if (item.riveEnumValue !== id) errors.push(`cosmetics.items.${id}.riveEnumValue must equal ${id}`);
    const componentAnchors = Array.isArray(item.components)
      ? item.components.map((component) => asRecord(component).anchor)
      : [];
    const expectedAnchors = slot === 'feet' ? ['left_foot', 'right_foot'] : [anchor];
    if (!sameArray(componentAnchors, expectedAnchors)) {
      errors.push(`cosmetics.items.${id}.components must use ${expectedAnchors.join(', ')}`);
    }
    if (!sameArray(item.compatiblePoses, KAIRO_POSES)) {
      errors.push(`cosmetics.items.${id}.compatiblePoses must equal canonical pose order`);
    }
  }

  const slotEnums = asRecord(cosmeticsManifest.slotEnums);
  addExactKeyErrors(errors, 'cosmetics.slotEnums', slotEnums, COSMETIC_SLOTS);
  for (const slot of COSMETIC_SLOTS) {
    const expectedValues = [
      'none',
      ...EXPECTED_COSMETICS.filter(([, , itemSlot]) => itemSlot === slot).map(([id]) => id),
    ];
    if (!sameArray(slotEnums[slot], expectedValues)) {
      errors.push(`cosmetics.slotEnums.${slot} must equal none plus its slot IDs`);
    }
  }

  if (animationsManifest.transitionSeconds !== 0.18) {
    errors.push('animations.transitionSeconds must equal 0.18');
  }
  const poses = Array.isArray(animationsManifest.poses) ? animationsManifest.poses : [];
  if (poses.some((entry) => asRecord(entry).id === 'level_up')) {
    errors.push('animations.poses must not contain level_up');
  }
  if (poses.length !== EXPECTED_POSES.length) errors.push('animations.poses must contain six poses');
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

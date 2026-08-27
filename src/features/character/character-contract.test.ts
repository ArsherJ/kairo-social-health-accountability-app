import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { cosmeticAnchorMetadata, KAIRO_STATIC_CATALOG } from './kairo-lab-contract.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const KAIRO_LAB_PATH = resolve(REPO_ROOT, 'src/features/character/KairoLab.tsx');
const KAIRO_LAB_ROUTE_PATH = resolve(REPO_ROOT, 'app/kairo-lab.tsx');
const PRODUCTION_NAVIGATION_PATHS = [
  resolve(REPO_ROOT, 'app/_layout.tsx'),
  resolve(REPO_ROOT, 'app/(tabs)/_layout.tsx'),
] as const;

type MutableRecord = Record<string, unknown>;
type MutableManifestBundle = {
  character: MutableRecord;
  cosmetics: MutableRecord;
  animations: MutableRecord;
};

function mutableRecord(value: unknown): MutableRecord {
  return value as MutableRecord;
}

function mutableArray(value: unknown): unknown[] {
  return value as unknown[];
}

function manifestFixture(): MutableManifestBundle {
  return structuredClone({ character, cosmetics, animations }) as MutableManifestBundle;
}

const ADVERSARIAL_MANIFEST_MUTATIONS: readonly {
  name: string;
  mutate: (bundle: MutableManifestBundle) => void;
  expected: readonly string[];
}[] = [
  {
    name: 'an extra character top-level key',
    mutate: ({ character: mutableCharacter }) => {
      mutableCharacter.unapproved = true;
    },
    expected: ['character.unapproved must not be declared'],
  },
  {
    name: 'an extra cosmetics top-level key',
    mutate: ({ cosmetics: mutableCosmetics }) => {
      mutableCosmetics.unapproved = true;
    },
    expected: ['cosmetics.unapproved must not be declared'],
  },
  {
    name: 'an extra animations top-level key',
    mutate: ({ animations: mutableAnimations }) => {
      mutableAnimations.unapproved = true;
    },
    expected: ['animations.unapproved must not be declared'],
  },
  {
    name: 'an extra Rive metadata key',
    mutate: ({ character: mutableCharacter }) => {
      mutableRecord(mutableCharacter.rive).unapproved = true;
    },
    expected: ['character.rive.unapproved must not be declared'],
  },
  {
    name: 'an extra defaults key',
    mutate: ({ character: mutableCharacter }) => {
      mutableRecord(mutableCharacter.defaults).unapproved = true;
    },
    expected: ['character.defaults.unapproved must not be declared'],
  },
  {
    name: 'an extra runtime-property key',
    mutate: ({ character: mutableCharacter }) => {
      const properties = mutableRecord(mutableCharacter.properties);
      mutableRecord(properties.sleepState).unapproved = true;
    },
    expected: ['character.properties.sleepState.unapproved must not be declared'],
  },
  {
    name: 'an extra cosmetic-property key',
    mutate: ({ character: mutableCharacter }) => {
      const cosmeticProperties = mutableRecord(mutableCharacter.cosmeticProperties);
      mutableRecord(cosmeticProperties.body).unapproved = true;
    },
    expected: ['character.cosmeticProperties.body.unapproved must not be declared'],
  },
  {
    name: 'an extra slot-enum key',
    mutate: ({ cosmetics: mutableCosmetics }) => {
      mutableRecord(mutableCosmetics.slotEnums).unapproved = ['none'];
    },
    expected: ['cosmetics.slotEnums.unapproved must not be declared'],
  },
  {
    name: 'an extra cosmetic-item key',
    mutate: ({ cosmetics: mutableCosmetics }) => {
      mutableRecord(mutableArray(mutableCosmetics.items)[0]).unapproved = true;
    },
    expected: ['cosmetics.items[0].unapproved must not be declared'],
  },
  {
    name: 'an extra cosmetic-component key',
    mutate: ({ cosmetics: mutableCosmetics }) => {
      const item = mutableRecord(mutableArray(mutableCosmetics.items)[0]);
      mutableRecord(mutableArray(item.components)[0]).unapproved = true;
    },
    expected: ['cosmetics.items[0].components[0].unapproved must not be declared'],
  },
  {
    name: 'an extra pose key',
    mutate: ({ animations: mutableAnimations }) => {
      mutableRecord(mutableArray(mutableAnimations.poses)[0]).unapproved = true;
    },
    expected: ['animations.poses[0].unapproved must not be declared'],
  },
  {
    name: 'an extra reaction key',
    mutate: ({ animations: mutableAnimations }) => {
      mutableRecord(mutableArray(mutableAnimations.reactions)[0]).unapproved = true;
    },
    expected: ['animations.reactions[0].unapproved must not be declared'],
  },
  {
    name: 'cosmetic items outside canonical order',
    mutate: ({ cosmetics: mutableCosmetics }) => {
      const items = mutableArray(mutableCosmetics.items);
      [items[0], items[1]] = [items[1], items[0]];
    },
    expected: ['cosmetics.items must preserve canonical item order'],
  },
  {
    name: 'an empty cosmetic display name',
    mutate: ({ cosmetics: mutableCosmetics }) => {
      mutableRecord(mutableArray(mutableCosmetics.items)[0]).displayName = '';
    },
    expected: ['cosmetics.items.runner_cap.displayName must equal Runner Cap'],
  },
  {
    name: 'a changed cosmetic display name',
    mutate: ({ cosmetics: mutableCosmetics }) => {
      mutableRecord(mutableArray(mutableCosmetics.items)[0]).displayName = 'Running Cap';
    },
    expected: ['cosmetics.items.runner_cap.displayName must equal Runner Cap'],
  },
];

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

  it('rejects an unapproved runtime property with a path-specific diagnostic', () => {
    expect(
      validateCharacterManifests({
        character: {
          ...character,
          properties: {
            ...character.properties,
            mood: { path: 'appearance/mood', type: 'enum' },
          },
        },
        cosmetics,
        animations,
      }),
    ).toEqual(['character.properties.mood must not be declared']);
  });

  it('rejects an unapproved cosmetic property with a path-specific diagnostic', () => {
    expect(
      validateCharacterManifests({
        character: {
          ...character,
          cosmeticProperties: {
            ...character.cosmeticProperties,
            aura: { path: 'cosmetics/aura', type: 'enum', order: 110 },
          },
        },
        cosmetics,
        animations,
      }),
    ).toEqual(['character.cosmeticProperties.aura must not be declared']);
  });

  it.each(ADVERSARIAL_MANIFEST_MUTATIONS)(
    'rejects $name with deterministic path-specific diagnostics',
    ({ mutate, expected }) => {
      const bundle = manifestFixture();
      mutate(bundle);

      expect(validateCharacterManifests(bundle)).toEqual(expected);
    },
  );

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

  it('lists every approved static KAIRO catalog preview in canonical order', () => {
    expect(KAIRO_STATIC_CATALOG).toEqual({
      base: ['base'],
      poses: ['idle', 'sleep', 'walk', 'run', 'workout', 'race_victory'],
      states: ['sleepy', 'normal', 'well_rested'],
      cosmetics: [
        'runner_cap',
        'woven_salakot',
        'leaf_crown',
        'round_glasses',
        'flight_goggles',
        'sunlit_bandana',
        'sampaguita_garland',
        'trail_vest',
        'woven_cape',
        'trail_sneakers',
        'rain_boots',
        'firefly_aura',
      ],
    });
  });

  it('labels the complete available cosmetic anchor semantics without inventing component identity', () => {
    const trailSneakers = cosmetics.items.find((item) => item.id === 'trail_sneakers');
    expect(trailSneakers).toBeDefined();
    expect(cosmeticAnchorMetadata(trailSneakers!)).toBe(
      'Primary anchor: left_foot\nComponent anchors (2): left_foot, right_foot',
    );

    for (const cosmetic of cosmetics.items.filter((item) => item.components.length === 1)) {
      expect(cosmeticAnchorMetadata(cosmetic)).toBe(
        `Primary anchor: ${cosmetic.anchor}\nComponent anchors (1): ${cosmetic.anchor}`,
      );
    }
  });

  it('keeps the development catalog static and unreachable from production navigation', () => {
    const labSource = existsSync(KAIRO_LAB_PATH) ? readFileSync(KAIRO_LAB_PATH, 'utf8') : '';
    const routeSource = existsSync(KAIRO_LAB_ROUTE_PATH)
      ? readFileSync(KAIRO_LAB_ROUTE_PATH, 'utf8')
      : '';

    for (const registry of [
      'KAIRO_BASE_ASSET',
      'KAIRO_POSE_ASSETS',
      'KAIRO_STATE_ASSETS',
      'KAIRO_COSMETIC_ASSETS',
    ]) {
      expect(labSource).toContain(registry);
    }
    expect(labSource).toContain('Static asset catalog — Rive parked');
    expect(labSource).toContain('cosmeticAnchorMetadata(cosmetic)');
    expect(labSource).not.toMatch(
      /@rive-app\/react-native|\.riv|KairoRenderer|\bbinding\b|\bview[-_ ]?model\b/i,
    );

    const normalizedRouteSource = routeSource.replace(/\s+/g, ' ').trim();
    expect(normalizedRouteSource).toContain(
      'if (!__DEV__) return <Redirect href="/" />; return <KairoLab />;',
    );

    for (const navigationPath of PRODUCTION_NAVIGATION_PATHS) {
      expect(readFileSync(navigationPath, 'utf8')).not.toContain('kairo-lab');
    }
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import animations from '../../../data/animations.json';
import character from '../../../data/character.json';
import {
  KAIRO_POSES,
  KAIRO_REACTIONS,
  SLEEP_STATES,
  STRENGTH_TIERS,
  validateCharacterManifests,
} from './character-contract.ts';
import { firstLevelOfStage, KAIRO_STATIC_CATALOG } from './kairo-lab-contract.ts';

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
  animations: MutableRecord;
};

function mutableRecord(value: unknown): MutableRecord {
  return value as MutableRecord;
}

function mutableArray(value: unknown): unknown[] {
  return value as unknown[];
}

function manifestFixture(): MutableManifestBundle {
  return structuredClone({ character, animations }) as MutableManifestBundle;
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
      'summit',
    ]);
    expect(KAIRO_REACTIONS).toEqual([
      'happy',
      'excited',
      'tired',
      'victory',
      'level_up',
    ]);
    expect(KAIRO_POSES).not.toContain('level_up');
  });

  it('validates every checked-in manifest as one contract', () => {
    expect(validateCharacterManifests({ character, animations })).toEqual([]);
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
        animations,
      }),
    ).toEqual(['character.properties.mood must not be declared']);
  });


  it.each(ADVERSARIAL_MANIFEST_MUTATIONS)(
    'rejects $name with deterministic path-specific diagnostics',
    ({ mutate, expected }) => {
      const bundle = manifestFixture();
      mutate(bundle);

      expect(validateCharacterManifests(bundle)).toEqual(expected);
    },
  );


  it('keeps level-up and victory semantics distinct', () => {
    expect(animations.poses.map((entry) => entry.id)).toContain('race_victory');
    expect(animations.poses.map((entry) => entry.id)).not.toContain('level_up');
    expect(animations.reactions.map((entry) => entry.id)).toContain('level_up');
    expect(animations.reactions.map((entry) => entry.id)).toContain('victory');
  });

  it('lists every approved static KAIRO catalog preview in canonical order', () => {
    expect(KAIRO_STATIC_CATALOG).toEqual({
      base: ['base'],
      poses: ['idle', 'sleep', 'walk', 'run', 'workout', 'race_victory', 'summit'],
      stages: [1, 2, 3, 4],
      states: ['sleepy', 'normal', 'well_rested'],
    });
  });

  // Both halves, for the reason `DAILY_STEP_BASELINE` keeps both: the
  // derivation stops the lab describing bands the engine stopped using, and the
  // literals stop a moved threshold sliding through unnoticed. Move a band and
  // a human decides.
  it('derives each growth stage\'s first level from the band function', () => {
    expect(KAIRO_STATIC_CATALOG.stages.map(firstLevelOfStage)).toEqual([1, 6, 11, 21]);
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
    ]) {
      expect(labSource).toContain(registry);
    }
    expect(labSource).toContain('Static asset catalog — Rive parked');
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

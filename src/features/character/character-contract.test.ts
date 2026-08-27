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

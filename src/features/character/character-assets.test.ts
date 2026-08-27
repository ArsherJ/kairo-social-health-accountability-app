import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type DecodedPng = { width: number; height: number; data: Buffer };

const loadModule = createRequire(import.meta.url);
const { PNG } = loadModule('pngjs') as {
  PNG: { sync: { read: (buffer: Buffer) => DecodedPng } };
};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const REGISTRY_PATH = resolve(REPO_ROOT, 'src/features/character/character-assets.ts');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const REQUIRED_PNG = [
  'assets/character/base/kairo_base_front_v1.png',
  'assets/character/poses/kairo_pose_idle_v1.png',
  'assets/character/poses/kairo_pose_sleep_v1.png',
  'assets/character/poses/kairo_pose_walk_v1.png',
  'assets/character/poses/kairo_pose_run_v1.png',
  'assets/character/poses/kairo_pose_workout_v1.png',
  'assets/character/poses/kairo_pose_race_victory_v1.png',
  'assets/character/states/kairo_state_sleepy_v1.png',
  'assets/character/states/kairo_state_normal_v1.png',
  'assets/character/states/kairo_state_well_rested_v1.png',
  'assets/character/cosmetics/cosmetic_head_runner_cap_v1.png',
  'assets/character/cosmetics/cosmetic_head_woven_salakot_v1.png',
  'assets/character/cosmetics/cosmetic_head_leaf_crown_v1.png',
  'assets/character/cosmetics/cosmetic_face_round_glasses_v1.png',
  'assets/character/cosmetics/cosmetic_face_flight_goggles_v1.png',
  'assets/character/cosmetics/cosmetic_neck_sunlit_bandana_v1.png',
  'assets/character/cosmetics/cosmetic_neck_sampaguita_garland_v1.png',
  'assets/character/cosmetics/cosmetic_body_trail_vest_v1.png',
  'assets/character/cosmetics/cosmetic_back_woven_cape_v1.png',
  'assets/character/cosmetics/cosmetic_feet_trail_sneakers_v1.png',
  'assets/character/cosmetics/cosmetic_feet_rain_boots_v1.png',
  'assets/character/cosmetics/cosmetic_effect_firefly_aura_v1.png',
];

const COSMETIC_CHANGE_RECTS = {
  'cosmetic_head_runner_cap_v1.png': { left: 70, top: 0, right: 500, bottom: 215 },
  'cosmetic_head_woven_salakot_v1.png': { left: 45, top: 0, right: 525, bottom: 230 },
  'cosmetic_head_leaf_crown_v1.png': { left: 70, top: 0, right: 500, bottom: 225 },
  'cosmetic_face_round_glasses_v1.png': { left: 115, top: 190, right: 455, bottom: 355 },
  'cosmetic_face_flight_goggles_v1.png': { left: 100, top: 175, right: 470, bottom: 365 },
  'cosmetic_neck_sunlit_bandana_v1.png': { left: 115, top: 300, right: 455, bottom: 475 },
  'cosmetic_neck_sampaguita_garland_v1.png': { left: 95, top: 300, right: 475, bottom: 460 },
  'cosmetic_body_trail_vest_v1.png': { left: 85, top: 335, right: 485, bottom: 585 },
  'cosmetic_back_woven_cape_v1.png': { left: 45, top: 315, right: 525, bottom: 610 },
  'cosmetic_feet_trail_sneakers_v1.png': { left: 105, top: 500, right: 465, bottom: 636 },
  'cosmetic_feet_rain_boots_v1.png': { left: 105, top: 485, right: 465, bottom: 636 },
} as const;

function decodePng(relativePath: string) {
  return PNG.sync.read(readFileSync(resolve(REPO_ROOT, relativePath)));
}

function pixelOffset(width: number, x: number, y: number) {
  return (y * width + x) * 4;
}

function channel(data: Buffer, offset: number) {
  const value = data[offset];
  if (value === undefined) throw new Error(`PNG data is truncated at byte ${offset}`);
  return value;
}

function firstDifferenceOutsideRect(
  base: ReturnType<typeof decodePng>,
  cosmetic: ReturnType<typeof decodePng>,
  rect: { left: number; top: number; right: number; bottom: number },
) {
  for (let y = 0; y < base.height; y += 1) {
    for (let x = 0; x < base.width; x += 1) {
      if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) continue;

      const offset = pixelOffset(base.width, x, y);
      for (let channelIndex = 0; channelIndex < 4; channelIndex += 1) {
        if (
          channel(base.data, offset + channelIndex) !==
          channel(cosmetic.data, offset + channelIndex)
        ) {
          return { x, y };
        }
      }
    }
  }

  return null;
}

describe('KAIRO character assets', () => {
  it('registers every checked-in PNG with literal React Native requires', () => {
    const registrySource = existsSync(REGISTRY_PATH) ? readFileSync(REGISTRY_PATH, 'utf8') : '';

    for (const relativePath of REQUIRED_PNG) {
      expect(registrySource).toContain(`require('../../../${relativePath}')`);
    }

    const exportedNames = [...registrySource.matchAll(/\bexport\s+const\s+([A-Z0-9_]+)/g)].map(
      ([, name]) => name,
    );
    expect(exportedNames).toEqual([
      'KAIRO_BASE_ASSET',
      'KAIRO_POSE_ASSETS',
      'KAIRO_STATE_ASSETS',
      'KAIRO_COSMETIC_ASSETS',
    ]);

    const dependencyAndConfigSources = [
      registrySource,
      readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'),
      readFileSync(resolve(REPO_ROOT, 'package-lock.json'), 'utf8'),
      readFileSync(resolve(REPO_ROOT, 'metro.config.js'), 'utf8'),
    ];
    for (const source of dependencyAndConfigSources) {
      expect(source).not.toMatch(/rive|\.riv|KAIRO_RIVE/i);
    }
    expect(dependencyAndConfigSources[3]).not.toMatch(/(?:sourceExts|assetExts)[^\n]*\briv\b/i);
  });

  it('contains every non-empty PNG fallback and QA preview', () => {
    for (const relativePath of REQUIRED_PNG) {
      const absolutePath = resolve(REPO_ROOT, relativePath);

      expect(existsSync(absolutePath), relativePath).toBe(true);
      expect(statSync(absolutePath).size, relativePath).toBeGreaterThan(0);
      expect(readFileSync(absolutePath).subarray(0, 8), relativePath).toEqual(PNG_SIGNATURE);
    }
  });

  it('keeps equivalent neutral snapshots pixel-identical', () => {
    const base = decodePng('assets/character/base/kairo_base_front_v1.png');

    for (const relativePath of [
      'assets/character/poses/kairo_pose_idle_v1.png',
      'assets/character/states/kairo_state_normal_v1.png',
    ]) {
      expect(decodePng(relativePath).data.equals(base.data), relativePath).toBe(true);
    }
  });

  it('keeps cosmetic preview changes inside their slot-local regions', () => {
    const base = decodePng('assets/character/base/kairo_base_front_v1.png');

    for (const [filename, rect] of Object.entries(COSMETIC_CHANGE_RECTS)) {
      const cosmetic = decodePng(`assets/character/cosmetics/${filename}`);
      expect([cosmetic.width, cosmetic.height], filename).toEqual([base.width, base.height]);
      expect(firstDifferenceOutsideRect(base, cosmetic, rect), filename).toBeNull();
    }
  });

  it('keeps the firefly aura off KAIRO and warm-golden', () => {
    const base = decodePng('assets/character/base/kairo_base_front_v1.png');
    const aura = decodePng('assets/character/cosmetics/cosmetic_effect_firefly_aura_v1.png');
    const warmPixels: Array<[number, number, number]> = [];

    for (let y = 0; y < base.height; y += 1) {
      for (let x = 0; x < base.width; x += 1) {
        const offset = pixelOffset(base.width, x, y);
        const changed = [0, 1, 2, 3].some(
          (channelIndex) =>
            channel(base.data, offset + channelIndex) !== channel(aura.data, offset + channelIndex),
        );
        if (!changed) continue;

        expect(channel(base.data, offset + 3), `firefly overlaps KAIRO at ${x},${y}`).toBe(0);
        if (channel(aura.data, offset + 3) >= 64) {
          warmPixels.push([
            channel(aura.data, offset),
            channel(aura.data, offset + 1),
            channel(aura.data, offset + 2),
          ]);
        }
      }
    }

    expect(warmPixels.length).toBeGreaterThan(50);
    let redTotal = 0;
    let greenTotal = 0;
    let blueTotal = 0;
    for (const [red, green, blue] of warmPixels) {
      redTotal += red;
      greenTotal += green;
      blueTotal += blue;
    }
    expect(redTotal).toBeGreaterThan(greenTotal);
    expect(greenTotal).toBeGreaterThan(blueTotal * 1.5);
  });
});

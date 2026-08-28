import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { KAIRO_THUMBNAIL_POSE } from './character-surface-policy.ts';

type DecodedPng = { width: number; height: number; data: Buffer };

const loadModule = createRequire(import.meta.url);
const { PNG } = loadModule('pngjs') as {
  PNG: { sync: { read: (buffer: Buffer) => DecodedPng } };
};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const REGISTRY_PATH = resolve(REPO_ROOT, 'src/features/character/character-assets.ts');
const THUMBNAIL_PATH = resolve(REPO_ROOT, 'src/features/character/KairoThumbnail.tsx');
const COMPACT_SURFACE_PATHS = [
  resolve(REPO_ROOT, 'src/features/squad/SkyMarker.tsx'),
  resolve(REPO_ROOT, 'src/features/squad/LeaderboardRow.tsx'),
  resolve(REPO_ROOT, 'app/event/[id].tsx'),
] as const;
const REQUIRED_REGISTRY_EXPORTS = [
  'KAIRO_BASE_ASSET',
  'KAIRO_POSE_ASSETS',
  'KAIRO_STATE_ASSETS',
  'KAIRO_COSMETIC_ASSETS',
] as const;
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

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((item) => item.kind === kind) === true;
}

function collectBindingNames(name: ts.BindingName, names: string[]): void {
  if (ts.isIdentifier(name)) {
    names.push(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) continue;
    collectBindingNames(element.name, names);
  }
}

function collectExportedNames(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    'character-assets.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names: string[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      names.push(statement.isExportEquals ? 'export=' : 'default');
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause === undefined) {
        names.push('*');
      } else if (ts.isNamespaceExport(statement.exportClause)) {
        names.push(statement.exportClause.name.text);
      } else {
        names.push(...statement.exportClause.elements.map((element) => element.name.text));
      }
      continue;
    }
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      names.push('default');
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBindingNames(declaration.name, names);
      }
      continue;
    }
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement)
    ) {
      if (statement.name !== undefined) names.push(statement.name.getText(sourceFile));
    }
  }

  return names;
}

describe('KAIRO character assets', () => {
  it('assigns the approved static pose to every compact surface', () => {
    expect(KAIRO_THUMBNAIL_POSE).toEqual({
      skyMarker: 'run',
      leaderboard: 'idle',
      eventMember: 'idle',
    });
  });

  it('keeps compact KAIRO surfaces on the static thumbnail boundary', () => {
    const thumbnailSource = existsSync(THUMBNAIL_PATH) ? readFileSync(THUMBNAIL_PATH, 'utf8') : '';
    const compactSources = COMPACT_SURFACE_PATHS.map((path) => readFileSync(path, 'utf8'));

    // Interim (2026-08-28): compact surfaces render the single static base
    // render, not a per-pose export, while the Rive character is authored.
    expect(thumbnailSource).toContain('KAIRO_BASE_ASSET');
    for (const source of compactSources) {
      expect(source).toContain('<KairoThumbnail');
    }
    for (const source of [thumbnailSource, ...compactSources]) {
      expect(source).not.toMatch(/KairoRenderer|@rive-app\/react-native|\.riv/);
    }
  });

  it('registers every checked-in PNG with literal React Native requires', () => {
    const registrySource = existsSync(REGISTRY_PATH) ? readFileSync(REGISTRY_PATH, 'utf8') : '';

    for (const relativePath of REQUIRED_PNG) {
      expect(registrySource).toContain(`require('../../../${relativePath}')`);
    }

    expect(collectExportedNames(registrySource)).toEqual([...REQUIRED_REGISTRY_EXPORTS]);

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

  it('recognizes every export form so extra public names cannot hide', () => {
    const representativeSource = `
      // export const COMMENT_FAKE = true;
      const text = "export const STRING_FAKE = true";
      export const KAIRO_BASE_ASSET = 1;
      export const KAIRO_POSE_ASSETS = 2;
      export const KAIRO_STATE_ASSETS = 3;
      export const KAIRO_COSMETIC_ASSETS = 4;
      export const helper = 5, secondHelper = 6;
      export async function helperFunction() {}
      export type Helper = string;
      export interface HelperInterface {}
      export enum HelperEnum { Value }
      export class HelperClass {}
      export default {};
      export = helper;
      const namedHelper = 7;
      export { namedHelper };
      export { helper as helperAlias };
      export type { Helper as ExportedHelper };
      export * from './helper';
      export * as namespaceHelper from './helper';
    `;

    expect(collectExportedNames(representativeSource)).toEqual([
      ...REQUIRED_REGISTRY_EXPORTS,
      'helper',
      'secondHelper',
      'helperFunction',
      'Helper',
      'HelperInterface',
      'HelperEnum',
      'HelperClass',
      'default',
      'export=',
      'namedHelper',
      'helperAlias',
      'ExportedHelper',
      '*',
      'namespaceHelper',
    ]);
  });

  it('contains every structurally valid full-frame PNG fallback and QA preview', () => {
    expect(REQUIRED_PNG).toHaveLength(22);

    for (const relativePath of REQUIRED_PNG) {
      const absolutePath = resolve(REPO_ROOT, relativePath);

      expect(existsSync(absolutePath), relativePath).toBe(true);
      expect(statSync(absolutePath).size, relativePath).toBeGreaterThan(0);
      expect(readFileSync(absolutePath).subarray(0, 8), relativePath).toEqual(PNG_SIGNATURE);

      const png = decodePng(relativePath);
      expect([png.width, png.height], relativePath).toEqual([570, 636]);
      expect(png.data.length, relativePath).toBe(570 * 636 * 4);
      for (const [x, y] of [
        [0, 0],
        [png.width - 1, 0],
        [0, png.height - 1],
        [png.width - 1, png.height - 1],
      ] as const) {
        expect(channel(png.data, pixelOffset(png.width, x, y) + 3), `${relativePath} ${x},${y}`).toBe(0);
      }

      const bottomRowHasContact = Array.from({ length: png.width }, (_, x) =>
        channel(png.data, pixelOffset(png.width, x, png.height - 1) + 3),
      ).some((alpha) => alpha > 0);
      expect(bottomRowHasContact, relativePath).toBe(true);
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

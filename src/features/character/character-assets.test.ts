import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  ADULT_STAGE,
  GROWTH_STAGE_NAMES,
  GROWTH_STAGES,
  STAGE_POSES,
} from './character-contract.ts';
import { KAIRO_THUMBNAIL_POSE } from './character-surface-policy.ts';

type DecodedPng = { width: number; height: number; data: Buffer };

const loadModule = createRequire(import.meta.url);
const { PNG } = loadModule('pngjs') as {
  PNG: { sync: { read: (buffer: Buffer) => DecodedPng } };
};

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const REGISTRY_PATH = resolve(REPO_ROOT, 'src/features/character/character-assets.ts');
const THUMBNAIL_PATH = resolve(REPO_ROOT, 'src/features/character/KairoThumbnail.tsx');
/**
 * Today's full-character surface. It is the *only* screen that mounts
 * `CharacterFigure` — You draws the decorative `KairoThumbnail` — so this is
 * where the base render, the pose set and the Mind state set all have to be
 * reachable, and where the static boundary has to hold.
 */
const TODAY_FIGURE_PATH = resolve(REPO_ROOT, 'src/features/character/CharacterFigure.tsx');
const COMPACT_SURFACE_PATHS = [
  resolve(REPO_ROOT, 'src/features/squad/SkyMarker.tsx'),
  resolve(REPO_ROOT, 'src/features/squad/LeaderboardRow.tsx'),
] as const;
const REQUIRED_REGISTRY_EXPORTS = [
  'KAIRO_BASE_ASSET',
  'KAIRO_POSE_ASSETS',
  'KAIRO_STAGE_ASSETS',
  'KAIRO_STATE_ASSETS',
  'KAIRO_BASE_CREST',
  'KAIRO_POSE_CRESTS',
  'KAIRO_STAGE_CRESTS',
  'KAIRO_STATE_CRESTS',
  'KAIRO_COSMETIC_ASSETS',
] as const;
/**
 * The three stages that have art of their own, paired with the word their files
 * are named for. `GROWTH_STAGE_NAMES` is the source of those words and stage 4
 * is deliberately absent — by `ADULT_STAGE` rather than by a 4 — because the
 * adult keeps the pose set and so has no file under `stages/` to name.
 */
const PRE_ADULT_STAGE_NAMES = GROWTH_STAGES.filter((stage) => stage !== ADULT_STAGE).map(
  (stage) => [stage, GROWTH_STAGE_NAMES[stage]] as const,
);
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
  'assets/character/stages/kairo_stage_hatchling_idle_v1.png',
  'assets/character/stages/kairo_stage_hatchling_walk_v1.png',
  'assets/character/stages/kairo_stage_hatchling_run_v1.png',
  'assets/character/stages/kairo_stage_fledgling_idle_v1.png',
  'assets/character/stages/kairo_stage_fledgling_walk_v1.png',
  'assets/character/stages/kairo_stage_fledgling_run_v1.png',
  'assets/character/stages/kairo_stage_juvenile_idle_v1.png',
  'assets/character/stages/kairo_stage_juvenile_walk_v1.png',
  'assets/character/stages/kairo_stage_juvenile_run_v1.png',
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

/**
 * Every render that needs a crest mask, paired with the mask it needs.
 *
 * **Derived from `REQUIRED_PNG` rather than listed again**, so the pairing is a
 * consequence of the art list rather than a third statement of it — the name is
 * the whole mapping (`crest_<the render's own filename>`), and the registry
 * guard below rebuilds the same path from the *registry* independently, so the
 * two have to agree. Cosmetics are excluded because they are flattened QA
 * previews no product surface mounts.
 */
const CREST_MASK_PAIRS = REQUIRED_PNG.filter((path) => !path.includes('/cosmetics/')).map(
  (art) => [`assets/character/crests/crest_${art.split('/').pop()}`, art] as const,
);

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

/** The mask that belongs to one render — the naming rule, in one place. */
function crestPathFor(artPath: string) {
  return `../../../assets/character/crests/crest_${artPath.split('/').pop()}`;
}

function pixelOffset(width: number, x: number, y: number) {
  return (y * width + x) * 4;
}

function channel(data: Buffer, offset: number) {
  const value = data[offset];
  if (value === undefined) throw new Error(`PNG data is truncated at byte ${offset}`);
  return value;
}

/**
 * Where a render's own alpha actually sits: its first and last opaque rows, and
 * the centre of the columns it spans. Every figure here is registered against
 * the adult's answer to the same three, so they are measured rather than
 * assumed.
 */
function alphaBounds(png: ReturnType<typeof decodePng>) {
  let top = png.height;
  let bottom = -1;
  let left = png.width;
  let right = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (channel(png.data, pixelOffset(png.width, x, y) + 3) === 0) continue;
      if (y < top) top = y;
      if (x < left) left = x;
      if (x > right) right = x;
      bottom = y;
    }
  }
  if (bottom === -1) throw new Error('render is entirely transparent');
  return { top, bottom, centre: (left + right) / 2 };
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

/**
 * Every `require('…')` path in an object literal, keyed by property — `inner`
 * for a flat table, `outer.inner` for a nested one.
 *
 * Parsed rather than matched with a regex because the property this guards is
 * *shape*: a cell that is missing, duplicated, or built from a template string
 * has to be distinguishable from one that is a literal path, and a regex over
 * the file cannot tell which cell it is looking at. `require(`…${stage}…`)` is
 * the failure that matters — Metro resolves `require` statically, so a computed
 * path is a blank image on a device and nothing at build time.
 */
function collectRequirePaths(source: string, exportName: string): Map<string, string> {
  const sourceFile = ts.createSourceFile(
    'character-assets.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const paths = new Map<string, string>();

  const requirePath = (node: ts.Expression): string | null => {
    if (!ts.isCallExpression(node)) return null;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'require') return null;
    const [argument] = node.arguments;
    if (argument === undefined || !ts.isStringLiteral(argument)) return null;
    return argument.text;
  };

  const propertyName = (property: ts.ObjectLiteralElementLike): string | null => {
    if (!ts.isPropertyAssignment(property)) return null;
    const name = property.name;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
      return name.text;
    }
    return null;
  };

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== exportName) continue;
      const initializer = declaration.initializer;
      if (initializer === undefined || !ts.isObjectLiteralExpression(initializer)) continue;
      for (const outer of initializer.properties) {
        const outerName = propertyName(outer);
        if (outerName === null || !ts.isPropertyAssignment(outer)) continue;
        const flat = requirePath(outer.initializer);
        if (flat !== null) {
          paths.set(outerName, flat);
          continue;
        }
        if (!ts.isObjectLiteralExpression(outer.initializer)) continue;
        for (const inner of outer.initializer.properties) {
          const innerName = propertyName(inner);
          if (innerName === null || !ts.isPropertyAssignment(inner)) continue;
          const path = requirePath(inner.initializer);
          if (path !== null) paths.set(`${outerName}.${innerName}`, path);
        }
      }
    }
  }

  return paths;
}

describe('KAIRO character assets', () => {
  it('assigns the approved static pose to every compact surface', () => {
    expect(KAIRO_THUMBNAIL_POSE).toEqual({
      skyMarker: 'run',
      leaderboard: 'idle',
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

  it('draws Today from all three approved registries and stays Rive-free', () => {
    const todayFigureSource = readFileSync(TODAY_FIGURE_PATH, 'utf8');
    // `staticFigureSelection` resolves reaction pose -> non-neutral Mind state
    // -> Motion pose (at its growth stage) -> base, so all four registries have
    // to be in reach here.
    expect(todayFigureSource).toContain('KAIRO_BASE_ASSET');
    expect(todayFigureSource).toContain('KAIRO_POSE_ASSETS');
    expect(todayFigureSource).toContain('KAIRO_STAGE_ASSETS');
    expect(todayFigureSource).toContain('KAIRO_STATE_ASSETS');
    expect(todayFigureSource).not.toMatch(/KairoRenderer|@rive-app\/react-native|\.riv/);
  });

  // The ticket's fourth criterion: a missing stage x pose cell has to fail at
  // build rather than render blank. The `Record<EvolutionStage, Record<StagePose,
  // ...>>` type is the first half and `tsc` enforces it; this is the second,
  // because a cell can be present, be typed, and still name a file that is not
  // there or a path Metro cannot follow.
  it('resolves every growth stage x pose to a checked-in file by a literal path', () => {
    const registrySource = readFileSync(REGISTRY_PATH, 'utf8');
    const cells = collectRequirePaths(registrySource, 'KAIRO_STAGE_ASSETS');

    const expectedCells = GROWTH_STAGES.flatMap((stage) =>
      STAGE_POSES.map((pose) => `${stage}.${pose}`),
    );
    expect([...cells.keys()].sort()).toEqual([...expectedCells].sort());

    for (const [cell, path] of cells) {
      const absolutePath = resolve(REPO_ROOT, path.replace('../../../', ''));
      expect(existsSync(absolutePath), `${cell} -> ${path}`).toBe(true);
      expect(readFileSync(absolutePath).subarray(0, 8), cell).toEqual(PNG_SIGNATURE);
    }
  });

  // Issue #31, and the criterion the nine images exist for: a level-up has to be
  // the largest visible change in the app. Twelve cells all naming one drawing
  // is exactly what that looked like before the art landed, and it is what an
  // aliased cell would silently restore — a stage whose art is another stage's
  // is a growth boundary a player crosses and cannot see.
  it('draws every pre-adult stage from its own art and leaves the adult on the pose set', () => {
    const registrySource = readFileSync(REGISTRY_PATH, 'utf8');
    const cells = collectRequirePaths(registrySource, 'KAIRO_STAGE_ASSETS');

    for (const pose of STAGE_POSES) {
      expect(cells.get(`${ADULT_STAGE}.${pose}`)).toBe(
        `../../../assets/character/poses/kairo_pose_${pose}_v1.png`,
      );
      for (const [stage, name] of PRE_ADULT_STAGE_NAMES) {
        expect(cells.get(`${stage}.${pose}`), `${stage}.${pose}`).toBe(
          `../../../assets/character/stages/kairo_stage_${name}_${pose}_v1.png`,
        );
      }
    }

    expect(new Set(cells.values()).size, 'two stages share a drawing').toBe(cells.size);
  });

  // The ticket's third criterion, which is the one no screen change can absorb:
  // every stage render is laid out against the adult render for its own pose —
  // same canvas, same figure height, same centre, same feet-on-the-bottom-edge
  // ground line — so `bodyScale` is what makes a hatchling look small and the
  // artwork never is. A render that arrives framed to itself puts a bird's feet
  // in mid-air on one level and on the floor on the next, and `figureResponse`
  // has no way to know.
  it('registers every stage render against the adult frame for its own pose', () => {
    for (const pose of STAGE_POSES) {
      const adult = decodePng(`assets/character/poses/kairo_pose_${pose}_v1.png`);
      const adultBounds = alphaBounds(adult);
      expect(adultBounds.bottom, pose).toBe(adult.height - 1);

      for (const [, name] of PRE_ADULT_STAGE_NAMES) {
        const label = `${name} ${pose}`;
        const stage = decodePng(`assets/character/stages/kairo_stage_${name}_${pose}_v1.png`);
        expect([stage.width, stage.height], label).toEqual([adult.width, adult.height]);

        const bounds = alphaBounds(stage);
        // One pixel of slack on the top edge only: the height comes out of a
        // resample, and the ground line is the half that has to be exact.
        expect(Math.abs(bounds.top - adultBounds.top), `${label} stands at a different height`)
          .toBeLessThanOrEqual(1);
        expect(bounds.bottom, `${label} floats off the ground line`).toBe(stage.height - 1);
        // Half a pixel, because a centre is a mean of two integer edges and an
        // odd span has no whole-pixel middle.
        expect(
          Math.abs(bounds.centre - adultBounds.centre),
          `${label} stands off the centre line`,
        ).toBeLessThanOrEqual(0.5);
      }
    }
  });

  // Issue #33. A crest mask belongs to exactly one drawing, so the registries
  // have to move together: the expected path is rebuilt from the art registry
  // rather than restated, which is what makes "every render has a mask" true by
  // construction instead of by review.
  it('registers a crest mask beside every render the two components can draw', () => {
    const registrySource = readFileSync(REGISTRY_PATH, 'utf8');
    const stageArt = collectRequirePaths(registrySource, 'KAIRO_STAGE_ASSETS');
    const stageCrests = collectRequirePaths(registrySource, 'KAIRO_STAGE_CRESTS');
    expect([...stageCrests.keys()].sort()).toEqual([...stageArt.keys()].sort());
    for (const [cell, artPath] of stageArt) {
      expect(stageCrests.get(cell), cell).toBe(crestPathFor(artPath));
    }

    for (const [artExport, crestExport] of [
      ['KAIRO_POSE_ASSETS', 'KAIRO_POSE_CRESTS'],
      ['KAIRO_STATE_ASSETS', 'KAIRO_STATE_CRESTS'],
    ] as const) {
      const art = collectRequirePaths(registrySource, artExport);
      const crests = collectRequirePaths(registrySource, crestExport);
      expect([...crests.keys()].sort(), crestExport).toEqual([...art.keys()].sort());
      for (const [cell, artPath] of art) {
        expect(crests.get(cell), `${crestExport}.${cell}`).toBe(crestPathFor(artPath));
      }
    }

    expect(registrySource).toContain(`require('${crestPathFor('../../../assets/character/base/kairo_base_front_v1.png')}')`);
  });

  // A mask paints the crest and nothing else, so the two properties that make
  // it a mask rather than a second drawing are worth pinning: it covers the top
  // of the head only, and it never reaches a pixel the bird does not occupy —
  // otherwise the tint would paint the sky behind it.
  it('keeps every crest mask on the bird and on the top of its head', () => {
    for (const [relativePath, artPath] of CREST_MASK_PAIRS) {
      const mask = decodePng(relativePath);
      const art = decodePng(artPath);
      expect([mask.width, mask.height], relativePath).toEqual([570, 636]);

      let painted = 0;
      let lowest = 0;
      for (let y = 0; y < mask.height; y += 1) {
        for (let x = 0; x < mask.width; x += 1) {
          const offset = pixelOffset(mask.width, x, y);
          const alpha = channel(mask.data, offset + 3);
          if (alpha === 0) continue;
          painted += 1;
          lowest = y;
          expect(
            channel(art.data, offset + 3),
            `${relativePath} paints ${x},${y}, where the bird is not`,
          ).toBeGreaterThan(0);
        }
      }

      expect(painted, relativePath).toBeGreaterThan(1_000);
      // The head, not the body: the crest fades out well above halfway down a
      // canvas whose bottom edge is the feet.
      expect(lowest, relativePath).toBeLessThan(mask.height * 0.4);
    }
  });

  // The fourth copy of the render list, and the one nothing else watches: the
  // registries are held to each other by the guard above and `REQUIRED_PNG` by
  // the file checks below, but the generator's own list is a Python literal no
  // TypeScript sees. A render added there and forgotten here — or here and
  // forgotten there — is a bird whose crest cannot be tinted, and issue #31
  // touches every one of the four.
  // The **fifth** copy of the vocabulary, and the second one no compiler sees.
  // `generate_stage_art.py` builds every output filename out of its own
  // `STAGES` and `POSES` tuples, so a stage renamed in `GROWTH_STAGE_NAMES` and
  // not there writes nine files the registry does not name — and the previous
  // nine stay on disk, so every other guard here passes and the art silently
  // stops being regenerable. Same arrangement, same reason, as the `SOURCES`
  // scan below.
  it('generates stage art for exactly the stages and poses the contract declares', () => {
    const script = readFileSync(resolve(REPO_ROOT, 'scripts/generate_stage_art.py'), 'utf8');
    const tuple = (name: string) =>
      script
        .slice(script.indexOf(`${name} = (`), script.indexOf(')', script.indexOf(`${name} = (`)))
        .match(/"([^"]+)"/g)
        ?.map((quoted) => quoted.slice(1, -1));

    expect(tuple('POSES')?.sort()).toEqual([...STAGE_POSES].sort());
    expect(tuple('STAGES')?.sort()).toEqual(PRE_ADULT_STAGE_NAMES.map(([, name]) => name).sort());
  });

  it('generates a mask for exactly the renders that need one', () => {
    const script = readFileSync(resolve(REPO_ROOT, 'scripts/generate_crest_masks.py'), 'utf8');
    const sources = script
      .slice(script.indexOf('SOURCES = ['), script.indexOf(']', script.indexOf('SOURCES = [')))
      .match(/"([^"]+\.png)"/g)
      ?.map((quoted) => `assets/character/${quoted.slice(1, -1)}`);

    expect(sources?.sort()).toEqual(CREST_MASK_PAIRS.map(([, art]) => art).sort());
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
      export const KAIRO_STAGE_ASSETS = 3;
      export const KAIRO_STATE_ASSETS = 4;
      export const KAIRO_BASE_CREST = 5;
      export const KAIRO_POSE_CRESTS = 6;
      export const KAIRO_STAGE_CRESTS = 7;
      export const KAIRO_STATE_CRESTS = 8;
      export const KAIRO_COSMETIC_ASSETS = 9;
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
    expect(REQUIRED_PNG).toHaveLength(31);

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

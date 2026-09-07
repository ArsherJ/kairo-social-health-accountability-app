import { evolutionStageForLevel, type EvolutionStage } from '@kairo/core';

import cosmetics from '../../../data/cosmetics.json';
import {
  GROWTH_STAGES,
  KAIRO_POSES,
  SLEEP_STATES,
  STAGE_POSES,
  type CosmeticId,
} from './character-contract.ts';

/**
 * Ordered inventory for the development-only static PNG catalog.
 *
 * Pose and state IDs stay attached to the canonical contract, while cosmetic
 * IDs retain the reviewed order in the semantic manifest. This module is pure
 * so contract tests can verify catalog coverage without loading Metro assets.
 */
export const KAIRO_STATIC_CATALOG = {
  base: ['base'],
  poses: KAIRO_POSES,
  // The lab is the only screen where all four stages are reachable at once,
  // since a player has exactly one. Both lists come from the contract rather
  // than being restated here.
  stages: GROWTH_STAGES,
  stagePoses: STAGE_POSES,
  states: SLEEP_STATES,
  cosmetics: cosmetics.items.map((item) => item.id as CosmeticId),
} as const;

/** The manifest has component anchors, not a separate component identity schema. */
export function cosmeticAnchorMetadata({
  anchor,
  components,
}: {
  anchor: string;
  components: readonly { anchor: string }[];
}) {
  const componentAnchors = components.map((component) => component.anchor).join(', ');
  return `Primary anchor: ${anchor}\nComponent anchors (${components.length}): ${componentAnchors}`;
}

/**
 * The lowest level in a growth stage, **derived from the band function** rather
 * than written out. The thresholds are 6, 11 and 21 and they live in
 * `evolutionStageForLevel`; a second copy of them on the surface that exists to
 * check the first is the parallel table this codebase keeps deleting.
 *
 * Here rather than in `KairoLab.tsx` because it is a decision, and a decision in
 * a `.tsx` is untestable — the root Vitest include pattern is `src/**\/*.test.ts`
 * and nothing under test may pull in React Native. It is not in `@kairo/core`
 * either: the keystone is scoring, days and progression, and no product path
 * asks this question. Only the lab does.
 *
 * **The scan is bounded and throws rather than guessing.** `evolutionStageForLevel`
 * is total and its top band opens at 21, so every stage is found inside the
 * limit; an unbounded loop on a render thread is what `pickQuests` already
 * forbids, and a silent fallback would answer "level 1" for a stage that has no
 * level, which is a wrong number rather than a visible failure.
 */
const STAGE_SCAN_LIMIT = 99;

export function firstLevelOfStage(stage: EvolutionStage): number {
  for (let level = 1; level <= STAGE_SCAN_LIMIT; level += 1) {
    if (evolutionStageForLevel(level) === stage) return level;
  }
  throw new Error(`No level below ${STAGE_SCAN_LIMIT} maps to growth stage ${stage}`);
}

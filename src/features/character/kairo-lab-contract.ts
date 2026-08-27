import cosmetics from '../../../data/cosmetics.json';
import { KAIRO_POSES, SLEEP_STATES, type CosmeticId } from './character-contract.ts';

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
  states: SLEEP_STATES,
  cosmetics: cosmetics.items.map((item) => item.id as CosmeticId),
} as const;

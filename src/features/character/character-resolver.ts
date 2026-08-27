import { mindTierFor, ratingForStatPoints } from '@kairo/core';
import cosmeticsCatalog from '../../../data/cosmetics.json';
import {
  COSMETIC_SLOTS,
  KAIRO_POSES,
  KAIRO_REACTIONS,
  type CosmeticId,
  type CosmeticSlot,
  type KairoSelection,
  type KairoPose,
  type SleepState,
  type StrengthTier,
} from './character-contract.ts';

type CosmeticInput =
  | Record<string, unknown>
  | readonly { id?: unknown; slot?: unknown }[]
  | null
  | undefined;

export interface KairoResolverInput {
  sleepMinutes?: unknown;
  strengthPoints?: unknown;
  /** Alias for callers whose product data names the rollup explicitly. */
  lifetimeStrengthPoints?: unknown;
  /** Accepts either the STR total or a stat-total record from a profile. */
  lifetimePoints?: unknown;
  pose?: unknown;
  cosmetics?: CosmeticInput;
  reaction?: unknown;
}

const catalogSlotById = new Map<string, CosmeticSlot>(
  (cosmeticsCatalog.items as readonly { id: string; slot: string }[]).flatMap((item) => {
    if (!isCosmeticSlot(item.slot)) return [];
    return [[item.id, item.slot]] as const;
  }),
);

function isCosmeticSlot(value: unknown): value is CosmeticSlot {
  return typeof value === 'string' && (COSMETIC_SLOTS as readonly string[]).includes(value);
}

function isKairoPose(value: unknown): value is KairoPose {
  return typeof value === 'string' && (KAIRO_POSES as readonly string[]).includes(value);
}

function isReaction(value: unknown): value is KairoSelection['reaction'] {
  if (value === null || typeof value !== 'object') return false;
  const reaction = value as { id?: unknown; occurrence?: unknown };
  return (
    typeof reaction.id === 'string' &&
    (KAIRO_REACTIONS as readonly string[]).includes(reaction.id) &&
    typeof reaction.occurrence === 'string'
  );
}

function diagnostic(message: string): void {
  // `NODE_ENV` is replaced by the Expo production build, keeping diagnostics
  // out of shipped bundles while preserving useful feedback during development.
  if (process.env.NODE_ENV !== 'production') console.warn(`[character] ${message}`);
}

/** Maps scored sleep minutes through the shared Mind tier engine. */
export function sleepStateFor(minutes: number | null | undefined): SleepState {
  if (minutes == null) return 'normal';
  const tier = mindTierFor(minutes);
  if (tier === 'gold') return 'well_rested';
  if (tier === 'silver') return 'normal';
  return 'sleepy';
}

/** Maps lifetime STR points through the shared stat-rating progression curve. */
export function strengthTierFor(points: number | null | undefined): StrengthTier {
  if (points == null) return 'fit';
  const rating = ratingForStatPoints(points);
  if (rating <= 5) return 'slim';
  if (rating <= 20) return 'fit';
  return 'strong';
}

/** Creates a stable one-shot occurrence only when an observed level increases. */
export function reactionForLevelChange(
  previous: number | null,
  current: number | null,
): KairoSelection['reaction'] {
  if (previous == null || current == null || current <= previous) return undefined;
  return { id: 'level_up', occurrence: `level:${previous}->${current}` };
}

function cosmeticCandidates(input: CosmeticInput): readonly { id: unknown; slot: unknown }[] {
  if (Array.isArray(input)) return input;
  if (input == null || typeof input !== 'object') return [];
  return Object.entries(input).map(([slot, id]) => ({ slot, id }));
}

/**
 * Keeps only checked-in cosmetics whose catalog slot matches the selected slot.
 * Invalid product values are dropped and reported during development.
 */
export function sanitizeCosmetics(input: CosmeticInput): Partial<Record<CosmeticSlot, CosmeticId>> {
  const sanitized: Partial<Record<CosmeticSlot, CosmeticId>> = {};

  for (const candidate of cosmeticCandidates(input)) {
    const slot = candidate.slot;
    const id = candidate.id;
    if (!isCosmeticSlot(slot)) {
      diagnostic(`dropped cosmetic with invalid slot ${String(slot)}`);
      continue;
    }
    if (id === 'none') continue;
    if (typeof id !== 'string' || !catalogSlotById.has(id)) {
      diagnostic(`dropped unknown cosmetic ${String(id)} in ${slot}`);
      continue;
    }
    if (catalogSlotById.get(id) !== slot) {
      diagnostic(`dropped cosmetic ${id}: catalog slot ${catalogSlotById.get(id)} does not match ${slot}`);
      continue;
    }
    if (sanitized[slot] !== undefined) {
      diagnostic(`dropped duplicate cosmetic in ${slot}`);
      continue;
    }
    sanitized[slot] = id as CosmeticId;
  }

  return sanitized;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function strengthPointsFrom(input: KairoResolverInput): number | undefined {
  const direct = finiteNumber(input.strengthPoints);
  if (direct !== undefined) return direct;
  const lifetime = finiteNumber(input.lifetimeStrengthPoints);
  if (lifetime !== undefined) return lifetime;
  if (input.lifetimePoints !== null && typeof input.lifetimePoints === 'object') {
    const points = (input.lifetimePoints as Record<string, unknown>).STR;
    return finiteNumber(points);
  }
  return finiteNumber(input.lifetimePoints);
}

/** Resolves product/query values into a safe, render-ready semantic selection. */
export function resolveKairoSelection(input: KairoResolverInput | null = {}): KairoSelection {
  const source = input ?? {};
  const sleepMinutes = finiteNumber(source.sleepMinutes);
  const strengthPoints = strengthPointsFrom(source);

  return {
    sleepState: sleepMinutes === undefined ? 'normal' : sleepStateFor(sleepMinutes),
    strengthTier: strengthPoints === undefined ? 'fit' : strengthTierFor(strengthPoints),
    pose: isKairoPose(source.pose) ? source.pose : 'idle',
    cosmetics: sanitizeCosmetics(source.cosmetics),
    ...(isReaction(source.reaction) ? { reaction: source.reaction } : {}),
  };
}

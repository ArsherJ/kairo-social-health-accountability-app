import { mindTierFor, ratingForStatPoints } from '@kairo/core';
import {
  KAIRO_POSES,
  KAIRO_REACTIONS,
  type KairoSelection,
  type KairoPose,
  type SleepState,
  type StrengthTier,
} from './character-contract.ts';

export interface KairoResolverInput {
  sleepMinutes?: unknown;
  strengthPoints?: unknown;
  /** Alias for callers whose product data names the rollup explicitly. */
  lifetimeStrengthPoints?: unknown;
  /** Accepts either the STR total or a stat-total record from a profile. */
  lifetimePoints?: unknown;
  pose?: unknown;
  reaction?: unknown;
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
    ...(isReaction(source.reaction) ? { reaction: source.reaction } : {}),
  };
}

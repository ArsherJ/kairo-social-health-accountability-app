import { createMMKV } from 'react-native-mmkv';
import type { Milestone } from './milestones.ts';

/** Every milestone this store knows about — the enumeration `clearMilestones`
 * needs, since MMKV has no prefix-delete. Kept beside `Milestone` itself
 * rather than derived, because there is no runtime list to derive it from —
 * `Milestone` is a type, not a value. */
const ALL_MILESTONES: readonly Milestone[] = [
  'first_sync_seen',
  'first_score_seen',
  'disclosure_unlocked',
];

/**
 * Which once-ever events this account has already recorded.
 *
 * MMKV rather than module state: `useAppOpenTelemetry`'s marker is per-session
 * on purpose, and reusing that shape here would re-fire `first_sync_seen` on
 * every cold start — turning the single most important activation event into a
 * launch counter.
 *
 * Its own storage id rather than sharing `kairo.health`: clearing sync state
 * must not reset the funnel, and the two have different lifetimes.
 */
const storage = createMMKV({ id: 'kairo.telemetry' });

/** Keyed per user, so signing in as someone else starts their funnel fresh. */
function key(userId: string, milestone: Milestone): string {
  return `milestone.v1.${userId}.${milestone}`;
}

export function hasReached(userId: string, milestone: Milestone): boolean {
  return storage.getBoolean(key(userId, milestone)) === true;
}

export function markReached(userId: string, milestone: Milestone): void {
  storage.set(key(userId, milestone), true);
}

/**
 * Release a claim made by `markReached`.
 *
 * Exists for a caller that claims a milestone *before* confirming the write
 * that justifies it landed (the same race `useAppOpenTelemetry` guards
 * against), and needs to undo the claim when it did not. Guard this at the
 * call site, the same as every other call here — this file adds no error
 * handling of its own.
 */
export function markUnreached(userId: string, milestone: Milestone): void {
  storage.remove(key(userId, milestone));
}

/**
 * Clear every milestone marker for one account, so the next account to sign
 * in on this device starts its funnel fresh rather than inheriting whichever
 * once-ever events the previous account already reached.
 *
 * MMKV has no prefix-delete, so this removes the known `Milestone` keys by
 * name rather than enumerating storage — the same shape `clearSyncState`
 * already uses for `kairo.health`. Called from `signOut()`.
 */
export function clearMilestones(userId: string): void {
  for (const milestone of ALL_MILESTONES) {
    storage.remove(key(userId, milestone));
  }
}

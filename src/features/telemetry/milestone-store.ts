import { createMMKV } from 'react-native-mmkv';
import type { Milestone } from './milestones.ts';

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

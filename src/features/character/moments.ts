import { createMMKV } from 'react-native-mmkv';
import type { LivingReaction, ReactionKind } from './living-mirror.ts';
import { REACTION_KINDS } from './living-reaction.ts';

/**
 * One-shot UI moments, remembered across launches.
 *
 * Separate MMKV instance from `kairo.health`: that one is sync machinery keyed
 * to dirty dates and is cleared on sign-out, and a celebration that reappeared
 * every time someone signed back in would stop being a moment.
 *
 * Keyed per user for the same reason the sync state is — a second account on
 * the same device deserves its own openings.
 *
 * **This is a fixed-size store, not a ledger.** Five keys plus one observed
 * level per account, each holding the *last* occurrence id shown for that kind.
 * An append-only list of every occurrence ever shown would grow without bound
 * and could not be enumerated (MMKV has no prefix-delete) — the same argument
 * `daily-marker.ts` makes for holding one date per marker rather than one key
 * per day. Nothing needs pruning because occurrence ids are date-keyed:
 * yesterday's stored id simply fails to match today's candidate.
 */
const storage = createMMKV({ id: 'kairo.moments' });

function reactionKey(userId: string, kind: ReactionKind): string {
  return `reaction.v1.${userId}.${kind}`;
}

function levelKey(userId: string): string {
  return `observed-level.v1.${userId}`;
}

export function readSeenReactions(userId: string): Partial<Record<ReactionKind, string>> {
  return Object.fromEntries(REACTION_KINDS.flatMap((kind) => {
    const value = storage.getString(reactionKey(userId, kind));
    return value === undefined ? [] : [[kind, value]];
  }));
}

export function markReactionsSeen(userId: string, reactions: readonly LivingReaction[]): void {
  for (const reaction of reactions) storage.set(reactionKey(userId, reaction.kind), reaction.occurrence);
}

/**
 * The level this device last saw for the account.
 *
 * `null` on a first observation, which is what stops a brand-new install
 * celebrating the level it already had — see `reactionCandidates`.
 */
export function readObservedLevel(userId: string): number | null {
  return storage.getNumber(levelKey(userId)) ?? null;
}

export function writeObservedLevel(userId: string, level: number): void {
  storage.set(levelKey(userId), level);
}

/**
 * The retired first-sync callout's marker. Its sole consumer is
 * `FirstSyncCallout.tsx`, which deviation #59 deletes; these two go with it in
 * the same change. Not to be confused with `useHealthSync.ts`'s private
 * `markFirstSyncSeen`, which is the once-ever *telemetry* milestone and stays.
 */
function firstSyncKey(userId: string): string {
  return `first-sync-seen.v1.${userId}`;
}

export function hasSeenFirstSync(userId: string): boolean {
  return storage.getBoolean(firstSyncKey(userId)) === true;
}

export function markFirstSyncSeen(userId: string): void {
  storage.set(firstSyncKey(userId), true);
}

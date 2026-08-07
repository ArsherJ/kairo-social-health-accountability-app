import { createMMKV } from 'react-native-mmkv';

/**
 * One-shot UI moments, remembered across launches.
 *
 * Separate MMKV instance from `kairo.health`: that one is sync machinery keyed
 * to dirty dates and is cleared on sign-out, and a first-sync callout that
 * reappeared every time someone signed back in would stop being a moment.
 *
 * Keyed per user for the same reason the sync state is — a second account on
 * the same device deserves its own first sync.
 */
const storage = createMMKV({ id: 'kairo.moments' });

function firstSyncKey(userId: string): string {
  return `first-sync-seen.v1.${userId}`;
}

export function hasSeenFirstSync(userId: string): boolean {
  return storage.getBoolean(firstSyncKey(userId)) === true;
}

export function markFirstSyncSeen(userId: string): void {
  storage.set(firstSyncKey(userId), true);
}

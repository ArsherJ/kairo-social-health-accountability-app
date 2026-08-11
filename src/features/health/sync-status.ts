/**
 * How fresh the numbers on screen are, and what to say about it.
 *
 * This exists because of the 9-11 Aug outage: `sync-health` 500'd on every
 * call for two days while the bucket upsert kept committing, so the character
 * screen showed real, rising step counts against a score of zero and said
 * nothing. `SyncState` already recorded `lastError` and `lastSyncedAt` — its
 * own comment admitted "nothing renders it yet". Nothing did, so an outage that
 * touched every user was invisible to all of them.
 *
 * The rule this encodes: a figure is never shown without its provenance. If
 * Kairo cannot say when a number last came from Apple Health, it says so.
 *
 * Pure, and takes `now` as an argument like everything else in the day math —
 * so every threshold below is testable without mocking the clock.
 */

/** Beyond this, "synced" stops meaning "current" and the strip offers a retry. */
export const STALE_AFTER_MS = 60 * 60 * 1000;

export type SyncStatusKind =
  | 'syncing'
  | 'never'
  | 'fresh'
  | 'stale'
  | 'failed';

export interface SyncStatus {
  kind: SyncStatusKind;
  /** The line the user reads. */
  message: string;
  /** Label for the retry control, or null when there is nothing to retry. */
  action: string | null;
  /** Whether this state should draw the eye. */
  attention: boolean;
}

export interface SyncStatusInput {
  /** A sync is in flight right now. */
  syncing: boolean;
  /** Epoch ms of the last sync the server confirmed, or null for never. */
  lastSyncedAt: number | null;
  /** Message from the last failed attempt, cleared by any success. */
  lastError: string | null;
  now: number;
}

/**
 * Rounded down, and never "0 minutes".
 *
 * Deliberately coarse: the difference between 3 and 4 minutes changes nothing
 * anyone would do, and a ticking counter would make a healthy app look busy.
 */
export function describeAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export function syncStatus(input: SyncStatusInput): SyncStatus {
  if (input.syncing) {
    return { kind: 'syncing', message: 'Syncing…', action: null, attention: false };
  }

  const age = input.lastSyncedAt === null ? null : input.now - input.lastSyncedAt;

  // A failure outranks the age, because the age is the thing it makes
  // misleading. The copy names what is still true — the figures above are real,
  // they are just old — rather than apologising or going vague. Someone who
  // knows the numbers are stale can act; someone shown a bare error cannot tell
  // whether their day counted.
  if (input.lastError !== null) {
    return {
      kind: 'failed',
      message:
        age === null
          ? "Couldn't reach Apple Health."
          : `Couldn't sync. Showing data from ${describeAge(age)}.`,
      action: 'Try again',
      attention: true,
    };
  }

  // Not an error: a fresh install before the first sync lands, which is most of
  // the first minute of the app's life. Offering "Try again" there would invite
  // someone to retry something that never ran.
  if (age === null) {
    return {
      kind: 'never',
      message: 'Waiting for your first sync',
      action: null,
      attention: false,
    };
  }

  if (age >= STALE_AFTER_MS) {
    return {
      kind: 'stale',
      message: `Last synced ${describeAge(age)}`,
      action: 'Sync now',
      attention: true,
    };
  }

  return {
    kind: 'fresh',
    message: `Synced ${describeAge(age)}`,
    action: null,
    attention: false,
  };
}

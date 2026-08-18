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
 * **`'no-data'` was added on 2026-08-17 as a state, not as new words.** Someone
 * who declines the Health sheet saw "Couldn't reach Apple Health." — a
 * technical failure reported for an intentional choice, which is hostile. The
 * message could not simply be reworded, because 'failed' exists to catch the
 * 9-11 Aug outage class and softening its copy would blind exactly that case.
 * So a real failure still outranks everything, and 'no-data' sits below both it
 * and 'stale'.
 *
 * What it can honestly claim is narrow. HealthKit deliberately never reports
 * read-permission denial — that would leak whether a user has a given
 * condition — so the app cannot know anyone said no. It can know that syncs are
 * current, that they have been for a while, and that nothing has ever arrived.
 * That is the sentence.
 *
 * Pure, and takes `now` as an argument like everything else in the day math —
 * so every threshold below is testable without mocking the clock.
 */

/** Beyond this, "synced" stops meaning "current" and the strip offers a retry. */
export const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * How long Health may be connected and quiet before Kairo says so.
 *
 * Six hours, measured from the **first** sync this account ever completed. The
 * failure this guards against is not hypothetical: connect at 8am with 200
 * steps, nothing has scored yet, and a shorter window tells a perfectly healthy
 * user to go and fix their Settings — the same false accusation `'no-data'`
 * exists to remove, aimed the other way.
 *
 * Six rather than twenty-four: a user who genuinely declined should not spend a
 * whole day watching a screen that never fills in, and by six hours a phone
 * being carried at all has produced something.
 */
export const QUIET_GRACE_MS = 6 * 60 * 60 * 1000;

export type SyncStatusKind =
  | 'syncing'
  | 'never'
  | 'fresh'
  | 'stale'
  | 'failed'
  /** Syncing works, has for a while, and nothing has ever come back. */
  | 'no-data';

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
  /**
   * Epoch ms of the **first** sync this account ever completed, or null.
   *
   * Not `lastSyncedAt`: the question is how long Health has been connected, and
   * the last sync answers how long ago the most recent one was. Null on a state
   * stored before the field existed, which keeps `'no-data'` silent — the right
   * direction for a claim that something is wrong.
   */
  firstSyncedAt: number | null;
  /**
   * Whether any sync has ever returned a day with data.
   *
   * This is what separates "connected, the phone is just quiet" from "the
   * permission was declined" — which HealthKit deliberately will not tell us,
   * since revealing read authorization would leak whether a user has a given
   * condition. The app cannot know the user said no; it can know nothing has
   * arrived, and that is the honest thing to say.
   */
  everReceivedData: boolean;
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

  // Above 'no-data' on purpose. A stale sync is the nearer problem, it has a
  // retry, and claiming nothing is arriving while syncs are an hour behind
  // would describe a symptom of the staleness as though it were a second fault.
  if (age >= STALE_AFTER_MS) {
    return {
      kind: 'stale',
      message: `Last synced ${describeAge(age)}`,
      action: 'Sync now',
      attention: true,
    };
  }

  // Everything above has passed: syncs are current, none is failing, and one
  // landed. So the only remaining explanation for an empty app is that Apple
  // Health has nothing to give it — which, after the grace window, is worth
  // saying out loud.
  //
  // The window is measured from the first sync rather than the last, and a
  // missing anchor means the window never elapses. Both keep this off the
  // screen of the one user it would be wrong about: someone who connected an
  // hour ago and has simply not walked yet.
  if (
    !input.everReceivedData &&
    input.firstSyncedAt !== null &&
    input.now - input.firstSyncedAt >= QUIET_GRACE_MS
  ) {
    return {
      kind: 'no-data',
      // No verdict on why. "Isn't sending anything yet" is the whole of what
      // is knowable — HealthKit will not say whether permission was refused,
      // and "yet" is what keeps this a status rather than a dead end.
      message: "Apple Health isn't sending anything yet.",
      // Settings, not a retry: there is nothing to retry. Every sync in the
      // window already succeeded.
      action: 'Open Settings',
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

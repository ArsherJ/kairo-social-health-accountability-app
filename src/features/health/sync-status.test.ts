import { describe, expect, it } from 'vitest';
import {
  describeAge,
  QUIET_GRACE_MS,
  STALE_AFTER_MS,
  syncStatus,
} from './sync-status.ts';

const NOW = Date.parse('2026-08-11T12:00:00Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function status(overrides: Partial<Parameters<typeof syncStatus>[0]> = {}) {
  return syncStatus({
    syncing: false,
    lastSyncedAt: NOW - MINUTE,
    lastError: null,
    now: NOW,
    // The two 'no-data' inputs default to a healthy account with data, so every
    // assertion written before that state existed still describes what it
    // describes. Only the cases below override them.
    everReceivedData: true,
    firstSyncedAt: NOW - MINUTE,
    ...overrides,
  });
}

describe('describeAge', () => {
  it('never says zero', () => {
    expect(describeAge(0)).toBe('just now');
    expect(describeAge(59_000)).toBe('just now');
  });

  it('singularises', () => {
    expect(describeAge(MINUTE)).toBe('1 minute ago');
    expect(describeAge(HOUR)).toBe('1 hour ago');
    expect(describeAge(24 * HOUR)).toBe('1 day ago');
  });

  it('steps up through the units', () => {
    expect(describeAge(45 * MINUTE)).toBe('45 minutes ago');
    expect(describeAge(3 * HOUR)).toBe('3 hours ago');
    expect(describeAge(50 * HOUR)).toBe('2 days ago');
  });
});

describe('syncStatus', () => {
  it('is quiet when a sync landed recently', () => {
    const s = status();
    expect(s.kind).toBe('fresh');
    expect(s.attention).toBe(false);
    expect(s.action).toBeNull();
  });

  it('reports an in-flight sync without offering a retry', () => {
    expect(status({ syncing: true })).toMatchObject({
      kind: 'syncing',
      action: null,
    });
  });

  it('asks for attention once the data is an hour old', () => {
    const s = status({ lastSyncedAt: NOW - STALE_AFTER_MS });
    expect(s.kind).toBe('stale');
    expect(s.attention).toBe(true);
    expect(s.action).toBe('Sync now');
  });

  it('stays fresh just under the threshold', () => {
    expect(status({ lastSyncedAt: NOW - STALE_AFTER_MS + 1 }).kind).toBe('fresh');
  });

  it('does not offer a retry before the first sync has ever run', () => {
    const s = status({ lastSyncedAt: null });
    expect(s.kind).toBe('never');
    expect(s.action).toBeNull();
    expect(s.attention).toBe(false);
  });

  describe('failure', () => {
    it('outranks a fresh timestamp', () => {
      // The 9-11 Aug shape: syncs were running and failing, so the last
      // *success* could still look recent while nothing was landing.
      const s = status({ lastSyncedAt: NOW - MINUTE, lastError: 'boom' });
      expect(s.kind).toBe('failed');
      expect(s.attention).toBe(true);
      expect(s.action).toBe('Try again');
    });

    it('says how old the figures on screen are, not just that it broke', () => {
      const s = status({ lastSyncedAt: NOW - 3 * HOUR, lastError: 'boom' });
      expect(s.message).toBe("Couldn't sync. Showing data from 3 hours ago.");
    });

    it('does not invent an age when nothing has ever synced', () => {
      const s = status({ lastSyncedAt: null, lastError: 'boom' });
      expect(s.message).toBe("Couldn't reach Apple Health.");
      expect(s.action).toBe('Try again');
    });

    it('never apologises or blames the user', () => {
      const messages = [
        status({ lastError: 'boom' }).message,
        status({ lastSyncedAt: null, lastError: 'boom' }).message,
      ];
      for (const message of messages) {
        expect(message).not.toMatch(/sorry|oops|please|you /i);
      }
    });
  });

  describe('no-data', () => {
    /** Long enough after the first sync that the grace window has elapsed. */
    const quiet = { everReceivedData: false, firstSyncedAt: NOW - 12 * HOUR };

    it('names the state when syncing works but nothing has ever arrived', () => {
      const s = status(quiet);

      expect(s.kind).toBe('no-data');
      expect(s.message).toBe("Apple Health isn't sending anything yet.");
      expect(s.action).toBe('Open Settings');
      expect(s.attention).toBe(true);
    });

    // The 9-11 Aug outage is why 'failed' exists: buckets kept committing while
    // scoring was down and the app said nothing. An error must still outrank a
    // quiet phone, or this new state would blind the case the module was built
    // for.
    it('does not shadow a real failure', () => {
      expect(status({ ...quiet, lastError: 'boom' }).kind).toBe('failed');
    });

    it('is fresh once data has arrived', () => {
      expect(status({ ...quiet, everReceivedData: true }).kind).toBe('fresh');
    });

    // A first sync that has not landed yet is 'never', not 'no-data' — offering
    // Settings to someone whose first sync is still in flight sends them to fix
    // something that is not broken.
    it('stays never before the first sync lands', () => {
      expect(status({ ...quiet, lastSyncedAt: null, firstSyncedAt: null }).kind).toBe(
        'never',
      );
    });

    // The whole reason for the grace window. Connect at 8am with 200 steps and
    // nothing has scored yet — that is a healthy morning, not a broken install,
    // and "Open Settings" would be the same false accusation this state exists
    // to remove, pointed at the opposite user.
    it('says nothing during the grace window after the first sync', () => {
      const s = status({ everReceivedData: false, firstSyncedAt: NOW - MINUTE });

      expect(s.kind).toBe('fresh');
    });

    it('waits the full grace window, to the millisecond', () => {
      const justInside = status({
        everReceivedData: false,
        firstSyncedAt: NOW - QUIET_GRACE_MS + 1,
      });
      const justOutside = status({
        everReceivedData: false,
        firstSyncedAt: NOW - QUIET_GRACE_MS,
      });

      expect(justInside.kind).toBe('fresh');
      expect(justOutside.kind).toBe('no-data');
    });

    // Never fires without an anchor. A state stored before `firstSyncedAt`
    // existed reads null, and guessing "long enough ago" from lastSyncedAt
    // would accuse an upgrading user on their first launch.
    it('never fires without a first-sync anchor', () => {
      expect(status({ everReceivedData: false, firstSyncedAt: null }).kind).toBe(
        'fresh',
      );
    });

    // A stale sync is the nearer, fixable problem and it has a retry. Claiming
    // nothing is arriving while syncs are an hour behind would be describing a
    // symptom of the staleness as if it were a separate fault.
    it('yields to a stale sync', () => {
      const s = status({
        ...quiet,
        lastSyncedAt: NOW - STALE_AFTER_MS,
      });

      expect(s.kind).toBe('stale');
    });

    it('never apologises or blames the user either', () => {
      expect(status(quiet).message).not.toMatch(/sorry|oops|please|you /i);
    });
  });
});

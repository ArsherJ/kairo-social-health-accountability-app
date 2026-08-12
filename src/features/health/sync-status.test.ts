import { describe, expect, it } from 'vitest';
import { describeAge, STALE_AFTER_MS, syncStatus } from './sync-status.ts';

const NOW = Date.parse('2026-08-11T12:00:00Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function status(overrides: Partial<Parameters<typeof syncStatus>[0]> = {}) {
  return syncStatus({
    syncing: false,
    lastSyncedAt: NOW - MINUTE,
    lastError: null,
    now: NOW,
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
});

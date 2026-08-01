import { describe, expect, it } from 'vitest';
import {
  MAX_DIRTY_DATES,
  initialSyncState,
  markDirty,
  markFailed,
  markSynced,
  type SyncState,
} from './sync-state.ts';

/** A run of consecutive local dates starting at 2026-08-01. */
function dateRun(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(2026, 7, 1 + i));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

describe('initialSyncState', () => {
  it('is empty and records no sync', () => {
    expect(initialSyncState).toEqual({
      dirtyDates: [],
      lastSyncedAt: null,
      lastError: null,
      lastErrorAt: null,
    });
  });
});

describe('markDirty', () => {
  it('adds dates to an empty state', () => {
    expect(markDirty(initialSyncState, ['2026-08-01']).dirtyDates).toEqual([
      '2026-08-01',
    ]);
  });

  it('dedupes against dates already dirty', () => {
    const once = markDirty(initialSyncState, ['2026-08-01']);
    expect(markDirty(once, ['2026-08-01']).dirtyDates).toEqual(['2026-08-01']);
  });

  it('dedupes within a single call', () => {
    expect(
      markDirty(initialSyncState, ['2026-08-02', '2026-08-02']).dirtyDates,
    ).toEqual(['2026-08-02']);
  });

  it('keeps dates sorted ascending regardless of insertion order', () => {
    const state = markDirty(initialSyncState, ['2026-08-03', '2026-08-01']);
    expect(markDirty(state, ['2026-08-02']).dirtyDates).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ]);
  });

  it('drops the oldest dates once the cap is exceeded', () => {
    const dates = dateRun(MAX_DIRTY_DATES + 3);
    const state = markDirty(initialSyncState, dates);

    expect(state.dirtyDates).toHaveLength(MAX_DIRTY_DATES);
    // The newest are what a user can still influence; the oldest are already
    // finalized and beyond the §19 backfill window's usefulness.
    expect(state.dirtyDates).toEqual(dates.slice(3));
  });

  it('does not mutate the state it is given', () => {
    const before: SyncState = { ...initialSyncState };
    markDirty(before, ['2026-08-01']);
    expect(before.dirtyDates).toEqual([]);
  });

  it('adding nothing leaves the state untouched', () => {
    const state = markDirty(initialSyncState, ['2026-08-01']);
    expect(markDirty(state, []).dirtyDates).toEqual(['2026-08-01']);
  });
});

describe('markSynced', () => {
  it('clears the dates the server confirmed', () => {
    const state = markDirty(initialSyncState, ['2026-08-01', '2026-08-02']);
    expect(markSynced(state, ['2026-08-01'], 1000).dirtyDates).toEqual([
      '2026-08-02',
    ]);
  });

  it('leaves unconfirmed dates dirty', () => {
    // A partial success must not look like a full one, or the unsent days are
    // silently dropped and never retried.
    const state = markDirty(initialSyncState, dateRun(3));
    const next = markSynced(state, ['2026-08-01'], 1000);
    expect(next.dirtyDates).toEqual(['2026-08-02', '2026-08-03']);
  });

  it('records when the sync happened', () => {
    expect(markSynced(initialSyncState, [], 1000).lastSyncedAt).toBe(1000);
  });

  it('clears a previous error', () => {
    const failed = markFailed(initialSyncState, 500, 'offline');
    const next = markSynced(failed, [], 1000);
    expect(next.lastError).toBeNull();
    expect(next.lastErrorAt).toBeNull();
  });

  it('ignores dates that were not dirty', () => {
    const state = markDirty(initialSyncState, ['2026-08-01']);
    expect(markSynced(state, ['2026-07-01'], 1000).dirtyDates).toEqual([
      '2026-08-01',
    ]);
  });
});

describe('markFailed', () => {
  it('records the message and the time', () => {
    const state = markFailed(initialSyncState, 500, 'network request failed');
    expect(state.lastError).toBe('network request failed');
    expect(state.lastErrorAt).toBe(500);
  });

  it('leaves the dirty dates alone so the next attempt retries them', () => {
    const state = markDirty(initialSyncState, ['2026-08-01']);
    expect(markFailed(state, 500, 'boom').dirtyDates).toEqual(['2026-08-01']);
  });

  it('does not touch the last successful sync time', () => {
    const synced = markSynced(initialSyncState, [], 1000);
    expect(markFailed(synced, 2000, 'boom').lastSyncedAt).toBe(1000);
  });
});

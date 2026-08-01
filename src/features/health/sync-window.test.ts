import { describe, expect, it } from 'vitest';
import { MAX_DIRTY_DATES, initialSyncState, markDirty } from './sync-state.ts';
import { resolveSyncWindow } from './sync-window.ts';

const MANILA = 'Asia/Manila';
const NEW_YORK = 'America/New_York';

/** 2026-08-01 20:00 UTC — already 2 Aug in Manila, still 1 Aug in New York. */
const NOW = new Date('2026-08-01T20:00:00.000Z');

function iso(d: Date): string {
  return d.toISOString();
}

describe('resolveSyncWindow', () => {
  it('reads today and yesterday on a fresh install', () => {
    // Yesterday rides along on every sync: nothing dirties it at the rollover,
    // and a late watch sync writes into hours that have already passed.
    const window = resolveSyncWindow(initialSyncState, NOW, MANILA);
    expect(window.dates).toEqual(['2026-08-01', '2026-08-02']);
  });

  it('resolves today in the user timezone, not UTC', () => {
    // The same instant is a different local date in each zone (§2). Getting
    // this wrong would bucket a Manila evening into the previous day.
    expect(resolveSyncWindow(initialSyncState, NOW, MANILA).dates.at(-1)).toBe(
      '2026-08-02',
    );
    expect(resolveSyncWindow(initialSyncState, NOW, NEW_YORK).dates.at(-1)).toBe(
      '2026-08-01',
    );
  });

  it('spans local midnight to local midnight', () => {
    const window = resolveSyncWindow(initialSyncState, NOW, MANILA);
    // Manila is UTC+8 year round.
    expect(iso(window.fromUtc)).toBe('2026-07-31T16:00:00.000Z');
    expect(iso(window.toUtc)).toBe('2026-08-02T16:00:00.000Z');
  });

  it('includes dirty dates alongside today, sorted ascending', () => {
    const state = markDirty(initialSyncState, ['2026-07-31', '2026-08-01']);
    expect(resolveSyncWindow(state, NOW, MANILA).dates).toEqual([
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('does not repeat a routine date that is also dirty', () => {
    const state = markDirty(initialSyncState, ['2026-08-02']);
    expect(resolveSyncWindow(state, NOW, MANILA).dates).toEqual([
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('opens the span at the earliest date and closes it after today', () => {
    const state = markDirty(initialSyncState, ['2026-07-31']);
    const window = resolveSyncWindow(state, NOW, MANILA);
    expect(iso(window.fromUtc)).toBe('2026-07-30T16:00:00.000Z');
    expect(iso(window.toUtc)).toBe('2026-08-02T16:00:00.000Z');
  });

  it('drops dirty dates older than the window rather than widening the span', () => {
    // A stuck date from months ago must not turn one sync into a half-year
    // hourly read. Its day is long final, and §19 credits a late backfill
    // without needing the score.
    const state = markDirty(initialSyncState, ['2026-01-05']);
    const window = resolveSyncWindow(state, NOW, MANILA);
    expect(window.dates).toEqual(['2026-08-01', '2026-08-02']);
    expect(iso(window.fromUtc)).toBe('2026-07-31T16:00:00.000Z');
  });

  it('keeps a dirty date exactly at the window edge', () => {
    // Today is 2026-08-02 in Manila, so the oldest readable date is
    // today - (MAX_DIRTY_DATES - 1) = 2026-07-03. Off-by-one here would either
    // drop a day the user can still influence or overflow the request cap.
    const state = markDirty(initialSyncState, ['2026-07-03']);
    expect(resolveSyncWindow(state, NOW, MANILA).dates[0]).toBe('2026-07-03');
  });

  it('never returns more dates than one request can carry', () => {
    const many: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      many.push(new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10));
    }
    const state = { ...initialSyncState, dirtyDates: many };
    const window = resolveSyncWindow(state, NOW, MANILA);

    expect(window.dates.length).toBeLessThanOrEqual(MAX_DIRTY_DATES);
    expect(window.dates.at(-1)).toBe('2026-08-02');
  });

  it('excludes dates in the future without discarding them', () => {
    // Travelling west moves the local date backwards, so a date already synced
    // as "today" can briefly sit ahead of the clock. Reading the future is
    // pointless, but the date stays queued for when the clock catches up.
    const state = markDirty(initialSyncState, ['2026-08-05']);
    const window = resolveSyncWindow(state, NOW, MANILA);

    expect(window.dates).toEqual(['2026-08-01', '2026-08-02']);
    expect(state.dirtyDates).toContain('2026-08-05');
  });

  it('spans a 25-hour day correctly across a fall-back transition', () => {
    // 2026-11-01 is when US clocks go back. The span must be 73 hours, not 72,
    // or the last hour of the window is never read.
    const now = new Date('2026-11-02T18:00:00.000Z'); // 13:00 EST, 2 Nov
    const state = markDirty(initialSyncState, ['2026-10-31']);
    const window = resolveSyncWindow(state, now, NEW_YORK);

    // 31 Oct is dirty; 1 and 2 Nov are the routine pair. The transition day
    // sits in the middle, so the span must cover its extra hour.
    expect(window.dates).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(iso(window.fromUtc)).toBe('2026-10-31T04:00:00.000Z'); // EDT, UTC-4
    expect(iso(window.toUtc)).toBe('2026-11-03T05:00:00.000Z'); // EST, UTC-5

    const hours =
      (window.toUtc.getTime() - window.fromUtc.getTime()) / 3_600_000;
    expect(hours).toBe(73);
  });

  it('does not mutate the state it is given', () => {
    const state = markDirty(initialSyncState, ['2026-01-05']);
    resolveSyncWindow(state, NOW, MANILA);
    expect(state.dirtyDates).toEqual(['2026-01-05']);
  });
});

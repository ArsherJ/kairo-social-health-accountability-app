import { describe, expect, it } from 'vitest';
import { daysInMonth, monthGrid, weekdayOf, type MonthCell } from './month-grid.ts';

const days = (g: { cells: MonthCell[] }) => g.cells.filter((c) => c.kind === 'day');

describe('weekdayOf', () => {
  it('agrees with the calendar on dates picked by hand', () => {
    // 2026-08-01 is a Saturday; 2026-08-30 is a Sunday.
    expect(weekdayOf(2026, 8, 1)).toBe(6);
    expect(weekdayOf(2026, 8, 30)).toBe(0);
    // A leap day, and the century rule either side of it.
    expect(weekdayOf(2024, 2, 29)).toBe(4);
    expect(weekdayOf(2000, 1, 1)).toBe(6);
    expect(weekdayOf(1900, 1, 1)).toBe(1);
  });

  it('agrees with the platform Date for every day of a year', () => {
    // The cross-check that makes Sakamoto trustworthy without trusting it. UTC
    // getters on a UTC-constructed date have no zone to drift against, which is
    // safe *here* and is precisely what `monthGrid` may not do — see the module
    // comment for why a local date string must never be parsed.
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= daysInMonth(2026, m); d++) {
        expect(weekdayOf(2026, m, d)).toBe(new Date(Date.UTC(2026, m - 1, d)).getUTCDay());
      }
    }
  });
});

describe('daysInMonth', () => {
  it('knows the ordinary months', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 8)).toBe(31);
  });

  it('knows the leap rule, including the century exceptions', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});

describe('monthGrid', () => {
  it('pads the start so the 1st lands on its real weekday', () => {
    // 2026-08-01 is a Saturday, so six blanks come first.
    const g = monthGrid('2026-08-29', []);
    expect(g.cells.slice(0, 6).every((c) => c.kind === 'blank')).toBe(true);
    expect(g.cells[6]).toMatchObject({ kind: 'day', day: 1 });
  });

  it('draws every day of the month and no more', () => {
    const g = monthGrid('2026-08-31', []);
    expect(g.cells.filter((c) => c.kind !== 'blank')).toHaveLength(31);
  });

  it('marks the days that cleared and counts them', () => {
    const g = monthGrid('2026-08-29', ['2026-08-02', '2026-08-03', '2026-08-29']);
    expect(g.cleared).toBe(3);
    expect(days(g).filter((c) => c.kind === 'day' && c.cleared)).toHaveLength(3);
  });

  it('ignores cleared dates from other months rather than miscounting', () => {
    // The history window is 90 days and the grid is one month, so being handed
    // extra is the normal case, not a caller error.
    const g = monthGrid('2026-08-29', ['2026-07-14', '2026-08-02', '2026-09-01']);
    expect(g.cleared).toBe(1);
  });

  it('draws days after today as future, never as missed', () => {
    // The distinction this whole module exists for. On the 3rd of the month,
    // twenty-eight grey squares reading as twenty-eight failures is worse than
    // showing no calendar at all.
    const g = monthGrid('2026-08-03', ['2026-08-01']);
    const future = g.cells.filter((c) => c.kind === 'future');
    expect(future).toHaveLength(28);
    expect(days(g)).toHaveLength(3);
    expect(g.cleared).toBe(1);
  });

  it('marks today, and only today', () => {
    const g = monthGrid('2026-08-29', []);
    const todays = g.cells.filter((c) => c.kind === 'day' && c.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0]).toMatchObject({ day: 29 });
  });

  it('handles a month that starts on a Sunday with no leading blanks', () => {
    // 2026-11-01 is a Sunday.
    const g = monthGrid('2026-11-15', []);
    expect(g.cells[0]).toMatchObject({ kind: 'day', day: 1 });
  });

  it('handles February in a leap year', () => {
    const g = monthGrid('2024-02-29', ['2024-02-29']);
    expect(g.cells.filter((c) => c.kind !== 'blank')).toHaveLength(29);
    expect(g.cleared).toBe(1);
  });

  it('is inert on a date it cannot parse rather than throwing', () => {
    // This renders a screen. A malformed date must draw nothing, never crash
    // the You tab — the same disposition `compactFigure` takes on a bad number.
    expect(monthGrid('not-a-date', [])).toEqual({ month: '', cells: [], cleared: 0 });
    expect(monthGrid('2026-13-01', [])).toEqual({ month: '', cells: [], cleared: 0 });
  });

  it('names the month it drew', () => {
    expect(monthGrid('2026-08-29', []).month).toBe('2026-08');
  });
});

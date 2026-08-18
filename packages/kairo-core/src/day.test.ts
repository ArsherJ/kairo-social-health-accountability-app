import { describe, expect, it } from 'vitest';
import {
  FINALIZATION_GRACE_MS,
  addDays,
  currentLocalDate,
  dayStartUtc,
  featuredStatFor,
  finalizesAtUtc,
  isFinalizable,
  isoWeekOf,
  localHourFor,
  localZonedTimeUtc,
  mostRecentlyCompletedLocalDate,
  previousDay,
} from './day.ts';

const MANILA = 'Asia/Manila'; // UTC+8, never DST
const DUBAI = 'Asia/Dubai'; // UTC+4, never DST
const NEW_YORK = 'America/New_York'; // DST

describe('currentLocalDate', () => {
  it('resolves the local calendar date for a zone', () => {
    // 2026-07-27T02:00Z is 10:00 on the 27th in Manila.
    const now = new Date('2026-07-27T02:00:00Z');
    expect(currentLocalDate(now, MANILA)).toBe('2026-07-27');
  });

  it('puts the same instant on different dates in different zones', () => {
    // 16:30Z = 00:30 on the 28th in Manila, but still 12:30 on the 27th in NY.
    const now = new Date('2026-07-27T16:30:00Z');
    expect(currentLocalDate(now, MANILA)).toBe('2026-07-28');
    expect(currentLocalDate(now, DUBAI)).toBe('2026-07-27');
    expect(currentLocalDate(now, NEW_YORK)).toBe('2026-07-27');
  });

  it('handles the instant one millisecond either side of local midnight', () => {
    const justBefore = new Date('2026-07-27T15:59:59.999Z'); // 23:59:59.999 PHT
    const justAfter = new Date('2026-07-27T16:00:00.000Z'); // 00:00:00.000 PHT
    expect(currentLocalDate(justBefore, MANILA)).toBe('2026-07-27');
    expect(currentLocalDate(justAfter, MANILA)).toBe('2026-07-28');
  });
});

describe('localHourFor', () => {
  it('returns the local hour used for bucketing', () => {
    expect(localHourFor(new Date('2026-07-27T02:30:00Z'), MANILA)).toBe(10);
    expect(localHourFor(new Date('2026-07-27T16:00:00Z'), MANILA)).toBe(0);
    expect(localHourFor(new Date('2026-07-27T15:00:00Z'), MANILA)).toBe(23);
  });

  it('differs by zone for the same instant', () => {
    const now = new Date('2026-07-27T12:00:00Z');
    expect(localHourFor(now, MANILA)).toBe(20);
    expect(localHourFor(now, DUBAI)).toBe(16);
    expect(localHourFor(now, NEW_YORK)).toBe(8); // EDT
  });
});

describe('dayStartUtc', () => {
  it('maps a local date to its midnight instant', () => {
    expect(dayStartUtc('2026-07-27', MANILA).toISOString()).toBe(
      '2026-07-26T16:00:00.000Z',
    );
    expect(dayStartUtc('2026-07-27', DUBAI).toISOString()).toBe(
      '2026-07-26T20:00:00.000Z',
    );
  });

  it('respects daylight saving offsets', () => {
    // EST (UTC-5) in January, EDT (UTC-4) in July.
    expect(dayStartUtc('2026-01-15', NEW_YORK).toISOString()).toBe(
      '2026-01-15T05:00:00.000Z',
    );
    expect(dayStartUtc('2026-07-15', NEW_YORK).toISOString()).toBe(
      '2026-07-15T04:00:00.000Z',
    );
  });

  it('round-trips: the start of a local day resolves back to that date', () => {
    for (const zone of [MANILA, DUBAI, NEW_YORK]) {
      for (const date of ['2026-01-01', '2026-03-08', '2026-11-01', '2026-12-31']) {
        expect(currentLocalDate(dayStartUtc(date, zone), zone)).toBe(date);
      }
    }
  });
});

describe('daylight saving transitions', () => {
  it('gives a 23-hour day when the clocks spring forward', () => {
    // US DST begins 2026-03-08.
    const start = dayStartUtc('2026-03-08', NEW_YORK).getTime();
    const end = dayStartUtc('2026-03-09', NEW_YORK).getTime();
    expect((end - start) / 3_600_000).toBe(23);
  });

  it('gives a 25-hour day when the clocks fall back', () => {
    // US DST ends 2026-11-01.
    const start = dayStartUtc('2026-11-01', NEW_YORK).getTime();
    const end = dayStartUtc('2026-11-02', NEW_YORK).getTime();
    expect((end - start) / 3_600_000).toBe(25);
  });

  it('gives a clean 24-hour day in a zone without DST', () => {
    const start = dayStartUtc('2026-03-08', MANILA).getTime();
    const end = dayStartUtc('2026-03-09', MANILA).getTime();
    expect((end - start) / 3_600_000).toBe(24);
  });
});

describe('localZonedTimeUtc', () => {
  it('resolves the 11 PM "one hour left" notification instant', () => {
    expect(localZonedTimeUtc('2026-07-27', MANILA, 23).toISOString()).toBe(
      '2026-07-27T15:00:00.000Z',
    );
  });

  it('resolves the 8 PM streak-at-risk instant per zone', () => {
    expect(localZonedTimeUtc('2026-07-27', DUBAI, 20).toISOString()).toBe(
      '2026-07-27T16:00:00.000Z',
    );
  });
});

describe('date string arithmetic', () => {
  it('advances and rewinds a day', () => {
    expect(addDays('2026-07-27', 1)).toBe('2026-07-28');
    expect(previousDay('2026-07-27')).toBe('2026-07-26');
  });

  it('crosses month boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(previousDay('2026-08-01')).toBe('2026-07-31');
  });

  it('crosses year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
  });

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01'); // not a leap year
  });

  it('walks backwards over multiple days', () => {
    expect(addDays('2026-01-03', -5)).toBe('2025-12-29');
  });
});

describe('day finalization', () => {
  it('finalizes two hours after the following local midnight', () => {
    // 2026-07-27 in Manila ends at 2026-07-27T16:00Z; +2h grace.
    expect(finalizesAtUtc('2026-07-27', MANILA).toISOString()).toBe(
      '2026-07-27T18:00:00.000Z',
    );
  });

  it('uses a two-hour grace window', () => {
    expect(FINALIZATION_GRACE_MS).toBe(2 * 60 * 60 * 1000);
  });

  it('is not finalizable at the instant the day ends', () => {
    const dayEnd = new Date('2026-07-27T16:00:00Z');
    expect(isFinalizable('2026-07-27', MANILA, dayEnd)).toBe(false);
  });

  it('is not finalizable one millisecond before the grace window closes', () => {
    const almost = new Date('2026-07-27T17:59:59.999Z');
    expect(isFinalizable('2026-07-27', MANILA, almost)).toBe(false);
  });

  it('is finalizable exactly when the grace window closes', () => {
    const exact = new Date('2026-07-27T18:00:00.000Z');
    expect(isFinalizable('2026-07-27', MANILA, exact)).toBe(true);
  });

  it('finalizes each zone on its own schedule', () => {
    // The same instant: Manila's day is done, New York is still mid-afternoon.
    const now = new Date('2026-07-27T18:00:00Z');
    expect(isFinalizable('2026-07-27', MANILA, now)).toBe(true);
    expect(isFinalizable('2026-07-27', NEW_YORK, now)).toBe(false);
  });
});

describe('mostRecentlyCompletedLocalDate', () => {
  it('returns yesterday while today is still running', () => {
    const now = new Date('2026-07-27T02:00:00Z'); // 10:00 in Manila
    expect(mostRecentlyCompletedLocalDate(now, MANILA)).toBe('2026-07-26');
  });

  it('rolls over at local midnight', () => {
    const justAfterMidnight = new Date('2026-07-27T16:00:01Z'); // 00:00:01 on the 28th
    expect(mostRecentlyCompletedLocalDate(justAfterMidnight, MANILA)).toBe(
      '2026-07-27',
    );
  });
});

describe('weekly featured stat', () => {
  it('computes ISO week numbers', () => {
    expect(isoWeekOf('2026-01-01')).toBe(1);
    expect(isoWeekOf('2026-01-05')).toBe(2); // Monday
    expect(isoWeekOf('2026-12-31')).toBe(53);
  });

  it('rotates AGI to STR to END to VIT to MND across consecutive weeks', () => {
    // Five stats now rotate (MND joined as a core stat, roadmap deviation
    // #41), so the cycle is one week longer than before.
    const mondays = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'];
    expect(mondays.map(featuredStatFor)).toEqual(['STR', 'END', 'VIT', 'MND']);
  });

  it('holds the same stat for every day of a week', () => {
    // Mon 2026-01-05 through Sun 2026-01-11.
    const week = [
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
    ];
    const stats = new Set(week.map(featuredStatFor));
    expect(stats.size).toBe(1);
  });

  it('changes on Monday, not Sunday', () => {
    expect(featuredStatFor('2026-01-11')).not.toBe(featuredStatFor('2026-01-12'));
    expect(featuredStatFor('2026-01-11')).toBe(featuredStatFor('2026-01-05'));
  });
});

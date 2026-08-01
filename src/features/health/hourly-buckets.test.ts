import { describe, expect, it } from 'vitest';
import { VIT_ACTIVE_HOUR_STEPS } from '@kairo/core';
import { toBuckets, type HourlyReading } from './hourly-buckets.ts';

const MANILA = 'Asia/Manila';
const NEW_YORK = 'America/New_York';

/**
 * Local hour H on 2026-08-01 in Manila. The day opens at 2026-07-31T16:00Z
 * (UTC+8), and Date.UTC rolls the overflow into August for us.
 */
function manilaHour(hour: number): Date {
  return new Date(Date.UTC(2026, 6, 31, 16 + hour));
}

function reading(
  metric: HourlyReading['metric'],
  startDate: Date,
  value: number,
): HourlyReading {
  return { metric, startDate, value };
}

function bucketAt(
  buckets: ReturnType<typeof toBuckets>,
  localDate: string,
  hour: number,
) {
  const found = buckets.find((b) => b.localDate === localDate && b.hour === hour);
  if (!found) throw new Error(`no bucket for ${localDate} hour ${hour}`);
  return found;
}

describe('toBuckets — shape', () => {
  it('emits every hour of every requested date, zeros included', () => {
    const buckets = toBuckets([], ['2026-08-01'], MANILA);

    expect(buckets).toHaveLength(24);
    expect(buckets[0]).toEqual({
      localDate: '2026-08-01',
      hour: 0,
      steps: 0,
      distanceM: 0,
      activeKcal: 0,
      activeMinutes: 0,
      hadWorkout: false,
      elevatedHeartRate: false,
    });
    expect(buckets.at(-1)?.hour).toBe(23);
  });

  it('emits zeros rather than omitting empty hours', () => {
    // Omitting them would leave a stale nonzero bucket on the server whenever
    // Apple revises an hour downward, and the day would score high forever.
    const buckets = toBuckets(
      [reading('steps', manilaHour(9), 500)],
      ['2026-08-01'],
      MANILA,
    );
    expect(buckets).toHaveLength(24);
    expect(bucketAt(buckets, '2026-08-01', 8).steps).toBe(0);
    expect(bucketAt(buckets, '2026-08-01', 9).steps).toBe(500);
  });

  it('sorts by date then hour', () => {
    const buckets = toBuckets([], ['2026-08-02', '2026-08-01'], MANILA);
    expect(buckets[0]).toMatchObject({ localDate: '2026-08-01', hour: 0 });
    expect(buckets[24]).toMatchObject({ localDate: '2026-08-02', hour: 0 });
  });

  it('stays inside the server request cap at the widest window', () => {
    const dates: string[] = [];
    for (let i = 0; i < 31; i += 1) {
      dates.push(new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10));
    }
    // MAX_BUCKETS_PER_SYNC is 750 on the server; 31 whole days is 744.
    expect(toBuckets([], dates, MANILA)).toHaveLength(744);
  });
});

describe('toBuckets — metrics', () => {
  it('merges the four metrics onto one bucket', () => {
    const at = manilaHour(14);
    const buckets = toBuckets(
      [
        reading('steps', at, 1200),
        reading('distanceM', at, 940.5),
        reading('activeKcal', at, 62.25),
        reading('activeMinutes', at, 18),
      ],
      ['2026-08-01'],
      MANILA,
    );

    expect(bucketAt(buckets, '2026-08-01', 14)).toMatchObject({
      steps: 1200,
      distanceM: 940.5,
      activeKcal: 62.25,
      activeMinutes: 18,
    });
  });

  it('rounds steps to whole numbers', () => {
    const buckets = toBuckets(
      [reading('steps', manilaHour(7), 302.6)],
      ['2026-08-01'],
      MANILA,
    );
    expect(bucketAt(buckets, '2026-08-01', 7).steps).toBe(303);
  });

  it('clamps active minutes to the length of an hour', () => {
    // Overlapping workout sources can sum past 60. The column has a
    // `between 0 and 60` check, so an unclamped value is a 500 on the server.
    const buckets = toBuckets(
      [reading('activeMinutes', manilaHour(7), 95)],
      ['2026-08-01'],
      MANILA,
    );
    expect(bucketAt(buckets, '2026-08-01', 7).activeMinutes).toBe(60);
  });

  it('floors negative values at zero', () => {
    const buckets = toBuckets(
      [reading('activeKcal', manilaHour(7), -5)],
      ['2026-08-01'],
      MANILA,
    );
    expect(bucketAt(buckets, '2026-08-01', 7).activeKcal).toBe(0);
  });

  it('rounds distance and calories to the stored precision', () => {
    // Both columns are numeric(10,2); sending more precision just gets rounded
    // by Postgres, so round here and keep the payload honest.
    const buckets = toBuckets(
      [reading('distanceM', manilaHour(7), 123.4567)],
      ['2026-08-01'],
      MANILA,
    );
    expect(bucketAt(buckets, '2026-08-01', 7).distanceM).toBe(123.46);
  });

  it('ORs the anti-cheat flags rather than summing them', () => {
    const at = manilaHour(6);
    const buckets = toBuckets(
      [
        reading('hadWorkout', at, 1),
        reading('hadWorkout', at, 0),
        reading('elevatedHeartRate', at, 0),
      ],
      ['2026-08-01'],
      MANILA,
    );

    expect(bucketAt(buckets, '2026-08-01', 6).hadWorkout).toBe(true);
    expect(bucketAt(buckets, '2026-08-01', 6).elevatedHeartRate).toBe(false);
  });

  it('preserves the VIT active-hour boundary exactly', () => {
    // VIT counts hours with >= 250 steps. A rounding slip here silently
    // changes a stat, so both sides of the boundary are pinned.
    const buckets = toBuckets(
      [
        reading('steps', manilaHour(10), VIT_ACTIVE_HOUR_STEPS - 1),
        reading('steps', manilaHour(11), VIT_ACTIVE_HOUR_STEPS),
      ],
      ['2026-08-01'],
      MANILA,
    );

    expect(bucketAt(buckets, '2026-08-01', 10).steps).toBe(249);
    expect(bucketAt(buckets, '2026-08-01', 11).steps).toBe(250);
  });

  it('drops readings outside the requested dates', () => {
    // The UTC span can cross days that are not dirty. Re-writing their buckets
    // would force a rescore of a day nothing changed on.
    const buckets = toBuckets(
      [
        reading('steps', manilaHour(9), 500),
        // 2026-08-02T00:00Z is 08:00 on 2 Aug in Manila — inside the read span
        // but not a requested date.
        reading('steps', new Date('2026-08-02T00:00:00.000Z'), 900),
      ],
      ['2026-08-01'],
      MANILA,
    );

    expect(bucketAt(buckets, '2026-08-01', 9).steps).toBe(500);
    expect(buckets).toHaveLength(24);
    expect(buckets.reduce((sum, b) => sum + b.steps, 0)).toBe(500);
  });
});

describe('toBuckets — DST', () => {
  it('sums the repeated hour on a fall-back day instead of overwriting it', () => {
    // 2026-11-01, New York. 05:00Z is 01:00 EDT and 06:00Z is 01:00 EST — the
    // same wall-clock hour lived twice. Both really happened, and `hour` is
    // constrained to 0-23, so they belong in one bucket.
    const buckets = toBuckets(
      [
        reading('steps', new Date('2026-11-01T05:00:00.000Z'), 300),
        reading('steps', new Date('2026-11-01T06:00:00.000Z'), 400),
      ],
      ['2026-11-01'],
      NEW_YORK,
    );

    expect(bucketAt(buckets, '2026-11-01', 1).steps).toBe(700);
    expect(buckets).toHaveLength(24);
  });

  it('leaves the skipped hour at zero on a spring-forward day', () => {
    // 2026-03-08, New York. 06:00Z is 01:00 EST; at 07:00Z the clock jumps
    // straight to 03:00 EDT, so local hour 2 never happens. It must stay zero
    // and must not shift hour 3's data down.
    const buckets = toBuckets(
      [
        reading('steps', new Date('2026-03-08T06:00:00.000Z'), 100),
        reading('steps', new Date('2026-03-08T07:00:00.000Z'), 200),
      ],
      ['2026-03-08'],
      NEW_YORK,
    );

    expect(bucketAt(buckets, '2026-03-08', 1).steps).toBe(100);
    expect(bucketAt(buckets, '2026-03-08', 2).steps).toBe(0);
    expect(bucketAt(buckets, '2026-03-08', 3).steps).toBe(200);
    expect(buckets).toHaveLength(24);
  });
});

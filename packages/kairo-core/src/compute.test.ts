import { describe, expect, it } from 'vitest';
import { computeDay } from './compute.ts';
import type { SabotageEvent } from './sabotage.ts';
import type { HourBucket } from './types.ts';

const MANILA = 'Asia/Manila';
const DAY = '2026-07-27';

/** A gym day: AGI bronze, STR gold, END silver, VIT silver, 4-stat bonus = 2,900. */
function gymDay(): HourBucket[] {
  const buckets: HourBucket[] = [];
  for (let hour = 0; hour < 6; hour++) {
    buckets.push({
      hour,
      steps: hour === 5 ? 750 : 250,
      distanceM: 0,
      activeKcal: hour === 0 ? 450 : 0,
      activeMinutes: hour === 0 ? 45 : 0,
    });
  }
  return buckets;
}

function banana(overrides: Partial<SabotageEvent> = {}): SabotageEvent {
  return {
    id: 'evt-1',
    actorId: 'rival',
    targetId: 'me',
    squadId: 'squad',
    item: 'banana',
    createdAt: '2026-07-27T10:00:00Z',
    targetLocalDate: DAY,
    ...overrides,
  };
}

describe('computeDay', () => {
  it('reports the health total and the final total separately', () => {
    const result = computeDay({
      userId: 'me',
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: gymDay(),
      sabotageEvents: [banana()],
    });

    expect(result.score.healthTotal).toBe(2_900);
    expect(result.sabotageDelta).toBe(-500);
    expect(result.total).toBe(2_400);
  });

  it('is provisional before the grace window closes', () => {
    const result = computeDay({
      userId: 'me',
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T17:00:00Z'), // 1h into the grace window
      buckets: gymDay(),
      sabotageEvents: [],
    });
    expect(result.status).toBe('provisional');
  });

  it('is final once the grace window closes', () => {
    const result = computeDay({
      userId: 'me',
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T18:00:00Z'),
      buckets: gymDay(),
      sabotageEvents: [],
    });
    expect(result.status).toBe('final');
  });

  it('scores base points with no featured stat by default (deviation #10)', () => {
    // 2026-07-27 is a Monday in ISO week 31, which the retired rotation would
    // have made an END week (31 - 1 = 30, 30 % 4 = 2 -> END). Squad programs
    // carry the meta now, at read time, so stored points must be pre-multiplier.
    const result = computeDay({
      userId: 'me',
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: gymDay(),
      sabotageEvents: [],
    });
    expect(result.score.featuredStat).toBeNull();
    expect(result.score.stats.END.base).toBe(500);
    expect(result.score.stats.END.points).toBe(500);
  });

  it('honours an explicitly supplied featured stat', () => {
    const result = computeDay({
      userId: 'me',
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: gymDay(),
      sabotageEvents: [],
      featuredStat: 'STR',
    });
    expect(result.score.featuredStat).toBe('STR');
    expect(result.score.stats.STR.points).toBe(1_350);
  });

  it('ignores sabotage aimed at other people', () => {
    const result = computeDay({
      userId: 'me',
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: gymDay(),
      sabotageEvents: [banana({ targetId: 'someone-else' })],
    });
    expect(result.sabotageDelta).toBe(0);
  });

  it('floors a sabotaged rest day at zero rather than going negative', () => {
    const result = computeDay({
      userId: 'me',
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: [],
      sabotageEvents: [banana()],
    });
    expect(result.total).toBe(0);
  });

  it('is idempotent — recomputing the same inputs gives the same result', () => {
    const input = {
      userId: 'me',
      localDate: DAY,
      timeZone: MANILA,
      now: new Date('2026-07-27T12:00:00Z'),
      buckets: gymDay(),
      sabotageEvents: [banana()],
    };
    expect(computeDay(input)).toEqual(computeDay(input));
  });
});

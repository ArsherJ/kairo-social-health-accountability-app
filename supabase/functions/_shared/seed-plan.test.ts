import { describe, expect, it } from 'vitest';
import {
  MAX_SEED_DAYS,
  PERSONAS,
  expandDateRange,
  findUnlistedUsers,
  generateDay,
  hashSeed,
  makeRng,
  type Persona,
} from './seed-plan.ts';

function totalSteps(persona: Persona, seed = 1): number {
  return generateDay(persona, seed).reduce((sum, b) => sum + b.steps, 0);
}

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('differs across seeds', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });

  it('stays within [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 500; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('hashSeed', () => {
  it('is stable for the same parts', () => {
    expect(hashSeed('user-a', '2026-07-29')).toBe(hashSeed('user-a', '2026-07-29'));
  });

  it('separates users and dates', () => {
    expect(hashSeed('user-a', '2026-07-29')).not.toBe(hashSeed('user-b', '2026-07-29'));
    expect(hashSeed('user-a', '2026-07-29')).not.toBe(hashSeed('user-a', '2026-07-30'));
  });
});

describe('generateDay', () => {
  it('returns 24 buckets, hours 0..23 in order', () => {
    const day = generateDay('average', 1);
    expect(day).toHaveLength(24);
    expect(day.map((b) => b.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('is deterministic for a given seed', () => {
    expect(generateDay('active', 99)).toEqual(generateDay('active', 99));
  });

  it('differs across seeds, so two squadmates do not have identical days', () => {
    expect(generateDay('active', 1)).not.toEqual(generateDay('active', 2));
  });

  it('lands within 20% of each persona’s daily step target', () => {
    const targets: Record<Persona, number> = {
      sedentary: 2500,
      average: 7000,
      active: 12000,
      athlete: 18000,
    };
    for (const persona of PERSONAS) {
      const total = totalSteps(persona);
      const target = targets[persona];
      expect(total).toBeGreaterThan(target * 0.8);
      expect(total).toBeLessThan(target * 1.2);
    }
  });

  it('orders personas by activity', () => {
    expect(totalSteps('sedentary')).toBeLessThan(totalSteps('average'));
    expect(totalSteps('average')).toBeLessThan(totalSteps('active'));
    expect(totalSteps('active')).toBeLessThan(totalSteps('athlete'));
  });

  it('never exceeds the 60-minute cap the column enforces', () => {
    // active_minutes has a CHECK of between 0 and 60. An hour cannot hold more
    // than sixty minutes of movement however many steps land in it, and an
    // athlete is the case that would breach it.
    for (const bucket of generateDay('athlete', 3)) {
      expect(bucket.activeMinutes).toBeGreaterThanOrEqual(0);
      expect(bucket.activeMinutes).toBeLessThanOrEqual(60);
    }
  });

  it('emits only non-negative values, as every column requires', () => {
    for (const persona of PERSONAS) {
      for (const bucket of generateDay(persona, 5)) {
        expect(bucket.steps).toBeGreaterThanOrEqual(0);
        expect(bucket.distanceM).toBeGreaterThanOrEqual(0);
        expect(bucket.activeKcal).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('gives an athlete more VIT-qualifying active hours than a sedentary user', () => {
    // VIT counts hours with at least 250 steps (§5).
    const activeHours = (persona: Persona) =>
      generateDay(persona, 11).filter((b) => b.steps >= 250).length;
    expect(activeHours('athlete')).toBeGreaterThan(activeHours('sedentary'));
  });

  it('is quieter overnight than during commute hours', () => {
    const day = generateDay('average', 13);
    const overnight = day[3]!.steps;
    const commute = day[8]!.steps;
    expect(commute).toBeGreaterThan(overnight);
  });
});

describe('expandDateRange', () => {
  it('includes both endpoints', () => {
    expect(expandDateRange('2026-07-27', '2026-07-29')).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
    ]);
  });

  it('handles a single day', () => {
    expect(expandDateRange('2026-07-29', '2026-07-29')).toEqual(['2026-07-29']);
  });

  it('crosses a month boundary', () => {
    expect(expandDateRange('2026-07-30', '2026-08-01')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
    ]);
  });

  it('rejects a reversed range rather than returning nothing', () => {
    expect(() => expandDateRange('2026-07-29', '2026-07-27')).toThrow(/before/i);
  });

  it('refuses a range that would write an unreasonable number of days', () => {
    expect(() => expandDateRange('2026-01-01', '2026-12-31')).toThrow(
      new RegExp(String(MAX_SEED_DAYS)),
    );
  });
});

describe('findUnlistedUsers', () => {
  it('returns the ids missing from the allowlist', () => {
    expect(findUnlistedUsers(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });

  it('returns empty when everything is allowlisted', () => {
    expect(findUnlistedUsers(['a', 'b'], ['a', 'b', 'c'])).toEqual([]);
  });

  it('treats an empty allowlist as nothing being permitted', () => {
    expect(findUnlistedUsers(['a'], [])).toEqual(['a']);
  });

  it('does not report a duplicate twice', () => {
    expect(findUnlistedUsers(['b', 'b'], [])).toEqual(['b']);
  });
});

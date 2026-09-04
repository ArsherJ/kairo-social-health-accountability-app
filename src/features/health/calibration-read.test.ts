import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The calibration read is narrow, and the narrowness is a privacy claim.
 *
 * `/difficulty` tells the player their days were read on the phone and that
 * only the size they pick is saved. That sentence stays true only while the
 * read is what it says it is: one query, one metric. The obvious "reuse"
 * — calling `readHealthWindow` over fourteen days — would run six hourly
 * collections plus every workout sample plus sleep, **including heart rate**,
 * which is owner-readable only and absent from every projection. It would leave
 * the claim technically accurate and morally misleading.
 *
 * A source scan rather than a type, because `read.ts` cannot be loaded here at
 * all: it imports the HealthKit library, whose Flow syntax root Vitest cannot
 * parse. That is the same constraint `disclosure.ts` and `activity-types.ts`
 * both record, answered the same way each time.
 */
const SOURCE = readFileSync('src/features/health/read.ts', 'utf8');

function bodyOf(fn: string): string {
  const start = SOURCE.indexOf(`export async function ${fn}(`);
  expect(start, `no ${fn} in read.ts`).toBeGreaterThan(-1);
  const next = SOURCE.indexOf('\nexport ', start + 1);
  return SOURCE.slice(start, next === -1 ? undefined : next);
}

describe('readDailySteps', () => {
  const body = bodyOf('readDailySteps');

  it('names step count and no other HealthKit type', () => {
    const identifiers = body.match(/HK[A-Za-z]*TypeIdentifier[A-Za-z]+/g) ?? [];
    expect(identifiers).toEqual(['HKQuantityTypeIdentifierStepCount']);
  });

  it('reads no workouts, no sleep and no heart rate', () => {
    for (const forbidden of [
      /queryWorkoutSamples/,
      /queryCategorySamples/,
      /HeartRate/,
      /Sleep/i,
      /readHealthWindow/,
    ]) {
      expect(body, `calibration read widened: ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it('makes exactly one collection query', () => {
    expect(body.match(/queryStatisticsCollectionForQuantity/g)).toHaveLength(1);
  });

  it('states its unit, so a locale cannot pick one for it', () => {
    expect(body).toContain("unit: 'count'");
  });
});

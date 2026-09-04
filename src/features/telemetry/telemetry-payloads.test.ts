import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  One scan for one rule: no telemetry payload may carry a health figure, a
  stable identifier, or anything a reading produced.

  It started on the Living Mirror, where the risk was a step count riding along
  with a reaction. Onboarding raised the same risk in a second place — the
  connect beat is holding today's total while it reports an impression, and the
  difficulty beat prints a step median — so the beats were folded into *this*
  scan rather than given one of their own. Two guards enforcing one rule drift
  apart, and the one that drifts is always the one nobody is reading.
*/

const SURFACES = [
  'app/(tabs)/index.tsx',
  'app/(onboard)/connect.tsx',
  // `calibration.ts` is load-bearing: it is the only file in the repo that
  // calls `track` with anything a reading produced, so a scan that omitted it
  // could not fail on the one file capable of breaking the claim. It did, in
  // that feature's own first pass.
  'src/features/onboarding/calibration.ts',
  'src/features/onboarding/useBeatImpression.ts',
  'src/features/onboarding/WelcomePopups.tsx',
];

/** The onboarding half of the list, which carries one extra ban. */
const ONBOARDING_SURFACES = SURFACES.filter((path) => path !== 'app/(tabs)/index.tsx');

/** Every `track(...)` argument list in a file, one level of nesting deep. */
function trackCalls(source: string): string[] {
  return source.match(/\btrack\((?:[^()]|\([^()]*\))*\)/g) ?? [];
}

const sources = new Map(SURFACES.map((path) => [path, readFileSync(path, 'utf8')]));

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return entry.includes('.test.') ? [] : [path];
  });
}

describe('the surfaces that report', () => {
  // The file list is the part of a source scan that goes stale, and it goes
  // stale silently: a new beat that emits is simply not looked at. So the
  // directories are swept and every emitter in them has to be named here,
  // which is the arrangement `beat-registry.test.ts` already relies on.
  it('names every onboarding file that emits', () => {
    const emitters = ['app/(onboard)', 'src/features/onboarding']
      .flatMap(filesUnder)
      .filter((path) => /\btrack\(/.test(readFileSync(path, 'utf8')));

    expect(emitters.sort()).toEqual(ONBOARDING_SURFACES.slice().sort());
  });

  it('has a call to scan, and the extractor reaches all of them', () => {
    for (const [path, source] of sources) {
      const written = source.match(/\btrack\(/g) ?? [];
      expect(written.length, `${path} emits nothing`).toBeGreaterThan(0);
      expect(trackCalls(source).length, `${path} has a call the scan cannot read`).toBe(
        written.length,
      );
    }
  });
});

describe('Living Mirror telemetry', () => {
  const today = sources.get('app/(tabs)/index.tsx')!;
  const events = readFileSync('src/features/telemetry/events.ts', 'utf8');

  it.each(['today_seen', 'today_details_opened', 'next_step_shown', 'character_reaction_seen'])
    ('declares and emits %s', (name) => {
      expect(events).toContain(`'${name}'`);
      expect(today).toContain(`'${name}'`);
    });
});

describe('telemetry payloads', () => {
  // A five-band Motion location is a coarse step count, so it is a raw health
  // figure in a different dress; a step median is the same thing again, and it
  // is the figure the difficulty beat is holding while the beat above it
  // reports. `quest_cleared` sets the precedent for what may ride along: it
  // carries `{ tier }` and never a quest id.
  it.each(SURFACES)('%s sends no health figure and no stable identifier', (path) => {
    for (const call of trackCalls(sources.get(path)!)) {
      expect(call, `${path} puts a health figure in a payload`).not.toMatch(
        /median|steps|distanceM|activeKcal|sleepMinutes|verifiedMinutes|location/i,
      );
      expect(call, `${path} puts an identifier in a payload`).not.toMatch(
        /occurrence|quest\.id/i,
      );
    }
  });

  // The tier a reading proposed is the median in three buckets — a
  // distribution of the cohort's fitness sitting in `app_events` to answer a
  // question nobody asked. Today's `quest_cleared` is the deliberate exception
  // and carries `{ tier }`: that tier is the account's standing size, not
  // something a reading concluded about the person.
  it.each(ONBOARDING_SURFACES)('%s never reports the tier a reading proposed', (path) => {
    for (const call of trackCalls(sources.get(path)!)) {
      expect(call, `${path} reports a proposal`).not.toMatch(/\btier\b/i);
    }
  });
});

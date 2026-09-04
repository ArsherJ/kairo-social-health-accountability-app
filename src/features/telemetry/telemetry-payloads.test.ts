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

  **The floor is an allowlist, not a ban list.** A ban list only fails on the
  field names somebody thought of: `{ scoredDays }` and `{ days }` both ship
  elsewhere in this app and neither names a figure a ban list would have
  anticipated. So a payload key that is not on the list below fails, whatever
  it is called, and adding one is a deliberate edit here. The named health
  figures are kept *as well*, because a banned value can ride inside an allowed
  key — `category: todaySteps` passes an allowlist and is the thing this exists
  to stop.
*/

/** Files that call `track`, and are therefore scanned. Kept honest by the sweep below. */
const EMITTERS = [
  'app/(tabs)/index.tsx',
  'app/(tabs)/sky.tsx',
  'app/(onboard)/connect.tsx',
  // `calibration.ts` is load-bearing: it is the only file in the repo that
  // calls `track` with anything a reading produced, so a scan that omitted it
  // could not fail on the one file capable of breaking the claim. It did, in
  // that feature's own first pass.
  'src/features/onboarding/calibration.ts',
  'src/features/onboarding/useBeatImpression.ts',
  'src/features/onboarding/WelcomePopups.tsx',
];

/** The onboarding half, which carries one extra ban. */
const ONBOARDING_EMITTERS = EMITTERS.filter((path) => path.includes('onboard'));

/** Directories swept, so a new emitter in one cannot arrive unscanned. */
const SWEPT = ['app/(tabs)', 'app/(onboard)', 'src/features/onboarding'];

/**
 * Every payload key any scanned surface may send, with why it is not a health
 * figure. Anything else fails, which is the point.
 *
 * - `tier` — the account's standing quest size. Deliberate, and deliberately
 *   *not* allowed on the onboarding beats, where a tier is what a reading
 *   concluded about the person rather than what the account already was.
 * - `category` — `motion` / `body` / `none`. Which stat the next step is in.
 * - `kind` — which reaction was presented.
 * - `route` — the beat's own route name.
 * - `answer` — which door was taken, never what came of it.
 * - `outcome` — whether calibration could read the phone at all.
 */
const ALLOWED_KEYS = new Set(['tier', 'category', 'kind', 'route', 'answer', 'outcome']);

/**
 * Source with comments removed.
 *
 * A doc comment writing `track()` is a style this repo uses, and without this
 * the sweep would name a file that only *mentions* emitting — a guard failing
 * on a comment is a guard that gets deleted. It also means a commented-out
 * call is not scanned, which is correct: it sends nothing.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Every `track(...)` argument list in a file, one level of nesting deep. */
function trackCalls(source: string): string[] {
  return code(source).match(/\btrack\((?:[^()]|\([^()]*\))*\)/g) ?? [];
}

/** The keys of a call's payload object, shorthand (`{ route }`) included. */
function payloadKeys(call: string): string[] {
  const body = call.match(/\{([\s\S]*)\}/)?.[1];
  if (!body) return [];
  return body
    .split(',')
    .map((entry) => entry.match(/^\s*([A-Za-z_$][\w$]*)\s*(?::|$)/)?.[1])
    .filter((key): key is string => key !== undefined);
}

const sources = new Map(EMITTERS.map((path) => [path, readFileSync(path, 'utf8')]));

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return entry.includes('.test.') ? [] : [path];
  });
}

describe('the surfaces that report', () => {
  // The file list is the part of a source scan that goes stale, and it goes
  // stale silently: a new screen that emits is simply not looked at. So the
  // directories are swept and every emitter in them has to be named here,
  // which is the arrangement `beat-registry.test.ts` already relies on.
  //
  // Its one limit, stated rather than papered over: it finds `track(`, so a
  // future wrapper around it, in a directory not swept, would emit unscanned.
  // `track` is the only send in the app today and this fails the moment a
  // second one appears anywhere under these three trees.
  it('names every file under the swept directories that emits', () => {
    const found = SWEPT.flatMap(filesUnder).filter((path) =>
      /\btrack\(/.test(code(readFileSync(path, 'utf8'))),
    );

    expect(found.sort()).toEqual(EMITTERS.slice().sort());
  });

  it('has a call to scan, and the extractor reaches all of them', () => {
    for (const [path, source] of sources) {
      const written = code(source).match(/\btrack\(/g) ?? [];
      expect(written.length, `${path} emits nothing`).toBeGreaterThan(0);
      expect(trackCalls(source).length, `${path} has a call the scan cannot read`).toBe(
        written.length,
      );
    }
  });

  it('sends only event names the telemetry module declares', () => {
    const events = readFileSync('src/features/telemetry/events.ts', 'utf8');
    for (const [path, source] of sources) {
      for (const call of trackCalls(source)) {
        const name = call.match(/,\s*'([a-z_]+)'/)?.[1];
        expect(name, `${path} has a call with no event name`).toBeDefined();
        expect(events, `${path} sends undeclared ${name}`).toContain(`'${name}'`);
      }
    }
  });
});

describe('telemetry payloads', () => {
  it.each(EMITTERS)('%s sends no field that is not on the list', (path) => {
    for (const call of trackCalls(sources.get(path)!)) {
      for (const key of payloadKeys(call)) {
        expect(ALLOWED_KEYS, `${path} sends an unreviewed field: ${key}`).toContain(key);
      }
    }
  });

  // A five-band Motion location is a coarse step count, so it is a raw health
  // figure in a different dress; a step median is the same thing again, and it
  // is the figure the difficulty beat is holding while the beat above it
  // reports. Word-bounded, because `/location/i` matches "allocation" and a
  // guard that fails on real names gets loosened until it guards nothing.
  it.each(EMITTERS)('%s names no health figure and no stable identifier', (path) => {
    for (const call of trackCalls(sources.get(path)!)) {
      expect(call, `${path} puts a health figure in a payload`).not.toMatch(
        /\b(medians?\w*|steps?\w*|distance\w*|\w*kcal|calories|sleep\w*|verified\w*|location)\b/i,
      );
      expect(call, `${path} puts an identifier in a payload`).not.toMatch(
        /\boccurrence\w*\b|\.\s*id\b/i,
      );
    }
  });

  // The tier a reading proposed is the median in three buckets — a
  // distribution of the cohort's fitness sitting in `app_events` to answer a
  // question nobody asked. Today's `quest_cleared` is the deliberate exception
  // and carries `{ tier }`: that tier is the account's standing size, not
  // something a reading concluded about the person.
  it.each(ONBOARDING_EMITTERS)('%s never reports the tier a reading proposed', (path) => {
    for (const call of trackCalls(sources.get(path)!)) {
      expect(call, `${path} reports a proposal`).not.toMatch(/\btier\b/i);
    }
  });
});

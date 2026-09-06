import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEVICE_SOURCE_PREFIX,
  STEP_SOURCE_BRIDGE_ALLOWLIST,
  partitionStepSources,
} from './step-sources.ts';

const source = (bundleIdentifier: string, name = bundleIdentifier) => ({
  bundleIdentifier,
  name,
});

describe('partitionStepSources', () => {
  it('trusts a device-recorded source under the lowercase prefix', () => {
    const iphone = source('com.apple.health.A1B2C3D4-0000-4000-8000-000000000001', 'iPhone');
    const watch = source('com.apple.health.A1B2C3D4-0000-4000-8000-000000000002', 'Apple Watch');

    const { trusted, droppedNames } = partitionStepSources([iphone, watch]);

    expect(trusted).toEqual([iphone, watch]);
    expect(droppedNames).toEqual([]);
  });

  it('does NOT trust the Health app, which differs from the prefix only by case', () => {
    // `com.apple.Health` is hand entry. A case-insensitive prefix match would
    // trust it, leaving the typed-in predicate as the only thing between a
    // typed number and the score.
    const { trusted, droppedNames } = partitionStepSources([
      source('com.apple.Health', 'Health'),
    ]);

    expect(trusted).toEqual([]);
    expect(droppedNames).toEqual(['Health']);
  });

  it('is case-sensitive across the whole prefix, not just the last segment', () => {
    for (const spelling of ['COM.APPLE.HEALTH.abc', 'Com.Apple.Health.abc', 'com.Apple.health.abc']) {
      expect(partitionStepSources([source(spelling)]).trusted).toEqual([]);
    }
  });

  it('does not trust the bare prefix with nothing after it', () => {
    // `com.apple.health` is not a device; a device carries an identifier.
    expect(partitionStepSources([source('com.apple.health')]).trusted).toEqual([]);
  });

  it('trusts a bridge app by exact identifier', () => {
    for (const id of STEP_SOURCE_BRIDGE_ALLOWLIST) {
      expect(partitionStepSources([source(id)]).trusted).toHaveLength(1);
    }
  });

  it('reports an unrecognised source by display name, not by identifier', () => {
    const { trusted, droppedNames } = partitionStepSources([
      source('com.xiaomi.mifitness', 'Mi Fitness'),
    ]);

    expect(trusted).toEqual([]);
    expect(droppedNames).toEqual(['Mi Fitness']);
  });

  it('keeps the trusted ones when a day mixes trusted and untrusted sources', () => {
    const iphone = source('com.apple.health.DEVICE', 'iPhone');
    const band = source('com.xiaomi.mifitness', 'Mi Fitness');

    const { trusted, droppedNames } = partitionStepSources([iphone, band]);

    expect(trusted).toEqual([iphone]);
    expect(droppedNames).toEqual(['Mi Fitness']);
  });

  it('names each dropped app once, in first-seen order', () => {
    const { droppedNames } = partitionStepSources([
      source('com.b.app', 'Beta'),
      source('com.a.app', 'Alpha'),
      source('com.b.app.two', 'Beta'),
    ]);

    expect(droppedNames).toEqual(['Beta', 'Alpha']);
  });

  it('falls back to the identifier when a source reports a blank name', () => {
    // The line exists to tell somebody which app to look at. An empty string
    // would render "Steps from aren't counted yet".
    expect(partitionStepSources([source('com.unknown.band', '  ')]).droppedNames).toEqual([
      'com.unknown.band',
    ]);
  });

  it('trusts extra identifiers the caller supplies, and nothing more', () => {
    // `read.ts` passes the app's own bundle id under __DEV__ so `dev-seed.ts`
    // keeps working on a simulator. Nothing else may use this.
    const seeded = source('com.arsherj.kairo', 'Kairo');

    expect(partitionStepSources([seeded]).trusted).toEqual([]);
    expect(partitionStepSources([seeded], ['com.arsherj.kairo']).trusted).toEqual([seeded]);
  });

  it('exposes the prefix it matches on, so nothing restates it', () => {
    expect(DEVICE_SOURCE_PREFIX).toBe('com.apple.health.');
  });
});

describe('dropped step sources stay on the phone', () => {
  /**
   * Which apps a player carries is theirs. The names exist to explain a low
   * number to the person looking at it, and a guard is cheap because the
   * tempting next step — "log which bands the cohort uses" — is one line away
   * and would turn a disclosure into a collection.
   */
  const code = (path: string) =>
    readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('never rides the sync request body', () => {
    const source = code('src/features/health/sync.ts');
    const body = /body:\s*\{[^}]*\}/.exec(source)?.[0] ?? '';
    expect(body, 'sync.ts sends no body?').not.toBe('');
    expect(body).not.toContain('dropped');
  });

  it('never enters a telemetry payload', () => {
    // `app/(tabs)/index.tsx` is deliberately absent: `telemetry-payloads.test.ts`
    // already sweeps that directory under an allowlist, so a `droppedStepSources`
    // payload key fails there. CLAUDE.md's rule is that a second scan of the same
    // rule always ends up quietly narrower than the first. These two files are
    // genuinely unswept, which is the whole reason this exists.
    for (const path of [
      'src/features/health/useHealthSync.ts',
      'src/features/health/sync.ts',
    ]) {
      const calls = code(path).match(/\btrack\((?:[^()]|\([^()]*\))*\)/g) ?? [];
      for (const call of calls) {
        expect(call, `${path} reports a dropped source`).not.toContain('dropped');
        expect(call, `${path} reports a dropped source`).not.toContain('Source');
      }
    }
  });
});

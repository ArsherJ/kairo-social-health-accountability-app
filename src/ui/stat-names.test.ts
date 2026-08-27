import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_STATS } from '@kairo/core';
import { STAT_NAMES, dominanceName } from './stat-names.ts';

describe('STAT_NAMES', () => {
  it('speaks the player vocabulary, not the engine keys (deviation #51)', () => {
    expect(STAT_NAMES).toEqual({ AGI: 'Motion', STR: 'Body', MND: 'Mind' });
  });

  it('is total over CoreStat, so no stat can render as undefined', () => {
    for (const stat of CORE_STATS) {
      expect(typeof STAT_NAMES[stat]).toBe('string');
      expect(STAT_NAMES[stat].length).toBeGreaterThan(0);
    }
  });
});

describe('dominanceName', () => {
  it('names a dominant stat with the player word', () => {
    expect(dominanceName('STR')).toBe('Body');
    expect(dominanceName('AGI')).toBe('Motion');
  });

  it('names the All-Rounder, which is a shape rather than a stat', () => {
    expect(dominanceName('balanced')).toBe('All-Rounder');
  });

  it('has no name for an unstarted or still-loading character', () => {
    // Null is a real state — a character with no points has no build, and
    // saying "All-Rounder" to someone who has done nothing would cheapen the
    // one visual §6 says must be earned.
    expect(dominanceName(null)).toBeNull();
    expect(dominanceName(undefined)).toBeNull();
  });
});

describe('the old vocabulary', () => {
  /** Every .ts/.tsx under the app's own source, excluding tests. */
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        sourceFiles(path, out);
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push(path);
      }
    }
    return out;
  }

  it('has no "Agility" left anywhere in app or src', () => {
    // Guards only the word that must vanish completely. "Strength" is
    // deliberately NOT guarded: it survives as a squad program name, a
    // Challenge area name and two HKWorkoutActivityType identifiers, so a
    // guard on it would be noise rather than a rule.
    const offenders = [...sourceFiles('src'), ...sourceFiles('app')].filter((path) =>
      readFileSync(path, 'utf8').includes('Agility'),
    );
    expect(offenders).toEqual([]);
  });
});

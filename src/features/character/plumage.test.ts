import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CORE_STATS, type CoreStat } from '@kairo/core';
import { STAT_COLORS } from '../../ui/stat-colors.ts';
import { CREST_TINT_OPACITY, crestTint } from './plumage.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Lifetime points with one stat clearly ahead of the other two. */
const leading = (stat: CoreStat): Record<CoreStat, number> => ({
  AGI: stat === 'AGI' ? 9_000 : 1_000,
  STR: stat === 'STR' ? 9_000 : 1_000,
  MND: stat === 'MND' ? 9_000 : 1_000,
});

describe('crestTint', () => {
  it('gives each dominant stat its own hue, so two eagles stop looking identical', () => {
    // The ticket's first criterion. Three stats, three visibly different
    // crests — and the hues are read from the one table the redesign allows
    // per-stat colour in, never invented here.
    const tints = CORE_STATS.map((stat) => crestTint(leading(stat)));
    expect(tints).toEqual(CORE_STATS.map((stat) => STAT_COLORS[stat]));
    expect(new Set(tints).size).toBe(CORE_STATS.length);
  });

  it('gives a balanced player no hue at all', () => {
    // Not an arbitrary tint and not a fourth colour: picking a stat to speak
    // for somebody whose stats are level invents a preference they have not
    // shown, which is exactly why `laneStat` already refuses to.
    expect(crestTint({ AGI: 1_000, STR: 950, MND: 900 })).toBeNull();
  });

  it('gives an unstarted or still-loading character no hue either', () => {
    // Three zeros are an unstarted character rather than a balanced one, and
    // `undefined` is a profile in flight. A tint on either would be a guess,
    // and a guess that changes colour a frame later reads as a bug.
    expect(crestTint({ AGI: 0, STR: 0, MND: 0 })).toBeNull();
    expect(crestTint(undefined)).toBeNull();
  });

  it('reads a missing stat as zero rather than letting it decide the crest', () => {
    // A squadmate's `ratings` is a `Record<string, number>` off an RPC, so a
    // stat can simply be absent. `undefined` slipping into the comparison is
    // the failure `useDominantStat` already records in its own words.
    expect(crestTint({ STR: 4_000 })).toBe(STAT_COLORS.STR);
  });

  it('answers the same for a profile and for the row a flockmate sees', () => {
    // The two surfaces feed it the same three lifetime numbers — the `profiles`
    // rollups on the day screen, the identical figures projected as `ratings`
    // on the flock row — so one player cannot wear two crests.
    const profile = { AGI: 12_000, STR: 3_000, MND: 2_000 };
    const projectedRow: Record<string, number> = { AGI: 12_000, STR: 3_000, MND: 2_000 };
    expect(crestTint(projectedRow)).toBe(crestTint(profile));
  });

  it('tints rather than repaints, so the feathers underneath still read', () => {
    // The mask is filled with a flat hue and drawn over flattened art: at full
    // strength it would erase the outlines and the shading with it, and the
    // crest would read as a coloured blob rather than as plumage.
    expect(CREST_TINT_OPACITY).toBeGreaterThan(0.3);
    expect(CREST_TINT_OPACITY).toBeLessThan(0.8);
  });

  it('is never spoken: no accessible name gains the hue', () => {
    // The ticket's fourth criterion, and it is a *don't*. Both names are
    // composed in pure modules — `livingCharacterLabel` for the day screen's
    // figure, `leaderboardRowLabel` for a flock row — and the dominant stat is
    // already in a row's reading order as three ratings. A crest that announced
    // its colour would say the same fact twice, in a vocabulary nobody asked
    // for, and would describe a picture rather than a person.
    //
    // Scanned from each label's own declaration rather than over the whole
    // file: `living-mirror.ts` legitimately names `colors` for the ground
    // shadow's shade, and a guard that fails on honest code gets loosened until
    // it guards nothing.
    for (const [path, declaration] of [
      ['src/features/character/living-mirror.ts', 'export function livingCharacterLabel'],
      ['src/features/squad/row-label.ts', 'export function leaderboardRowLabel'],
    ]) {
      const source = readFileSync(resolve(REPO_ROOT, path!), 'utf8')
        .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      expect(source, path).not.toContain('plumage.ts');
      // `indexOf` answering -1 would slice the last character and guard
      // nothing, so a renamed label fails here rather than passing quietly.
      const start = source.indexOf(declaration!);
      expect(start, path).toBeGreaterThanOrEqual(0);
      const label = source.slice(start);
      expect(label, path).not.toMatch(/crest|plumage|tint|hue|colou?r/i);
    }
  });

  it('is the only producer of a crest hue', () => {
    // A second reading of dominance-to-colour is how the day screen and the
    // flock row start disagreeing about what somebody looks like — the same
    // failure `dominanceName()` was extracted to end.
    //
    // Two lists, because there are two jobs and the wrong one is a different
    // mistake in each. **No `continue`**: a file that stopped calling
    // `crestTint` and reached for the table instead is precisely the drift this
    // names, and skipping it would let exactly that through. A file that stops
    // drawing a crest comes off this list by somebody's decision.
    const strip = (path: string) =>
      readFileSync(resolve(REPO_ROOT, path), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

    // The two components that draw a crest: each asks `plumage.ts` for the hue
    // and never works one out.
    for (const path of [
      'src/features/character/CharacterFigure.tsx',
      'src/features/character/KairoThumbnail.tsx',
    ]) {
      const source = strip(path);
      expect(source, path).toContain('crestTint');
      expect(source, path).not.toContain('STAT_COLORS');
      expect(source, path).not.toContain('dominantStat');
    }

    // The surfaces that hand a bird its subject: they pass the three lifetime
    // numbers and decide nothing. A hue computed at a call site is a fourth
    // answer to a question two components already share one answer to.
    for (const path of [
      'src/features/squad/LeaderboardRow.tsx',
      'src/features/squad/FlockPerch.tsx',
      'src/features/squad/PerchBirdSheet.tsx',
      'src/features/profile/ProfileHeader.tsx',
    ]) {
      const source = strip(path);
      expect(source, path).toContain('lifetimePoints');
      expect(source, path).not.toContain('crestTint');
      expect(source, path).not.toContain('STAT_COLORS');
    }

    // `CrestLayer` paints the hue and never chooses it, which is why it holds
    // neither call.
    const layer = strip('src/features/character/CrestLayer.tsx');
    expect(layer).not.toContain('crestTint');
    expect(layer).not.toContain('STAT_COLORS');
  });
});

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DAILY_STEP_BASELINE, FREE_SQUAD_MAX_MEMBERS } from '@kairo/core';
import { SPECIES, SPECIES_IDS, speciesLine } from './species.ts';

/**
 * Say what the bird is (issue #32).
 *
 * Every character is a Philippine eagle and no screen said so — the cultural
 * argument the product rests on was one line away from being visible, and the
 * 2026-09-06 panel scored cultural specificity 2/5 for exactly that.
 *
 * The line is one sentence in one place. This file owns both halves of that:
 * that the sentence reads correctly, and that it appears on no second screen.
 */
describe('speciesLine', () => {
  it('names the bird as a common noun, with its article', () => {
    expect(speciesLine('eagle')).toBe('A Philippine eagle');
  });

  it('reads as a sentence for every species in the registry', () => {
    // Also what forces a decision about the article. It is written out rather
    // than derived from the first letter, because no noun here begins with a
    // vowel and `SPECIES_IDS` mirrors a CHECK constraint — so a fifth species
    // is a migration, and this exact list is what fails in front of whoever
    // writes it.
    // Three of the four are unreachable behind `displaySpecies` and the line
    // still has to be right for them: reversing deviation #55 is deleting one
    // line of that function, and it must not also mean fixing this copy.
    expect(SPECIES_IDS.map((id) => speciesLine(id))).toEqual([
      'A pilandok',
      'A tamaraw',
      'A carabao',
      'A Philippine eagle',
    ]);
  });

  it('says the same words as the label the registry already carries', () => {
    // `noun` is a second string holding the same words as `name`, because a
    // sentence wants "a Philippine eagle" and a label wants "Philippine
    // Eagle" — the case is the only difference there may ever be. SPECIES_NAMES
    // is derived rather than repeated for the same reason; this is the guard
    // that stands in for a derivation the casing rules make impossible.
    for (const id of SPECIES_IDS) {
      expect(SPECIES[id].noun.toLowerCase()).toBe(SPECIES[id].name.toLowerCase());
    }
  });
});

describe('the phrase appears once', () => {
  /** Every .ts/.tsx under the app's own source, excluding tests. */
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) sourceFiles(path, out);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
    }
    return out;
  }

  /**
   * Source with comments removed, the way `typed-in-samples.test.ts` does it
   * and for the same reason: several modules explain the one-eagle decision in
   * prose, and a guard that fails on the sentence describing a rule is a guard
   * that gets loosened until it guards nothing.
   */
  function code(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  }

  it('is written in species.ts and nowhere else under app or src', () => {
    // **What this cannot see**: `LeaderboardRow` passes
    // `SPECIES_NAMES[displaySpecies(...)]` into `leaderboardRowLabel`, so a
    // flock row has *spoken* the species since deviation #40. That is a
    // registry lookup rather than typed copy, and a phrase scan only ever
    // finds the latter. It is not a second surface to remove — it is a
    // VoiceOver reading of a picture, and it predates this line by weeks — but
    // it is why the claim is "the only screen that prints it" rather than "the
    // only place it is said".
    // The ticket's second criterion, made structural: "it does not become a
    // species readout, a fact card or a second noun". A screen that wants to
    // say what the bird is reads `speciesLine`, so there is one sentence to
    // change and one place a reader has to look to find it.
    const offenders = [...sourceFiles('src'), ...sourceFiles('app')]
      .filter((path) => /philippine\s+eagle/i.test(code(readFileSync(path, 'utf8'))))
      .filter((path) => path !== join('src', 'features', 'character', 'species.ts'));
    expect(offenders).toEqual([]);
  });

  it('is what the App Store description calls the bird, in its own words', () => {
    // The ticket's third criterion, as far as a repository can reach it: the
    // listing itself is typed into App Store Connect by hand, exactly like the
    // privacy answers and `NSHealthShareUsageDescription`, so what is guarded
    // here is the copy a person pastes from. It reads the noun rather than the
    // whole line because a description is prose and will not want the article —
    // what must not drift is the animal.
    const listing = readFileSync(join('docs', 'app-store-listing.md'), 'utf8');
    expect(listing).toContain(SPECIES.eagle.noun);
  });

  it('quotes the app\'s own figures in the App Store description', () => {
    // The welcome cards' rule, applied where a Markdown file cannot import a
    // constant: assert agreement instead. A description promising "10,000
    // steps" after the Daily Walk moved is a false claim in the one place a
    // stranger reads before installing, and nothing else would catch it.
    const listing = readFileSync(join('docs', 'app-store-listing.md'), 'utf8');
    expect(listing).toContain(DAILY_STEP_BASELINE.toLocaleString('en-US'));
    // The flock sentence spells its number out, so the guard pins the constant
    // the word stands for rather than trying to spell it. Move
    // FREE_SQUAD_MAX_MEMBERS and this fails, which is a human rewriting one
    // sentence — the outcome a formatter would have hidden.
    expect(FREE_SQUAD_MAX_MEMBERS).toBe(6);
    expect(listing).toMatch(/Up to six of you/);
  });
});

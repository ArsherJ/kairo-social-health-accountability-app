import { describe, expect, it } from 'vitest';
import { SPECIES, SPECIES_IDS, SPECIES_NAMES, parseSpecies } from './species.ts';

describe('SPECIES registry', () => {
  it('lists exactly the four values in the CHECK constraint, in order', () => {
    // Mirrors `check (species in ('pilandok','tamaraw','carabao','eagle'))`.
    // A value this accepts and the database rejects is a 23514 the user can
    // do nothing with — the discipline character-body.ts already applies.
    expect([...SPECIES_IDS]).toEqual(['pilandok', 'tamaraw', 'carabao', 'eagle']);
  });

  it('covers every id with a name, hue, affinity and blurb', () => {
    for (const id of SPECIES_IDS) {
      const s = SPECIES[id];
      expect(s.id).toBe(id);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
      expect(s.hue).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('covers every core stat, with one stat carrying the extra species', () => {
    // Four species and three stats since deviation #41, so the one-to-one
    // mapping the four-stat model had cannot hold. What must still hold is
    // coverage: no stat may be unrepresented, or a whole build would have no
    // animal to be. Carabao and Tamaraw both sit on STR — carabao inherited
    // it from END, whose signal now lives in STR's workout shift.
    const affinities = SPECIES_IDS.map((id) => SPECIES[id].affinity);
    expect([...new Set(affinities)].sort()).toEqual(['AGI', 'MND', 'STR']);
    expect(affinities).toHaveLength(4);
  });

  it('derives SPECIES_NAMES from the registry rather than repeating it', () => {
    // STAT_NAMES' lesson: a second list of the same words drifts. This asserts
    // the two agree; species.ts must build one from the other.
    for (const id of SPECIES_IDS) expect(SPECIES_NAMES[id]).toBe(SPECIES[id].name);
  });

  it('gives every species a distinct hue', () => {
    const hues = SPECIES_IDS.map((id) => SPECIES[id].hue);
    expect(new Set(hues).size).toBe(hues.length);
  });
});

describe('parseSpecies', () => {
  it('accepts each id the column allows', () => {
    expect(parseSpecies('pilandok')).toBe('pilandok');
    expect(parseSpecies('tamaraw')).toBe('tamaraw');
    expect(parseSpecies('carabao')).toBe('carabao');
    expect(parseSpecies('eagle')).toBe('eagle');
  });

  it('returns null for a missing param rather than throwing', () => {
    // Deep-linking /name directly is legitimate. The column is nullable
    // precisely so this renders a default figure instead of a dead screen.
    expect(parseSpecies(undefined)).toBeNull();
    expect(parseSpecies(null)).toBeNull();
    expect(parseSpecies('')).toBeNull();
  });

  it('rejects a value outside the CHECK', () => {
    expect(parseSpecies('tarsier')).toBeNull();
    expect(parseSpecies('Eagle')).toBeNull();
    expect(parseSpecies('male')).toBeNull();
  });

  it('rejects a repeated query param', () => {
    // expo-router types a search param as `string | string[]`.
    // `?species=eagle&species=tamaraw` is an ambiguous answer, not a choice.
    expect(parseSpecies(['eagle', 'tamaraw'])).toBeNull();
    expect(parseSpecies(['eagle'])).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(parseSpecies(0)).toBeNull();
    expect(parseSpecies({})).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { SPECIES_NAMES } from './species.ts';
import { speciesFigureLabel } from './species-label.ts';

const statNames = { AGI: 'Agility', STR: 'Strength', END: 'Endurance', VIT: 'Vitality' } as const;
const base = { speciesNames: SPECIES_NAMES, statNames };

describe('speciesFigureLabel', () => {
  it('names the species, the level and the dominant stat', () => {
    expect(
      speciesFigureLabel({ ...base, species: 'eagle', level: 12, dominance: 'AGI' }),
    ).toBe('Philippine Eagle, level 12, Agility-dominant');
  });

  it('never says the character name', () => {
    // The name is already printed beside the figure. Repeating it is the noise
    // the StatCoin-inside-StatRail label was reverted for. There is deliberately
    // no parameter for it — the omission is structural, not a caller's choice.
    const label = speciesFigureLabel({ ...base, species: 'tamaraw', level: 3, dominance: 'STR' });
    expect(label).not.toMatch(/,\s*[A-Z][a-z]+\s*,/);
    expect(label).toBe('Tamaraw, level 3, Strength-dominant');
  });

  it('says balanced rather than naming a stat', () => {
    expect(
      speciesFigureLabel({ ...base, species: 'carabao', level: 8, dominance: 'balanced' }),
    ).toBe('Carabao, level 8, balanced');
  });

  it('drops the dominance clause when there is none yet', () => {
    // A new character has no dominance. "null-dominant" is not a thing, and a
    // trailing comma is worse out loud than a shorter sentence.
    expect(
      speciesFigureLabel({ ...base, species: 'pilandok', level: 1, dominance: null }),
    ).toBe('Pilandok, level 1');
  });

  it('falls back to a neutral noun when no species has been chosen', () => {
    // Every row predating the migration, plus anyone who dismissed the picker.
    expect(
      speciesFigureLabel({ ...base, species: null, level: 5, dominance: 'END' }),
    ).toBe('Your character, level 5, Endurance-dominant');
  });
});

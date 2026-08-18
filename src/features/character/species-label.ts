import type { CoreStat, Dominance } from '@kairo/core';
import type { SpeciesId } from './species.ts';

/**
 * The character figure, said out loud.
 *
 * The figure says three things without words: which animal you are (the art),
 * how far you have got (the ground shadow widens with the level band), and
 * what you have actually been doing (the shadow's tint and the presence ring).
 * Left unlabelled that is a picture; composed, it is one sentence.
 *
 * **The character name is deliberately absent, and there is no parameter for
 * it** — the omission is structural rather than a caller's choice. The name is
 * already rendered as text beside the figure, and a label that repeats adjacent
 * text is noise. That is the same rule that got `StatCoin`'s label inside
 * `StatRail` reverted.
 *
 * Pure, and tested in Node, for the same reason `row-label.ts` and
 * `program-copy.ts` are: the conditionals here read as obviously right and are
 * wrong at the edges — a character with no dominance yet, and one with no
 * species at all. Names are injected so this module imports no UI.
 */
export interface SpeciesLabelInput {
  /** Null for a profile predating the choice, or one that dismissed the picker. */
  species: SpeciesId | null;
  level: number;
  /** Null for a character with nothing scored yet. */
  dominance: Dominance;
  speciesNames: Record<SpeciesId, string>;
  statNames: Record<CoreStat, string>;
}

export function speciesFigureLabel(input: SpeciesLabelInput): string {
  const who = input.species ? input.speciesNames[input.species] : 'Your character';
  const parts = [who, `level ${input.level}`];

  // No clause at all rather than an empty one: "null-dominant" is not a thing,
  // and a trailing comma is audible.
  if (input.dominance === 'balanced') parts.push('balanced');
  else if (input.dominance) parts.push(`${input.statNames[input.dominance]}-dominant`);

  return parts.join(', ');
}

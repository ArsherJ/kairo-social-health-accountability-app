import type { CoreStat } from '@kairo/core';

/**
 * Which animal the player's character is.
 *
 * Replaces `profiles.character_body` (deviation #27), which asked for an
 * identity declaration at the highest-attention moment in onboarding, bought
 * two assets that had to be maintained forever, and — as that screen's own
 * comment admitted — could not even promise the choice was changeable.
 *
 * **Cosmetic, and structurally so.** `affinity` is flavour: it decides which
 * stat the species is *about*, never what the player earns. §5's "no stat is
 * required daily" pillar is untouched, and nothing in `@kairo/core` imports
 * this file. If a mechanical bonus is ever added, note that `daily_scores` is
 * replayed from stored buckets, so a retroactive affinity rescores history —
 * that is a migration, not a tweak.
 *
 * **Zero runtime imports on purpose.** `CoreStat` is type-only, so root Vitest
 * — which has no `@/` alias and cannot parse React Native's Flow syntax — loads
 * and tests this directly. Same constraint that shaped `buffer.ts` and
 * `milestones.ts`. Do not import art, theme or anything from `@/ui` here; the
 * art map lives in `species-art.ts` for exactly this reason.
 */

/**
 * The order is the picker's reading order, and it mirrors the CHECK constraint
 * in `20260818120000_species.sql`. A test pins both.
 */
export const SPECIES_IDS = ['pilandok', 'tamaraw', 'carabao', 'eagle'] as const;

export type SpeciesId = (typeof SPECIES_IDS)[number];

export interface Species {
  id: SpeciesId;
  /** The in-app noun. "Your Philippine Eagle." */
  name: string;
  /** The stat this species is *about*. Flavour only — never read by scoring. */
  affinity: CoreStat;
  /**
   * The species' identity colour.
   *
   * Deliberately **not** in `theme.ts`'s `ramp`. That palette is semantic —
   * terracotta means *call to action*, sage means *your lane* — and a species
   * hue means neither. These are identity colours whose only requirements are
   * that they differ from each other and clear those two meanings, which is a
   * constraint on the illustrator brief and is why they live beside the brief's
   * other outputs rather than beside the app's semantics.
   */
  hue: string;
  /**
   * One line shown on the picker card. Endemic fact plus conservation status.
   *
   * Conservation is framing, not a claim: do not write copy implying a
   * partnership or a donation until one exists.
   */
  blurb: string;
}

export const SPECIES: Record<SpeciesId, Species> = {
  pilandok: {
    id: 'pilandok',
    name: 'Pilandok',
    affinity: 'AGI',
    hue: '#b98a4e',
    blurb: 'The Palawan mouse-deer — quick, small, and hard to catch. Vulnerable in the wild.',
  },
  tamaraw: {
    id: 'tamaraw',
    name: 'Tamaraw',
    affinity: 'STR',
    hue: '#5b6b78',
    blurb: 'Found only on Mindoro, and nowhere else on earth. Critically endangered.',
  },
  carabao: {
    id: 'carabao',
    name: 'Carabao',
    affinity: 'END',
    hue: '#8a8f7a',
    blurb: 'The national animal. Works all day and keeps going.',
  },
  eagle: {
    id: 'eagle',
    name: 'Philippine Eagle',
    affinity: 'VIT',
    hue: '#8c5a3c',
    blurb: 'The national bird, and one of the largest eagles alive. Critically endangered.',
  },
};

/**
 * Species words, for accessible labels and copy.
 *
 * **Built from `SPECIES`, never written out again.** This is `STAT_NAMES`'
 * lesson: a parallel table of the same words drifts the moment one of them
 * changes, and nothing fails when it does.
 */
export const SPECIES_NAMES: Record<SpeciesId, string> = Object.fromEntries(
  SPECIES_IDS.map((id) => [id, SPECIES[id].name]),
) as Record<SpeciesId, string>;

/**
 * An untrusted route param as a species, or `null`.
 *
 * `null` is a real answer — "never asked" — not a failure, matching the
 * nullable column. Takes `unknown` rather than expo-router's
 * `string | string[] | undefined` so the validation is total: this is the
 * boundary where a value off a URL stops being data.
 */
export function parseSpecies(raw: unknown): SpeciesId | null {
  if (typeof raw !== 'string') return null;
  return (SPECIES_IDS as readonly string[]).includes(raw) ? (raw as SpeciesId) : null;
}

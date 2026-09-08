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
  /**
   * The same words as a common noun, for a sentence: "a Philippine eagle".
   *
   * A second string rather than a derivation, and deliberately so. `name` is a
   * label and takes a label's capitals; a sentence takes English's own rule for
   * a species' common name, where only a proper adjective keeps its capital.
   * No mechanical transform gets from one to the other for all four — the test
   * asserts instead that the two say the same words and differ only in case,
   * which is `SPECIES_NAMES`' anti-drift rule applied where a derivation cannot
   * reach.
   */
  noun: string;
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
    noun: 'pilandok',
    affinity: 'AGI',
    hue: '#b98a4e',
    blurb: 'The Palawan mouse-deer — quick, small, and hard to catch. Vulnerable in the wild.',
  },
  tamaraw: {
    id: 'tamaraw',
    name: 'Tamaraw',
    noun: 'tamaraw',
    affinity: 'STR',
    hue: '#5b6b78',
    blurb: 'Found only on Mindoro, and nowhere else on earth. Critically endangered.',
  },
  carabao: {
    id: 'carabao',
    name: 'Carabao',
    noun: 'carabao',
    affinity: 'STR',
    hue: '#8a8f7a',
    blurb: 'The national animal. Works all day and keeps going.',
  },
  eagle: {
    id: 'eagle',
    name: 'Philippine Eagle',
    noun: 'Philippine eagle',
    affinity: 'MND',
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

/**
 * The one Kairo (roadmap deviation #55).
 *
 * Every character is a Philippine eagle as of 2026-08-27. Four species meant
 * the app had no character at all — nothing could be *about* your Kairo when
 * your Kairo was one of four interchangeable skins, and the picker asked for an
 * identity declaration at the highest-attention moment in onboarding to buy
 * that.
 */
export const DEFAULT_SPECIES: SpeciesId = 'eagle';

/**
 * The species to *draw*, given the species that is *stored*.
 *
 * Always the eagle. This is the entire mechanism of deviation #55 and it is
 * deliberately this small: `profiles.species` is not migrated, not dropped and
 * never written differently, so every pre-2026-08-27 choice survives in the
 * column and reversing the decision is deleting the first line of this
 * function.
 *
 * Call it at the **render boundary** — wherever art, a hue or a species name is
 * resolved. Do not call it before a write, and do not call it inside
 * `parseSpecies`, which guards what the database is allowed to hold and must
 * keep accepting all four or every stored row fails on read.
 */
export function displaySpecies(_stored: SpeciesId | null): SpeciesId {
  return DEFAULT_SPECIES;
}

/**
 * "A Philippine eagle" — what the bird is, as a sentence (issue #32).
 *
 * The one place in the app that says what the animal is. Every character is a
 * Philippine eagle (deviation #55) and until now no screen said so, which left
 * the product's clearest cultural claim invisible: swap the eagle for a generic
 * owl and nothing a player could see would change. The 2026-09-06 evaluation
 * panel scored cultural specificity 2/5 and named this.
 *
 * **One line, on the You tab, under the name.** It is not a species readout, a
 * fact card or a second noun — the registry's `blurb` is the endemic-fact copy
 * and it belonged to a picker that no longer exists. A test sweeps `app/` and
 * `src/` for the phrase and fails any file but this one, so a second surface
 * has to read this function rather than write the words again.
 *
 * **The only place it is *printed*, which is not the only place it is said.**
 * A flock row has spoken `SPECIES_NAMES[displaySpecies(...)]` through
 * `leaderboardRowLabel` since deviation #40 — a VoiceOver reading, not a
 * visible one, and it stays. Worth knowing because the sweep cannot see it:
 * that path is a registry lookup, and a scan for the phrase only ever finds
 * copy somebody typed.
 *
 * The article is written out rather than derived. No noun in the registry
 * begins with a vowel, and `SPECIES_IDS` mirrors a CHECK constraint, so a
 * fifth species is a migration — at which point the test's exact four-line
 * assertion fails and a human writes the fifth sentence, which is the right
 * moment to decide between "A" and "An".
 */
export function speciesLine(id: SpeciesId): string {
  return `A ${SPECIES[id].noun}`;
}

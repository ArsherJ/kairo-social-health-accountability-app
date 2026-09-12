/**
 * Which animal the player's character is.
 *
 * Replaces `profiles.character_body` (deviation #27), which asked for an
 * identity declaration at the highest-attention moment in onboarding, bought
 * two assets that had to be maintained forever, and — as that screen's own
 * comment admitted — could not even promise the choice was changeable.
 *
 * **Cosmetic, and structurally so.** Nothing in `@kairo/core` imports this
 * file. If a mechanical bonus is ever added, note that `daily_scores` is
 * replayed from stored buckets, so a retroactive species bonus rescores
 * history — that is a migration, not a tweak.
 *
 * **Zero imports on purpose**, so root Vitest — which has no `@/` alias and
 * cannot parse React Native's Flow syntax — loads and tests this directly.
 * Same constraint that shaped `buffer.ts` and `milestones.ts`. Do not import
 * art, theme or anything from `@/ui` here.
 */

/**
 * Mirrors the CHECK constraint in `20260818120000_species.sql`. A test pins it.
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
}

export const SPECIES: Record<SpeciesId, Species> = {
  pilandok: {
    id: 'pilandok',
    name: 'Pilandok',
    noun: 'pilandok',
  },
  tamaraw: {
    id: 'tamaraw',
    name: 'Tamaraw',
    noun: 'tamaraw',
  },
  carabao: {
    id: 'carabao',
    name: 'Carabao',
    noun: 'carabao',
  },
  eagle: {
    id: 'eagle',
    name: 'Philippine Eagle',
    noun: 'Philippine eagle',
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
 * Call it at the **render boundary** — wherever art or a species name is
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
 * fact card or a second noun. A test sweeps `app/` and
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

import type { CoreStat, Dominance } from '@kairo/core';

/**
 * The stats said in full, for screen readers and for every line of copy that
 * names one (roadmap deviation #51).
 *
 * **Load-bearing, not decoration.** The coins carry no text at all, so this is
 * the entire accessible name of a stat on the rail — the same status
 * `TabPill`'s `LABELS` map has for the nav.
 *
 * **Body · Motion · Mind, over the three-letter keys and the RPG words they
 * used to be spoken as.** The engine keys do not move: `CoreStat` is still `'AGI' | 'STR' | 'MND'`, `daily_scores` still
 * has `agi_points`, `tiers` is still keyed `AGI`/`AGI_base`, and
 * `program_weighted_total` still takes them in that order. This is deviation
 * #23's move in a second place — the engine keeps its vocabulary and the
 * surface gets the player's. RPG stat abbreviations are a genre convention the
 * pivot is deliberately dropping: the app now asks someone to race, not to read
 * a character sheet, and "Body" is a word about the person rather than about
 * the system measuring them. The retired words are recorded in roadmap
 * deviation #51 and deliberately not repeated here — `stat-names.test.ts`
 * scans `src` and `app` for the one that must vanish completely, and a file
 * exempting itself from its own guard is how the guard starts to rot.
 *
 * **Why this file exists at all, rather than the table living in `StatIcon.tsx`
 * where it started.** That file imports `@expo/vector-icons`, which drags in
 * React Native's Flow syntax that root Vitest cannot parse — so the words were
 * untestable, and a rename touching seven call sites had nothing to fail
 * against. This module imports one *type* and nothing else, which is the same
 * split `read-types.ts`/`disclosure.ts` and `buffer.ts`/`milestone-store.ts`
 * already use for the same reason. Keep it zero-runtime-import.
 */
export const STAT_NAMES: Record<CoreStat, string> = {
  AGI: 'Motion',
  STR: 'Body',
  MND: 'Mind',
};

/**
 * A character's build, named.
 *
 * Here rather than in a second table on the home screen, which is what it
 * replaces: `DOMINANCE_LABELS` held its own copy of the three stat words plus
 * `'All-Rounder'`, so the rename would have had to land in two places and the
 * second one is the one that gets missed. `Dominance` is
 * `CoreStat | 'balanced' | null`, so a single function covers the whole type
 * and a parallel table cannot drift.
 *
 * Null for an unstarted character *and* for a query still in flight, which are
 * the same thing to a caller that has nothing to draw: naming a build for
 * someone who has done nothing would cheapen the one visual §6 says must be
 * earned.
 */
export function dominanceName(dominance: Dominance | undefined): string | null {
  if (dominance === undefined || dominance === null) return null;
  if (dominance === 'balanced') return 'All-Rounder';
  return STAT_NAMES[dominance];
}

import type { CoreStat, Dominance } from '@kairo/core';

/**
 * "Your lane" — the stat the character screen speaks to first.
 *
 * **Presentation only.** The lane stat is highlighted and its empty bar speaks
 * that stat's language, and that is the whole of it. What actually changes
 * points is the squad's program, which is a different thing consented to at a
 * different moment.
 *
 * It used to read `profiles.focus`, a question asked once in onboarding. That
 * column is gone (2026-08-10): a self-declared focus and a squad program were
 * two answers to the same question, only one of them meant anything, and the
 * onboarding step bought a highlight. The lane now comes from **dominance** —
 * the stat the user has actually been grinding over the last fortnight, which
 * `useDominantStat` already computes for the build label above it.
 *
 * That is a better input than the one it replaces: it cannot go stale, it needs
 * no question, and it describes what someone does rather than what they said
 * they would do.
 */

/**
 * `'balanced'` deliberately yields no lane. It is the answer "a bit of
 * everything", and picking a stat to speak for someone whose four are level
 * would be inventing a preference they have not shown.
 */
export function laneStat(dominance: Dominance | undefined): CoreStat | null {
  if (dominance === undefined || dominance === null || dominance === 'balanced') {
    return null;
  }
  return dominance;
}

/**
 * What an empty lane bar says, in the lane's own language.
 *
 * Named for the activity, not the stat: "Your next run" is something a person
 * can go and do, where "your next AGI" is not.
 */
const LANE_EMPTY_COPY: Record<CoreStat, string> = {
  AGI: 'Your next walk or run fills this bar.',
  STR: 'Your next session fills this bar.',
  END: 'Your next workout fills this bar.',
  VIT: 'Moving on the hour fills this bar.',
  MND: 'Rest is training too. Sleep tonight and Mind starts moving.',
};

export function laneEmptyCopy(dominance: Dominance | undefined): string | null {
  const stat = laneStat(dominance);
  return stat === null ? null : LANE_EMPTY_COPY[stat];
}

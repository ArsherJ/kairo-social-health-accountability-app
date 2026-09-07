import { SHIELD_MINIMUM_STREAK } from '@kairo/core';

/**
 * What the You tab's shield pill says (§19).
 *
 * A zero-runtime-import decision the card only performs, the house pattern —
 * and here it earns it twice over, because the sentence was wrong. The card
 * read `shield_available_on === null` as "a shield is banked" and said so, but
 * that column means only that *none is recharging*: it is null from the first
 * scored day, and `advanceStreak` additionally requires
 * `currentStreak >= SHIELD_MINIMUM_STREAK` before a shield will catch anything.
 * So the first promise a new account read on the You tab — "one missed day is
 * safe" — was false for the first four days of every account's life, on the
 * one mechanic whose whole value is being believed *before* the day it is
 * needed.
 *
 * The two halves of `advanceStreak`'s eligibility are both stated here, and
 * the order between them is deliberate: **a pending recharge is named first,
 * at any streak length.** It is the binding constraint and it was never the
 * false half — a spent shield catches nothing however long the streak grows,
 * and a streak that breaks after one is spent reaches five days again a
 * fortnight before the charge returns. Naming only the streak bar there would
 * be the same understatement in a second place.
 *
 * `banked` is the same fact the pill's own styling used to derive separately
 * from the raw column, so the words and the colour cannot disagree about
 * whether a shield is in hand.
 */

/**
 * The streak row, in the two respects this decision reads.
 *
 * A structural subset rather than an import of `Streak` from `queries.ts`:
 * that module pulls in `@/lib/supabase.ts`, which root Vitest resolves
 * neither the alias nor the native client for.
 */
export interface ShieldStreak {
  current_streak: number;
  /** The date the next shield returns. Null means none is recharging. */
  shield_available_on: string | null;
}

export interface ShieldNote {
  text: string;
  /** True only when a miss today would actually be caught. */
  banked: boolean;
}

export function shieldNote(streak: ShieldStreak | null | undefined): ShieldNote {
  // No row at all: the streak row is written on the first scoring day, so this
  // is a new account rather than a failure. Nothing to say about a shield yet.
  if (!streak) return { text: 'Score once to start a streak', banked: false };

  if (streak.shield_available_on !== null) {
    return { text: `Shield recharges ${streak.shield_available_on}`, banked: false };
  }

  if (streak.current_streak < SHIELD_MINIMUM_STREAK) {
    // States the bar rather than a promise. The figure is derived, never a
    // literal `5`: the sentence and `advanceStreak`'s eligibility are one
    // rule, and a second number describing it is how they drift.
    return {
      text: `Shield unlocks at a ${SHIELD_MINIMUM_STREAK}-day streak`,
      banked: false,
    };
  }

  return { text: 'Shield banked — one missed day is safe', banked: true };
}

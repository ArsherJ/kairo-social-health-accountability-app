import { CORE_STATS, type CoreStat } from '@kairo/core';

/**
 * A squadmate's row, said out loud.
 *
 * The row draws twelve or more separate pieces — rank, avatar, name, a YOU
 * chip, level, streak, a flag, a boost chip, four glyph-and-number pairs, and
 * the total. Left as separate elements that is twelve stops per person, so
 * hearing a full six-person board takes seventy-odd swipes and the ranking —
 * the entire point of the screen — arrives in fragments.
 *
 * Collapsing the row into one element fixes that, and then the order of this
 * string *is* the reading order. It follows the eye rather than the DOM: rank,
 * who, how much. The ratings come last because they are the detail you go
 * looking for, not the thing you scan.
 *
 * Pure, and tested in Node, for the same reason `program-copy.ts` and
 * `invite-message.ts` are: the conditionals here are the kind that read as
 * obviously right and are wrong at the edges — a one-day streak, an absent
 * rating, yourself in first place.
 */

export interface RowLabelInput {
  rank: number;
  characterName: string;
  isSelf: boolean;
  level: number;
  total: number;
  /** Already-derived ability ratings, per stat. */
  ratings: Partial<Record<CoreStat, number>>;
  /** Omitted on the completed board, where it would describe the wrong day. */
  streakDays?: number;
  flagged?: boolean;
  /** The program boost chip, shown only on your own row. */
  boost?: string | null;
  /** True when the day has not finalised and the board says so. */
  provisional?: boolean;
  /** Full stat names, injected so this module imports no UI. */
  statNames: Record<CoreStat, string>;
}

export function leaderboardRowLabel(input: RowLabelInput): string {
  const parts: string[] = [];

  // "Rank 1, Jay, you" — position first, because position is what a
  // leaderboard is. Saying the name first would make every row sound the same
  // for the first second.
  parts.push(`Rank ${input.rank}`);
  parts.push(input.isSelf ? `${input.characterName}, you` : input.characterName);
  parts.push(`${input.total.toLocaleString()} points`);
  parts.push(`Level ${input.level}`);

  if (input.streakDays !== undefined && input.streakDays > 0) {
    // "1-day streak" is what the row draws and it is wrong out loud.
    parts.push(input.streakDays === 1 ? '1 day streak' : `${input.streakDays} day streak`);
  }

  if (input.provisional) parts.push('not final yet');

  // §20's social anti-cheat marker. Said plainly rather than softened: it is a
  // note the squad can already see, and a screen reader that omitted it would
  // be hiding something sighted members are looking at.
  if (input.flagged) parts.push('flagged');

  if (input.boost) parts.push(input.boost);

  // Only stats the row actually has a number for. A missing rating is not zero
  // — the RPC can return a partial map — and "Vitality 0" would state
  // something the screen does not.
  const ratings = CORE_STATS.filter((stat) => input.ratings[stat] !== undefined).map(
    (stat) => `${input.statNames[stat]} ${input.ratings[stat]}`,
  );
  if (ratings.length > 0) parts.push(ratings.join(', '));

  // Commas, so VoiceOver pauses between fields instead of running the rank
  // into the name as one number-word.
  return parts.join(', ');
}

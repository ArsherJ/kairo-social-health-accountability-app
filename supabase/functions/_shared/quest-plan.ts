import { pickQuests, questMet, questTier, type QuestDay, type QuestTier } from './core.ts';

/**
 * The quest half of the `finalize-days` pass, kept free of I/O so it can be
 * tested in plain Node with no Deno, no Docker and no database.
 *
 * The handler reads the finalized day's raw totals and the account's tier; this
 * module decides which of the three quests that day offered were cleared.
 * Nothing here writes, and nothing here re-implements the quest rules —
 * `pickQuests()` and `questMet()` in `@kairo/core` are the single
 * implementation, called by both this and the client (deviation #18's rule in a
 * new place).
 */

export interface QuestCompletionRow {
  user_id: string;
  local_date: string;
  quest_id: string;
  xp_awarded: number;
}

/**
 * Which of this user's quests the finalized day cleared.
 *
 * **The tier must be the one the user was shown**, which is why
 * `tierOverride` is a required argument with no default: grading against the
 * automatic tier for someone who set an override would pay them for quests that
 * were never on their screen, and a completion latches. `questTier()` applies
 * the same precedence the client does — the override wins outright.
 *
 * `alreadyCompleted` is the cheap filter, not the guarantee: the insert carries
 * `on conflict do nothing` and the primary key is what makes a double-latch
 * impossible under overlapping cron runs.
 */
export function planQuestCompletions(input: {
  userId: string;
  localDate: string;
  trailingScoredDays: number;
  tierOverride: QuestTier | null;
  /**
   * `profiles.has_sleep_source`, read from the same row `tierOverride` comes
   * from — **never re-derived here.**
   *
   * The client draws the quests and this function grades them. Both read that
   * one column, exactly as both read `quest_tier_override`, and for exactly the
   * same reason: a disagreement pays XP for a quest that was never on screen,
   * and the completion latches. Deriving capability locally would be a second
   * answer to a question that already has one.
   */
  hasSleep: boolean;
  day: QuestDay;
  alreadyCompleted: ReadonlySet<string>;
}): QuestCompletionRow[] {
  const tier = questTier({
    trailingScoredDays: input.trailingScoredDays,
    override: input.tierOverride,
  });

  const rows: QuestCompletionRow[] = [];
  for (const quest of pickQuests({
    userId: input.userId,
    localDate: input.localDate,
    tier,
    hasSleep: input.hasSleep,
  })) {
    if (input.alreadyCompleted.has(quest.id)) continue;
    if (!questMet(quest, input.day)) continue;
    rows.push({
      user_id: input.userId,
      local_date: input.localDate,
      quest_id: quest.id,
      xp_awarded: quest.xp,
    });
  }
  return rows;
}

import { useQuery } from '@tanstack/react-query';
import {
  pickQuests,
  questProgress,
  questTier,
  type QuestDay,
  type QuestDef,
  type QuestState,
  type QuestTier,
} from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';

export const questCompletionsKey = (
  userId: string | undefined,
  localDate: string | undefined,
) => ['quests', 'completions', userId ?? 'none', localDate ?? 'none'] as const;

/**
 * Which of today's quests have already latched.
 *
 * Server-written and read here only so a cleared quest keeps its tick after
 * finalization — before that, the card reads `met` from live progress. Two
 * sources for one boolean is deliberate: the latch is what pays XP and lags the
 * day by about two hours, and a card that showed nothing until then would look
 * broken all afternoon.
 *
 * `quest_completions` is owner-readable only, so no `user_id` filter is needed
 * for correctness — RLS is the filter. It is omitted rather than added because
 * a redundant one would read as though the table were shared.
 */
export function useQuestCompletions(
  userId: string | undefined,
  localDate: string | undefined,
) {
  return useQuery({
    queryKey: questCompletionsKey(userId, localDate),
    enabled: Boolean(userId && localDate),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('quest_completions')
        .select('quest_id')
        .eq('local_date', localDate as string);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.quest_id as string);
    },
  });
}

export interface TodayQuest {
  quest: QuestDef;
  state: QuestState;
}

/**
 * Today's three, with their live progress.
 *
 * **No fetch of its own for the quests themselves** — `pickQuests()` is pure,
 * so the three are computed from the account id and the local date. That is
 * the whole reason quests need no table and no midnight job.
 *
 * The tier read here MUST match the one `finalize-days` grades against
 * (`quest-plan.ts`): the same override precedence and the same lifetime scored
 * day count. If the two disagree, the server pays for quests that were never on
 * screen, and a completion latches.
 *
 * Not a hook — a plain function over data the caller already holds. It reads no
 * cache and calls no hook of its own, so it cannot change the hook count of the
 * frame a tier override lands in.
 */
export function todayQuests(input: {
  userId: string | undefined;
  localDate: string | undefined;
  scoredDays: number;
  tierOverride: QuestTier | null;
  day: QuestDay | undefined;
  completedIds: readonly string[];
}): TodayQuest[] {
  if (!input.userId || !input.localDate) return [];

  const tier = questTier({
    trailingScoredDays: input.scoredDays,
    override: input.tierOverride,
  });

  const day: QuestDay = input.day ?? {
    steps: 0,
    activeKcal: 0,
    activeHours: 0,
    distanceM: 0,
    sleepMinutes: null,
  };

  return pickQuests({ userId: input.userId, localDate: input.localDate, tier }).map((quest) => {
    const state = questProgress(quest, day);
    return {
      quest,
      // A latched completion wins over live progress: a downward Apple
      // revision must never un-tick a quest the account was already paid for,
      // which is §19's rule and the reason completions latch at all.
      state: input.completedIds.includes(quest.id)
        ? { ...state, met: true, fraction: 1 }
        : state,
    };
  });
}

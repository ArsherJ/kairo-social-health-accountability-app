import { useQuery } from '@tanstack/react-query';
import { DEMO_STREAK } from '@/features/demo/fixtures.ts';
import { demoResult, useDemoOn } from '@/features/demo/useDemo.ts';
import { supabase } from '@/lib/supabase.ts';
import type { SpeciesId } from '@/features/character/species.ts';

/**
 * The owner-readable profile. `profiles` is deliberately not readable by
 * squadmates — the row carries height, weight and birth year — so this is only
 * ever the signed-in user's own row.
 */
export type Profile = {
  id: string;
  character_name: string;
  class: string;
  /**
   * Which character the player chose at onboarding (§6, cosmetic only).
   * Null for every profile created before the choice existed — those render
   * the male anchor, which is what they already showed.
   */
  character_body: 'male' | 'female' | null;
  /**
   * Which animal species the player's character is (§6, cosmetic only).
   * Null when the choice screen was bypassed — the column is nullable for it.
   */
  species: SpeciesId | null;
  timezone: string;
  level: number;
  total_xp: number;
  /**
   * Lifetime points per stat — rollups on `profiles`, maintained by the same
   * trigger as `total_xp` and never client-writable. `ratingForStatPoints()`
   * turns each into the ability number the character sheet shows in place of a
   * Bronze/Silver/Gold medal.
   */
  agi_total: number;
  str_total: number;
  /**
   * `mnd_total`, not `mind_total`. The rollup column is spelled to match the
   * `CoreStat` id while the score column it sums is `daily_scores.mind_points`
   * — a deliberate split that has already produced one live bug, so read the
   * name rather than deriving it. `end_total` and `vit_total` were dropped
   * with deviation #41's contract migration.
   */
  mnd_total: number;
  /**
   * When the account was created. Rendered as "Joined August 2026" on the You
   * tab and nowhere else, so only the month and year are ever shown — a join
   * *date* is a precise fact about a person that no surface here needs.
   */
  created_at: string;
  /**
   * Observed by `sync-health` from the presence of sleep data, not claimed by
   * the client — the column has no client write grant.
   */
  has_wearable: boolean;
  /**
   * Server-owned; everyone is free at MVP. Read here so the daily item grant
   * has one code path rather than a Legendary special case invented later.
   */
  is_legendary: boolean;
  // Body metrics (§5). Owner-only columns on an owner-only row, and null until
  // the user answers the soft prompt — never required, never asked twice.
  height_cm: number | null;
  weight_kg: number | null;
  birth_year: number | null;
  sex: 'male' | 'female' | 'other' | null;
  /**
   * Opted into each Challenge area, both off by default (§7.9 of the
   * solo-mode design). Off means the area is not shown as a live challenge at
   * all — a non-runner never meets a permanently unmet Run card.
   */
  trains_run: boolean;
  trains_strength: boolean;
  /**
   * The player's chosen quest difficulty, or null to let `questTier()` decide
   * from trailing scored days. **Null is the normal case, not an error case.**
   *
   * `finalize-days` reads the same column and grades against the same
   * `questTier()`, override precedence included. If the two ever resolve
   * different tiers the server pays XP for quests that were never on screen,
   * and a completion latches.
   */
  quest_tier_override: 'starter' | 'steady' | 'strong' | null;
  /**
   * Whether this account has a sleep source, and so whether Mind is earnable
   * and a `sleep_minutes` quest is winnable at all.
   *
   * **Server-written.** `sync-health` maintains it and it is deliberately
   * absent from `profiles`' column-level UPDATE grant, so the client can read
   * it and nothing more. `finalize-days` grades quests against this same
   * column, which is the whole reason it is stored rather than derived on each
   * side: two derivations that disagree pay XP for a quest that was never on
   * screen.
   */
  has_sleep_source: boolean;
};

export function profileKey(userId: string | undefined) {
  return ['profile', userId ?? 'none'] as const;
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: profileKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, character_name, class, character_body, timezone, level, total_xp, has_wearable, ' +
            'agi_total, str_total, mnd_total, ' +
            'is_legendary, height_cm, weight_kg, birth_year, sex, ' +
            'trains_run, trains_strength, species, quest_tier_override, ' +
            'has_sleep_source, created_at',
        )
        .eq('id', userId as string)
        .maybeSingle();

      if (error) throw new Error(error.message);
      // null is meaningful: it is what "onboarding not finished" looks like.
      return (data as Profile | null) ?? null;
    },
  });
}

/**
 * The caller's streak row (§19).
 *
 * `shield_available_on` null means a Streak Shield is banked right now — see
 * the column comment in `20260727120300_progression_and_infra.sql`. Turning
 * the biggest churn event into a relief moment is the point, so the profile
 * screen says out loud whether one is in hand.
 */
export type Streak = {
  current_streak: number;
  longest_streak: number;
  last_scored_date: string | null;
  shield_available_on: string | null;
};

export function streakKey(userId: string | undefined) {
  return ['streak', userId ?? 'none'] as const;
}

export function useStreak(userId: string | undefined) {
  // `enabled` is dropped too, not just the result: a doomed request against a
  // fixture the user is already looking at is noise in the network log.
  const demo = useDemoOn();
  const query = useQuery({
    queryKey: streakKey(userId),
    enabled: !demo && Boolean(userId),
    queryFn: async (): Promise<Streak | null> => {
      const { data, error } = await supabase
        .from('streaks')
        .select('current_streak, longest_streak, last_scored_date, shield_available_on')
        .eq('user_id', userId as string)
        .maybeSingle();

      if (error) throw new Error(error.message);
      // The row is written on the first scoring day, so a user who has never
      // scored simply has none. That is zeros, not an error.
      return (data as Streak | null) ?? null;
    },
  });

  return demo ? demoResult<Streak | null>(DEMO_STREAK) : query;
}

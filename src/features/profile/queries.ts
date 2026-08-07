import { useQuery } from '@tanstack/react-query';
import type { UserFocus } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';

/**
 * The owner-readable profile. `profiles` is deliberately not readable by
 * squadmates — the row carries height, weight and birth year — so this is only
 * ever the signed-in user's own row.
 */
export type Profile = {
  id: string;
  character_name: string;
  class: string;
  timezone: string;
  level: number;
  total_xp: number;
  /**
   * Observed by `sync-health` from the presence of sleep data, not claimed by
   * the client — the column has no client write grant.
   */
  has_wearable: boolean;
  /**
   * Self-declared training focus. Presentation only: it highlights a stat and
   * changes copy, and touches no scoring. Null means skipped or never asked.
   */
  focus: UserFocus | null;
  // Body metrics (§5). Owner-only columns on an owner-only row, and null until
  // the user answers the soft prompt — never required, never asked twice.
  height_cm: number | null;
  weight_kg: number | null;
  birth_year: number | null;
  sex: 'male' | 'female' | 'other' | null;
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
          'id, character_name, class, timezone, level, total_xp, has_wearable, ' +
            'focus, height_cm, weight_kg, birth_year, sex',
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
  return useQuery({
    queryKey: streakKey(userId),
    enabled: Boolean(userId),
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
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
import { summarizeTodayStrength, type TodayStrengthRow } from './today-strength-model.ts';

/**
 * Today's own workout evidence, for the Living Mirror's Body detail row and its
 * one workout reaction.
 *
 * **Owner-readable only, and in no projection.** `workout_sessions` carries a
 * pace, and with distance a routine — at least as identifying as the hourly
 * movement §5 protects — so this stays a direct read of the caller's own rows
 * and its result never reaches a squadmate, a leaderboard or a telemetry
 * payload.
 *
 * A one-day window, unlike `useWorkoutSessions`, which reads the whole
 * Challenge window: these two answer different questions and share no key.
 */

export const todayStrengthKey = (userId: string | undefined, localDate: string | undefined) =>
  ['today-strength', userId ?? 'none', localDate ?? 'none'] as const;

export function useTodayStrengthSummary(userId: string | undefined, localDate: string | undefined) {
  return useQuery({
    queryKey: todayStrengthKey(userId, localDate),
    enabled: Boolean(userId && localDate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('hk_uuid, started_at, activity_type, duration_s, source_bundle_id, was_user_entered, has_heart_rate_evidence')
        .eq('user_id', userId as string)
        .eq('local_date', localDate as string);
      if (error) throw new Error(error.message);
      const rows: TodayStrengthRow[] = (data ?? []).map((row) => ({
        hkUuid: String(row.hk_uuid),
        startedAt: String(row.started_at),
        activityType: Number(row.activity_type),
        // `numeric`/`integer` columns arrive as strings over PostgREST — the
        // silent source of string concatenation where arithmetic was meant.
        durationS: Number(row.duration_s ?? 0),
        sourceBundleId: row.source_bundle_id ?? null,
        wasUserEntered: Boolean(row.was_user_entered),
        hasHeartRateEvidence: Boolean(row.has_heart_rate_evidence),
      }));
      return summarizeTodayStrength(rows);
    },
  });
}

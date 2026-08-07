import { supabase } from '@/lib/supabase.ts';

/**
 * Client telemetry into `app_events` (§11).
 *
 * This is the behavioural dataset §15's four risk questions get answered from,
 * and it is impossible to backfill — a beta that ran without it is a beta whose
 * questions stay open.
 *
 * **Fire and forget, and it never throws.** Telemetry that can break a screen
 * is worse than no telemetry: a dropped event costs one row in an analysis, a
 * thrown one costs the user their onboarding. The `app_events_insert_own`
 * policy already grants the client INSERT on its own rows, so there is no
 * server change behind this.
 */
export type AppEventType =
  | 'focus_selected'
  | 'focus_skipped'
  | 'first_sync_seen'
  | 'squad_program_selected'
  // Read by dispatch-notifications, not only by analysis: §14's "Day starts"
  // fires mid-morning *only if the app has not been opened yet*, and this row
  // is the entire signal behind that condition.
  | 'app_open';

export function track(
  userId: string | undefined,
  type: AppEventType,
  payload: Record<string, unknown> = {},
): void {
  if (!userId) return;
  void supabase
    .from('app_events')
    .insert({ user_id: userId, type, payload })
    .then(({ error }) => {
      if (error) console.warn('[telemetry]', type, error.code, error.message);
    });
}

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
  | 'first_sync_seen'
  | 'squad_program_selected'
  // Read by dispatch-notifications, not only by analysis: §14's "Day starts"
  // fires mid-morning *only if the app has not been opened yet*, and this row
  // is the entire signal behind that condition.
  | 'app_open'
  // The two failures that used to leave no trace anywhere. Both are silent by
  // construction rather than by oversight — the app looks fine while the thing
  // it depends on is not working — so the event row is the only evidence a
  // beta report can be checked against.
  | 'timezone_sync_failed'
  | 'health_permission_failed';

/**
 * Fire-and-forget by design — telemetry must never block or fail a user
 * action — but it **reports** its outcome, which is not the same thing.
 *
 * The returned promise resolves `true` only when the row actually landed.
 * Callers that dedupe (`useAppOpenTelemetry`) need it: marking an event as
 * sent when the write failed suppresses every retry for the rest of the
 * session, which turns one dropped row into a whole missing day. Callers with
 * nothing to dedupe can keep ignoring the return, exactly as before — it never
 * rejects, so an ignored promise cannot become an unhandled rejection.
 */
export async function track(
  userId: string | undefined,
  type: AppEventType,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  if (!userId) return false;

  // `await`ed rather than `.then()`-chained because PostgREST's builder is a
  // thenable, not a Promise — chaining it yields `PromiseLike<boolean>`, which
  // has no `.catch`, and callers would inherit that sharp edge.
  const { error } = await supabase
    .from('app_events')
    .insert({ user_id: userId, type, payload });

  if (error) {
    console.warn('[telemetry]', type, error.code, error.message);
    return false;
  }
  return true;
}

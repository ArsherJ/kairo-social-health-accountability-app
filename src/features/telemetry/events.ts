import { supabase } from '@/lib/supabase.ts';
import { bufferEvent, drainBuffer, type BufferedEvent } from './buffer.ts';

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
  | 'health_permission_failed'
  // The activation funnel. Added 2026-08-16; before it, the beta could measure
  // retention (SQL over daily_scores) but not activation, so the six-week test
  // the outside review asked for could not be run at all.
  | 'onboarding_started'
  // Payload carries the resulting HealthPermissionState and **never** a
  // granted/denied verdict: HealthKit does not report read-permission denial,
  // and an event asserting otherwise would be believed.
  | 'health_ask_completed'
  | 'profile_created'
  | 'first_score_seen'
  | 'squad_created'
  | 'squad_joined'
  | 'goal_created'
  | 'disclosure_unlocked';

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
/**
 * Events recorded before a session exists. Module state rather than MMKV: this
 * spans one launch of the app, and an event that did not survive a cold start
 * belongs to a session that never signed in.
 */
let pending: BufferedEvent[] = [];

export async function track(
  userId: string | undefined,
  type: AppEventType,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  // Held rather than dropped, and flushed by flushTelemetryBuffer once the
  // session arrives. `false` still means "no row landed", which is what
  // callers that dedupe are asking about.
  if (!userId) {
    pending = bufferEvent(pending, { type, payload, occurredAt: Date.now() });
    return false;
  }

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

/**
 * Attribute everything buffered before sign-in to the session that just began.
 *
 * `occurred_at` is written explicitly from the buffered timestamp rather than
 * taking the column default, or every pre-auth event would land stamped with
 * the moment the user finished authenticating — which is precisely the interval
 * the pitch screen is being measured on.
 *
 * The buffer is drained **before** the write. A failed flush loses the events
 * rather than retrying: they are one screen's worth of context, and a retry
 * loop against a backend that is refusing writes is worse than the gap.
 */
export async function flushTelemetryBuffer(userId: string): Promise<void> {
  const { drained, next } = drainBuffer(pending);
  pending = next;
  if (drained.length === 0) return;

  const { error } = await supabase.from('app_events').insert(
    drained.map((event) => ({
      user_id: userId,
      type: event.type,
      payload: event.payload,
      occurred_at: new Date(event.occurredAt).toISOString(),
    })),
  );

  if (error) console.warn('[telemetry] flush', error.code, error.message);
}

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
  // Analysis only, as of 2026-08-25. It used to be read by
  // dispatch-notifications as well — §14's "Day starts" fired mid-morning only
  // if the app had not been opened yet — and that trigger is retired with the
  // other two (deviation #52). The digest is sent whether or not the app is
  // open, because it carries yesterday's *result*, which the screen does not
  // show.
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
  //
  // Step 0, and the only one that fires with **no session at all** — it is the
  // sign-in screen's own render, before anything has been asked for. Buffered
  // by `track` and attributed by `flushTelemetryBuffer` with this timestamp,
  // not the flush time, so the interval it measures (pitch read → decision) is
  // the real one. It is the denominator every later step is a fraction of.
  | 'pitch_seen'
  | 'onboarding_started'
  // Payload carries the resulting HealthPermissionState and **never** a
  // granted/denied verdict: HealthKit does not report read-permission denial,
  // and an event asserting otherwise would be believed.
  | 'health_ask_completed'
  // The other half of the health step, and the reason it has a denominator at
  // all. `health_ask_completed` fires only on success, so until this existed a
  // user who dismissed the sheet and a user who was never offered it produced
  // identical event sequences — leaving the step the design calls the
  // activation bottleneck with no measurable drop-off.
  | 'health_ask_dismissed'
  | 'profile_created'
  | 'first_score_seen'
  | 'squad_created'
  | 'squad_joined'
  /**
   * A Battle started. Payload `{ kind, difficulty }` and **never the target** —
   * a boss's HP is derived from the squad's own history and is the squad's own
   * number, the rule `goal_created` already followed. Difficulty answers
   * whether squads reach for a fight they can win.
   */
  | 'event_created'
  // **Historical.** Retired on 2026-08-25 when Goals became Events
  // (deviation #45). Nothing emits it any more; the name stays because
  // `app_events` already holds rows saying it, and `kairo_retention()`
  // reads that table over a trailing window that still spans the change.
  | 'goal_created'
  // Fired by `useDisclosure` the first time an account crosses
  // `DISCLOSURE_THRESHOLD_DAYS` scored days. Once-ever, marked in MMKV: the
  // stage is *derived* from a day count rather than stored, so without the
  // marker this would re-fire on every launch afterwards and become a launch
  // counter. It is the first honest read on whether the core loop holds.
  | 'disclosure_unlocked'
  // ---------------------------------------------------------------------
  // The moments the post-pivot loop turns on (deviation #44).
  //
  // `kairo_retention()` is deliberately NOT re-pointed alongside these: it
  // measures whether a `daily_scores` row exists on cohort day + N, and the
  // pivot redefined what the app *shows*, not what counts as an active day.
  // Rewriting that denominator would make every measurement taken before
  // 2026-08-25 incomparable to every one after — which is the opposite of what
  // a pivot's instrumentation is for, and the reason every chart can be split
  // on the pivot date and still mean something. What was genuinely stale is the
  // funnel vocabulary, which is these four.
  // ---------------------------------------------------------------------
  /**
   * Someone agreed to show squadmates their daily totals (deviation #47).
   *
   * The funnel step spec §13 flags as the highest risk in the whole pivot: the
   * race cannot draw a lane for a member who has not consented. If join
   * conversion falls materially, the fallback is steps and distance only — and
   * this event is how that is measured rather than guessed.
   */
  | 'squad_data_consent_granted'
  /**
   * The account saw a race with somebody in it — a squad's or its own ghosts'.
   *
   * **Once per local day**, on `daily-marker.ts`, not on every render: fired on
   * render it would measure scrolling rather than engagement. It is the cohort
   * split the pivot exists to answer — does a user who saw a race come back
   * tomorrow more often than one who did not?
   */
  | 'race_seen'
  /**
   * A quest's bar was met. Payload `{ tier }`, **never the quest id**: a tier
   * answers "are the bars set right", where an id would make the table a
   * per-quest leaderboard nobody asked for.
   *
   * Once per local day per slot, so re-opening the tab in the afternoon does
   * not count a quest twice.
   */
  | 'quest_cleared'
  // ---------------------------------------------------------------------
  // The Living Mirror beta (deviation #59). Today stopped being a dashboard,
  // so the questions changed: does the one visible next step get acted on, and
  // does anybody open the details they used to be shown unasked?
  //
  // **Category only, never a figure.** The rule `quest_cleared` set — it
  // carries `{ tier }` and never a quest id — applies here in a stricter form:
  // no payload may carry a health value, an occurrence id, **or the Motion
  // location**, because a five-band location is a coarse step count. If
  // band-level breakdown turns out to matter after the week-one interviews,
  // that is a deliberate decision with a privacy review attached.
  //
  // `kairo_retention()` is deliberately not re-pointed at any of these, for
  // the same reason it was not re-pointed at the pivot's four: it measures
  // whether a `daily_scores` row exists on cohort day + N, and what counts as
  // an active day did not move.
  // ---------------------------------------------------------------------
  /**
   * The Living Mirror was on screen with its three quests resolved. **Once per
   * the account's own local day** — the denominator the two below are read
   * against. Fired on render it would measure scrolling.
   */
  | 'today_seen'
  /**
   * The one visible prompt named a step. Payload `{ category }`, one of
   * `motion`, `body` or `none` — `none` being the rest sentence, which is a
   * real and deliberate state rather than a missing value. **Once per local
   * day**, so re-opening the tab in the afternoon does not count twice.
   */
  | 'next_step_shown'
  /**
   * Somebody opened the details sheet. **Per tap**, not per day: the question
   * is whether the complete day is wanted at all, and how often.
   */
  | 'today_details_opened'
  /**
   * A bounded reaction was actually presented. Payload `{ kind }` — `level`,
   * `record`, `daily_walk`, `workout` or `motion_location`. **Per
   * occurrence**, because that is what one reaction is, and it is emitted from
   * the hook that presents it rather than from a render.
   */
  | 'character_reaction_seen'
  /**
   * The notification ask was answered. Payload `{ answer }`, one of `granted`,
   * `declined` or `deferred` — `deferred` being "Not now", which dismisses the
   * sheet without reaching `requestNotificationPermission` and so leaves the
   * player askable again.
   *
   * **Per answer, not once ever.** The sheet's dismissal is per-session, so a
   * deferral can genuinely recur and a once-ever marker would record only the
   * first of them. `granted` and `declined` are terminal by construction: iOS
   * grants one dialog per install, so `shouldAskForNotifications` returns false
   * for every permission it has an answer for.
   *
   * It exists to judge the 2026-09-04 widening against real grant rates — the
   * solo cohort was structurally excluded from this ask, and "more players see
   * it" is only an improvement if they say yes.
   */
  | 'notification_ask_answered'
  /**
   * One beat of the onboarding run was shown. Payload `{ route }` and nothing
   * else — the route name is the beat's identity and the only thing the funnel
   * needs.
   *
   * **Unguarded, on mount.** Onboarding runs once per account by construction
   * — the profile row commits on the name beat and `resolveRoute` never sends
   * a `ready` account back into `(onboard)` — so the funnel is honest without a
   * marker store, and a duplicate from backing up and forward again is absorbed
   * by counting *distinct* beats. Seven once-ever milestone keys was the
   * alternative and buys a guarantee this measurement does not need.
   *
   * It exists because the run got longer. `onboarding_started` fires on the
   * connect beat and `profile_created` at the end, so every beat between them
   * was invisible: the cost of adding one was unmeasurable, which is exactly
   * the thing a curation pass has to be able to see.
   *
   * The hatch reports nothing — it is a phase of `/connect`, whose own
   * impression already covers the moment.
   */
  | 'onboarding_beat_seen'
  /**
   * The Health grant's step reading landed. Payload `{ outcome }`, one of
   * `proposed` or `no-history` — and **nothing else**.
   *
   * Not the median, which never leaves the phone, and **not the tier it
   * proposed**: the question is whether calibration can read a new account at
   * all, and a tier breakdown would be a distribution of the cohort's fitness
   * sitting in `app_events` to answer a question nobody asked. The rule
   * `quest_cleared` set — a category, never a figure — in its strictest form.
   *
   * **Once ever**, on an MMKV marker, because the reading is not: re-entering
   * `/connect` and granting again re-runs it, and a second row would make the
   * denominator count taps. The payload is built inside `runCalibration` rather
   * than at the call site, so no screen can reach it.
   */
  | 'calibration_completed';

/**
 * Events recorded before a session exists. Module state rather than MMKV: this
 * spans one launch of the app, and an event that did not survive a cold start
 * belongs to a session that never signed in.
 */
let pending: BufferedEvent[] = [];

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

/**
 * Drop everything buffered pre-sign-in, without flushing it.
 *
 * Called from `signOut()`. Without this, a shared device produces a real
 * misattribution once a pre-auth screen exists to buffer from: user A signs
 * out with events still pending, user B signs in on the same device, and the
 * next flush attributes A's buffered rows — with A's timestamps — to B's
 * account. No call site can hit this today (every current `track()` call
 * site has a real `userId`), but sign-out is exactly the wrong place to
 * discover that the guard was missing once one does.
 */
export function clearTelemetryBuffer(): void {
  pending = [];
}

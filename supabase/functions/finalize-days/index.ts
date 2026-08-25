import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { fail, json } from '../_shared/http.ts';
import {
  addDays,
  advanceStreak,
  CHALLENGE_WINDOW_DAYS,
  type ChallengeArea,
  type StreakState,
  type WorkoutSession,
} from '../_shared/core.ts';
import { rescoreDay } from '../_shared/rescore.deno.ts';
import {
  planEventCompletions,
  type EventRow,
} from '../_shared/event-plan.ts';
import { planChallengeCompletions } from '../_shared/challenge-plan.ts';
import {
  challengeClearedCopy,
  eventCompletedCopy,
} from '../_shared/notification-copy.ts';
import { sendToUser } from '../_shared/push.deno.ts';

/**
 * finalize-days — the only place a day's competition is declared over.
 *
 * Runs hourly. Each user's day finalizes roughly two hours after THEIR local
 * midnight (spec §12), which gives late phone syncs a grace window without
 * letting the result stay provisional forever. Because every player has their
 * own timezone, every hour of the day is somebody's finalization hour.
 *
 * Idempotent throughout: candidates are selected on status='provisional' and
 * the streak fold refuses to apply the same day twice, so a retry or an
 * overlapping run changes nothing.
 *
 * Events latch here too, and only here: an Event completes off **final** days,
 * so the moment a day finalizes is the only moment its standing can change in a
 * way that pays XP. `on conflict do nothing` on the insert is what makes that
 * idempotent under overlapping runs — the same guard the streak fold relies on.
 *
 * Deliberately NOT here: coin awards. The MVP beta ships no coin economy (§15),
 * so milestones grant badges only. The coin ledger arrives with the V1 shop.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('CRON_SECRET');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Cap per invocation so one run cannot exceed the function time limit. */
const MAX_DAYS_PER_RUN = 500;

interface Candidate {
  user_id: string;
  local_date: string;
  timezone: string;
}

/**
 * Latch any Events this user's newly-final day completed, and notify.
 *
 * An Event completes **for the squad**, not per person: when the pooled bar is
 * met, every participant on the frozen roster is paid, including one who
 * contributed nothing (deviation #48). That is the mechanic — pooled means the
 * strong member carries — and paying only the contributors would rebuild the
 * per-member N-of-M rule the pivot removed.
 */
async function settleEvents(
  candidate: Candidate,
  out: Array<{ userId: string; eventId: string; xp: number }>,
): Promise<void> {
  const { data: partRows, error: partError } = await admin
    .from('event_participants')
    .select('event_id')
    .eq('user_id', candidate.user_id);
  if (partError) throw new Error(`participant lookup failed: ${partError.message}`);

  const eventIds = (partRows ?? []).map((r: { event_id: string }) => r.event_id);
  // Returning early rather than passing an empty array to `.in()`, which
  // PostgREST renders as `id=in.()` — a syntax error, not an empty result.
  if (eventIds.length === 0) return;

  // Only LIVE events whose window contains the finalized day. `closed_at is
  // null` is the new half: a pre-pivot Goal row survives in this table so its
  // banked XP does not vanish, and grading one would latch a completion against
  // a target measured in points that means nothing here.
  const { data: eventRows, error: eventError } = await admin
    .from('challenge_events')
    .select('id, squad_id, title, description, kind, metric, target, starts_on, ends_on')
    .in('id', eventIds)
    .is('closed_at', null)
    .lte('starts_on', candidate.local_date)
    .gte('ends_on', candidate.local_date);

  if (eventError) throw new Error(`event lookup failed: ${eventError.message}`);
  const events = (eventRows ?? []) as EventRow[];
  if (events.length === 0) return;

  // Every completion on these events, for EVERYONE — not just this user. An
  // Event completes for the squad, so the already-paid set has to be keyed by
  // (event, user) across the whole roster, or a second member's finalization
  // would plan a row for the first member all over again.
  const { data: doneRows, error: doneError } = await admin
    .from('event_completions')
    .select('event_id, user_id')
    .in('event_id', events.map((e) => e.id));
  if (doneError) throw new Error(`completion lookup failed: ${doneError.message}`);

  const alreadyCompleted = new Set(
    (doneRows ?? []).map(
      (r: { event_id: string; user_id: string }) => `${r.event_id}:${r.user_id}`,
    ),
  );

  type PlannedEvent = Parameters<typeof planEventCompletions>[0]['events'][number];
  const planned: PlannedEvent[] = [];

  for (const row of events) {
    const [{ data: rosterRows, error: rosterError }, { data: dayRows, error }] =
      await Promise.all([
        admin.from('event_participants').select('user_id').eq('event_id', row.id),
        // p_as_user is load-bearing: this runs as the service role with no JWT,
        // so auth.uid() is null and the RPC's own guard would refuse it. Same
        // affordance squad_leaderboard has for the notification cron.
        //
        // The candidate's own consent decides whether `value` comes back, and
        // it is deliberately not read: `pooledDays()` grades off `pooled_value`,
        // which the gate never withholds. Reading the other column would pool a
        // whole squad's fight to zero for anyone who has not consented.
        admin.rpc('event_progress', { p_event_id: row.id, p_as_user: candidate.user_id }),
      ]);
    if (rosterError) throw new Error(`roster lookup failed: ${rosterError.message}`);
    if (error) throw new Error(`event_progress failed: ${error.message}`);

    planned.push({
      row,
      roster: (rosterRows ?? []).map((r: { user_id: string }) => r.user_id),
      rows: (dayRows ?? []) as PlannedEvent['rows'],
    });
  }

  const completions = planEventCompletions({
    localDate: candidate.local_date,
    events: planned,
    alreadyCompleted,
  });

  if (completions.length === 0) return;

  // `ignoreDuplicates` is the one-way latch. Two overlapping runs both see the
  // same final day and both plan the same completion; exactly one row survives,
  // and the XP rollup trigger recomputes rather than increments either way.
  const { error: latchError } = await admin
    .from('event_completions')
    .upsert(
      completions.map((c) => c.row),
      { onConflict: 'event_id,user_id', ignoreDuplicates: true },
    );
  if (latchError) throw new Error(`event latch failed: ${latchError.message}`);

  for (const completion of completions) {
    out.push({
      userId: completion.row.user_id,
      eventId: completion.row.event_id,
      xp: completion.row.xp_awarded,
    });

    await admin.from('app_events').insert({
      user_id: completion.row.user_id,
      type: 'event_completed',
      payload: {
        eventId: completion.row.event_id,
        localDate: candidate.local_date,
        xpAwarded: completion.row.xp_awarded,
      },
    });
  }

  // Push, wrapped separately from the latch: a failed push must never roll back
  // a completion that has already paid XP. The squad beat the boss whether or
  // not their phone heard about it.
  //
  // **Only the user whose day just finalized is pushed here.** Every other
  // member gets theirs when their own day finalizes, which is within a few
  // hours and in their own timezone — pushing the whole squad from one
  // member's finalization would fire at 2am for anyone further east.
  for (const completion of completions) {
    if (completion.row.user_id !== candidate.user_id) continue;
    try {
      const message = eventCompletedCopy({
        title: completion.title,
        kind: completion.kind,
        xpAwarded: completion.row.xp_awarded,
      });
      const result = await sendToUser(admin, candidate.user_id, message, {
        trigger: 'event_completed',
        screen: 'events',
        eventId: completion.row.event_id,
      });
      // Logged only when a device was actually reached. The row is how the beta
      // counts what went out; it does not spend budget, because
      // `countsAgainstBudget('event_completed')` is false (BUDGET_EXEMPT).
      if (result.delivered > 0) {
        await admin.from('notification_log').insert({
          user_id: candidate.user_id,
          kind: 'event_completed',
          local_date: candidate.local_date,
        });
      }
    } catch (pushError) {
      await admin.from('app_events').insert({
        user_id: candidate.user_id,
        type: 'push_failed',
        payload: {
          trigger: 'event_completed',
          error: (pushError as Error).message,
        },
      });
    }
  }
}

/**
 * Latch any Challenges this user's newly-final day cleared, and notify.
 *
 * `finalize-days` is the only place a day becomes final, so it is the only
 * place a challenge can complete.
 *
 * The challenge itself is **derived, not stored**: resolved from this user's
 * qualifying sessions strictly before the day being judged. Only the completion
 * is written, which is what lets a retroactive Apple revision flow through for
 * free.
 */
async function settleChallenges(
  candidate: Candidate,
  now: Date,
  out: Array<{ userId: string; area: ChallengeArea; xp: number }>,
): Promise<void> {
  const { data: profileRow, error: profileError } = await admin
    .from('profiles')
    .select('trains_run, trains_strength')
    .eq('id', candidate.user_id)
    .maybeSingle();
  if (profileError) throw new Error(`opt-in lookup failed: ${profileError.message}`);

  const optIn = {
    run: profileRow?.trains_run === true,
    strength: profileRow?.trains_strength === true,
  };
  // Nothing opted into means nothing to read. Returning before the session
  // query keeps this free for every user who does not train an area.
  if (!optIn.run && !optIn.strength) return;

  // The trailing window, inclusive of the day being judged — `resolveChallenge`
  // applies the strictly-before rule itself, and `clearingSession` needs the
  // day's own sessions.
  const from = addDays(candidate.local_date, -CHALLENGE_WINDOW_DAYS);
  const { data: sessionRows, error: sessionError } = await admin
    .from('workout_sessions')
    .select('local_date, activity_type, duration_s, distance_m, active_kcal')
    .eq('user_id', candidate.user_id)
    .gte('local_date', from)
    .lte('local_date', candidate.local_date);
  if (sessionError) throw new Error(`session lookup failed: ${sessionError.message}`);

  const sessions: WorkoutSession[] = (sessionRows ?? []).map(
    (row: Record<string, unknown>) => ({
      localDate: row.local_date as string,
      activityType: Number(row.activity_type),
      // numeric columns arrive as strings over PostgREST.
      durationS: Number(row.duration_s ?? 0),
      distanceM: Number(row.distance_m ?? 0),
      activeKcal: Number(row.active_kcal ?? 0),
    }),
  );
  if (sessions.length === 0) return;

  const { data: doneRows, error: doneError } = await admin
    .from('challenge_completions')
    .select('area')
    .eq('user_id', candidate.user_id)
    .eq('local_date', candidate.local_date);
  if (doneError) throw new Error(`challenge completion lookup failed: ${doneError.message}`);

  const completions = planChallengeCompletions({
    userId: candidate.user_id,
    localDate: candidate.local_date,
    optIn,
    sessions,
    alreadyCleared: new Set(
      (doneRows ?? []).map((r: { area: string }) => r.area as ChallengeArea),
    ),
  });

  if (completions.length === 0) return;

  // `ignoreDuplicates` is the one-way latch, exactly as for Events: two
  // overlapping runs both plan the same completion and exactly one row
  // survives. The XP rollup trigger recomputes rather than increments either
  // way, so even a duplicated insert could not double-pay.
  const { error: insertError } = await admin
    .from('challenge_completions')
    .upsert(
      completions.map((c) => c.row),
      { onConflict: 'user_id,area,local_date', ignoreDuplicates: true },
    );
  if (insertError) throw new Error(`challenge insert failed: ${insertError.message}`);

  for (const completion of completions) {
    out.push({
      userId: candidate.user_id,
      area: completion.row.area,
      xp: completion.row.xp_awarded,
    });

    await admin.from('app_events').insert({
      user_id: candidate.user_id,
      type: 'challenge_cleared',
      payload: {
        area: completion.row.area,
        localDate: candidate.local_date,
        xpAwarded: completion.row.xp_awarded,
      },
    });

    // Wrapped separately from the latch, for the Events reason: a failed push
    // must never undo a completion that has already paid XP.
    try {
      const message = challengeClearedCopy(completion.challenge);
      const result = await sendToUser(admin, candidate.user_id, message, {
        trigger: 'challenge_cleared',
        screen: 'train',
        localDate: candidate.local_date,
      });
      // Logged only when a device was actually reached. Unlike
      // `event_completed`, this one **does** spend budget — a challenge clears
      // repeatedly by design, which is the recurring-nudge case BUDGET_EXEMPT
      // explicitly excludes.
      if (result.delivered > 0) {
        await admin.from('notification_log').insert({
          user_id: candidate.user_id,
          kind: 'challenge_cleared',
          local_date: candidate.local_date,
        });
      }
    } catch (pushError) {
      await admin.from('app_events').insert({
        user_id: candidate.user_id,
        type: 'push_failed',
        payload: {
          trigger: 'challenge_cleared',
          error: (pushError as Error).message,
        },
      });
    }
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Scheduled invocation only. Without this, any caller could force days to
  // finalize early and freeze rankings mid-competition.
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret');
    if (provided !== cronSecret) return fail('forbidden', 403);
  }

  const now = new Date();

  // Selecting candidates in SQL keeps the timezone arithmetic next to the data.
  // `(local_date + 1)::timestamp at time zone tz` is the UTC instant of the
  // user's next local midnight — the same value dayEndUtc() computes in
  // kairo-core — and the interval adds the grace window.
  const { data, error } = await admin.rpc('finalizable_days', {
    p_limit: MAX_DAYS_PER_RUN,
  });
  if (error) return fail(`candidate lookup failed: ${error.message}`, 500);

  const candidates = (data ?? []) as Candidate[];
  const finalized: string[] = [];
  const failures: Array<{ userId: string; localDate: string; error: string }> = [];
  let shieldsUsed = 0;
  const milestones: Array<{ userId: string; milestone: number }> = [];
  const eventsCompleted: Array<{ userId: string; eventId: string; xp: number }> = [];
  const challengesCleared: Array<{ userId: string; area: ChallengeArea; xp: number }> = [];

  for (const candidate of candidates) {
    const rescored = await rescoreDay(admin, {
      userId: candidate.user_id,
      localDate: candidate.local_date,
      timeZone: candidate.timezone,
      now,
      finalize: true,
    });

    if ('error' in rescored) {
      // One bad row must not abort the whole run — other users' days still
      // need to close on time.
      failures.push({
        userId: candidate.user_id,
        localDate: candidate.local_date,
        error: rescored.error,
      });
      continue;
    }

    const { data: streakRow, error: streakError } = await admin
      .from('streaks')
      .select('current_streak, longest_streak, last_scored_date, shield_available_on')
      .eq('user_id', candidate.user_id)
      .maybeSingle();

    if (streakError) {
      failures.push({
        userId: candidate.user_id,
        localDate: candidate.local_date,
        error: streakError.message,
      });
      continue;
    }

    const before: StreakState = {
      currentStreak: streakRow ? Number(streakRow.current_streak) : 0,
      longestStreak: streakRow ? Number(streakRow.longest_streak) : 0,
      lastScoredDate: (streakRow?.last_scored_date as string | null) ?? null,
      shieldAvailableOn: (streakRow?.shield_available_on as string | null) ?? null,
    };

    // §19 sets the bar deliberately low: any score above zero keeps a streak.
    const transition = advanceStreak(before, {
      localDate: candidate.local_date,
      scored: rescored.total > 0,
    });

    if (!transition.unchanged) {
      const { error: writeError } = await admin.from('streaks').upsert(
        {
          user_id: candidate.user_id,
          current_streak: transition.next.currentStreak,
          longest_streak: transition.next.longestStreak,
          last_scored_date: transition.next.lastScoredDate,
          shield_available_on: transition.next.shieldAvailableOn,
          updated_at: now.toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (writeError) {
        failures.push({
          userId: candidate.user_id,
          localDate: candidate.local_date,
          error: writeError.message,
        });
        continue;
      }
    }

    if (transition.shieldUsed) shieldsUsed += 1;
    if (transition.milestoneReached !== null) {
      milestones.push({
        userId: candidate.user_id,
        milestone: transition.milestoneReached,
      });
    }

    // ---- events ---------------------------------------------------------
    //
    // After the streak fold, because an Event completion is the last thing that
    // can happen to a day and it depends on the day already being `final` in
    // the database — `event_progress` reads status from `daily_scores`.
    //
    // Wrapped: an Event that fails to latch must not stop the day from closing.
    // The day is the competition; the Event is a reward on top of it.
    //
    // Retry is NOT automatic on the next hourly run — `finalizable_days()` only
    // returns *provisional* days, and this one is now final. The next
    // finalization of any day inside the same window re-evaluates the whole
    // window and picks it up, so a transient failure normally costs a day. The
    // gap is an Event met on the LAST day of its window: nothing else finalizes
    // inside it, so a failure there leaves it unlatched. Pooling narrows that
    // gap without closing it — any other member's day inside the window
    // re-evaluates the whole thing. Recorded as a known limitation; a V1 sweep
    // over met-but-unlatched Events closes it.
    try {
      await settleEvents(candidate, eventsCompleted);
    } catch (eventError) {
      await admin.from('app_events').insert({
        user_id: candidate.user_id,
        type: 'event_settle_failed',
        payload: {
          localDate: candidate.local_date,
          error: (eventError as Error).message,
        },
      });
    }

    // ---- challenges ------------------------------------------------------
    //
    // Wrapped for the same reason as events, and separately from them: a
    // challenge that fails to latch must not stop the day closing, and must not
    // take an Event completion down with it.
    //
    // Unlike Events, this does not read `daily_scores` at all — a challenge is
    // resolved from `workout_sessions` and never touches the score. It sits
    // after the Event pass only because it is the cheaper thing to lose.
    try {
      await settleChallenges(candidate, now, challengesCleared);
    } catch (challengeError) {
      await admin.from('app_events').insert({
        user_id: candidate.user_id,
        type: 'challenge_settle_failed',
        payload: {
          localDate: candidate.local_date,
          error: (challengeError as Error).message,
        },
      });
    }

    finalized.push(`${candidate.user_id}:${candidate.local_date}`);

    await admin.from('app_events').insert({
      user_id: candidate.user_id,
      type: 'day_finalized',
      payload: {
        localDate: candidate.local_date,
        total: rescored.total,
        streak: transition.next.currentStreak,
        shieldUsed: transition.shieldUsed,
        milestone: transition.milestoneReached,
      },
    });
  }

  return json({
    ranAt: now.toISOString(),
    candidates: candidates.length,
    finalized: finalized.length,
    shieldsUsed,
    milestones,
    eventsCompleted,
    challengesCleared,
    failures,
    // A full batch means more days are waiting; the next hourly run picks them
    // up, but a persistently full batch is worth alerting on.
    truncated: candidates.length >= MAX_DAYS_PER_RUN,
  });
});

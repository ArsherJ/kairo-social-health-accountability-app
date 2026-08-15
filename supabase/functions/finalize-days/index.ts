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
  daysForUser,
  planGoalCompletions,
  type GoalRow,
} from '../_shared/goal-plan.ts';
import { planChallengeCompletions } from '../_shared/challenge-plan.ts';
import {
  challengeClearedCopy,
  goalCompletedCopy,
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
 * Goals latch here too, and only here: a goal completes off **final** days, so
 * the moment a day finalizes is the only moment a goal's standing can change in
 * a way that pays XP. `on conflict do nothing` on the insert is what makes that
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

/** Latch any goals this user's newly-final day completed, and notify. */
async function settleGoals(
  candidate: Candidate,
  now: Date,
  out: Array<{ userId: string; goalId: string; xp: number }>,
): Promise<void> {
  const { data: partRows, error: partError } = await admin
    .from('goal_participants')
    .select('goal_id')
    .eq('user_id', candidate.user_id);
  if (partError) throw new Error(`participant lookup failed: ${partError.message}`);

  const goalIds = (partRows ?? []).map((r: { goal_id: string }) => r.goal_id);
  // Returning early rather than passing an empty array to `.in()`, which
  // PostgREST renders as `id=in.()` — a syntax error, not an empty result.
  if (goalIds.length === 0) return;

  // Only goals whose window contains the finalized day. One outside it cannot
  // change standing, and evaluating it would stamp `completed_on` with a date
  // that never counted toward the goal.
  const { data: goalRows, error: goalError } = await admin
    .from('goals')
    .select('id, squad_id, title, kind, target, required_days, starts_on, ends_on')
    .in('id', goalIds)
    .lte('starts_on', candidate.local_date)
    .gte('ends_on', candidate.local_date);

  if (goalError) throw new Error(`goal lookup failed: ${goalError.message}`);
  const goals = (goalRows ?? []) as GoalRow[];
  if (goals.length === 0) return;

  const { data: doneRows, error: doneError } = await admin
    .from('goal_completions')
    .select('goal_id')
    .eq('user_id', candidate.user_id)
    .in('goal_id', goals.map((g) => g.id));
  if (doneError) throw new Error(`completion lookup failed: ${doneError.message}`);
  const alreadyCompleted = new Set(
    (doneRows ?? []).map((r: { goal_id: string }) => r.goal_id),
  );

  // One RPC per goal. `goal_window_scores` is scoped to a goal because that is
  // what the UI asks for; batching would need a second projection with the same
  // privacy surface, which is not worth it for a handful of goals per user.
  const dayRows: Array<{
    goal_id: string;
    user_id: string;
    local_date: string;
    total: number;
    status: string;
  }> = [];

  for (const goal of goals) {
    if (alreadyCompleted.has(goal.id)) continue;
    // p_as_user is load-bearing: this runs as the service role with no JWT, so
    // auth.uid() is null and the RPC's own guard would refuse it. Same affordance
    // squad_leaderboard has for the notification cron (20260807110400).
    const { data, error } = await admin.rpc('goal_window_scores', {
      p_goal_id: goal.id,
      p_as_user: candidate.user_id,
    });
    if (error) throw new Error(`goal_window_scores failed: ${error.message}`);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      // The RPC left-joins, so a participant with no scored day in the window
      // arrives as a row with null local_date. Skipped here: it carries no day
      // to evaluate, and `Number(null)` would push a phantom zero-day into the
      // consistency count.
      if (row.local_date === null) continue;
      dayRows.push({
        goal_id: goal.id,
        user_id: row.user_id as string,
        local_date: row.local_date as string,
        total: Number(row.total ?? 0),
        status: row.status as string,
      });
    }
  }

  const completions = planGoalCompletions({
    userId: candidate.user_id,
    localDate: candidate.local_date,
    goals,
    daysByGoal: daysForUser(dayRows, candidate.user_id),
    alreadyCompleted,
  });

  if (completions.length === 0) return;

  // `ignoreDuplicates` is the one-way latch. Two overlapping runs both see the
  // same final day and both plan the same completion; exactly one row survives,
  // and the XP rollup trigger recomputes rather than increments either way.
  const { error: insertError } = await admin
    .from('goal_completions')
    .upsert(
      completions.map((c) => c.row),
      { onConflict: 'goal_id,user_id', ignoreDuplicates: true },
    );
  if (insertError) throw new Error(`completion insert failed: ${insertError.message}`);

  for (const completion of completions) {
    out.push({
      userId: candidate.user_id,
      goalId: completion.row.goal_id,
      xp: completion.row.xp_awarded,
    });

    await admin.from('app_events').insert({
      user_id: candidate.user_id,
      type: 'goal_completed',
      payload: {
        goalId: completion.row.goal_id,
        localDate: candidate.local_date,
        xpAwarded: completion.row.xp_awarded,
      },
    });

    // Wrapped separately from the latch above. A failed push must never undo a
    // completion that has already paid XP — the user has earned the goal whether
    // or not their phone hears about it.
    try {
      const message = goalCompletedCopy({
        title: completion.title,
        xpAwarded: completion.row.xp_awarded,
      });
      const result = await sendToUser(admin, candidate.user_id, message, {
        trigger: 'goal_completed',
        screen: 'goals',
        goalId: completion.row.goal_id,
      });
      // Logged only when a device was actually reached. The row is how the beta
      // counts what went out; it does not spend budget, because
      // `countsAgainstBudget('goal_completed')` is false (BUDGET_EXEMPT).
      if (result.delivered > 0) {
        await admin.from('notification_log').insert({
          user_id: candidate.user_id,
          kind: 'goal_completed',
          local_date: candidate.local_date,
        });
      }
    } catch (pushError) {
      await admin.from('app_events').insert({
        user_id: candidate.user_id,
        type: 'push_failed',
        payload: {
          trigger: 'goal_completed',
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

  // `ignoreDuplicates` is the one-way latch, exactly as for goals: two
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

    // Wrapped separately from the latch, for the goals reason: a failed push
    // must never undo a completion that has already paid XP.
    try {
      const message = challengeClearedCopy(completion.challenge);
      const result = await sendToUser(admin, candidate.user_id, message, {
        trigger: 'challenge_cleared',
        screen: 'train',
        localDate: candidate.local_date,
      });
      // Logged only when a device was actually reached. Unlike
      // `goal_completed`, this one **does** spend budget — a challenge clears
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
  const goalsCompleted: Array<{ userId: string; goalId: string; xp: number }> = [];
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

    // ---- goals ----------------------------------------------------------
    //
    // After the streak fold, because a goal completion is the last thing that can
    // happen to a day and it depends on the day already being `final` in the
    // database — `goal_window_scores` reads status from `daily_scores`.
    //
    // Wrapped: a goal that fails to latch must not stop the day from closing.
    // The day is the competition; the goal is a reward on top of it.
    //
    // Retry is NOT automatic on the next hourly run — `finalizable_days()` only
    // returns *provisional* days, and this one is now final. The next
    // finalization of any day inside the same window re-evaluates the whole
    // window and picks it up, so a transient failure normally costs a day. The
    // gap is a goal met on the LAST day of its window: nothing else finalizes
    // inside it, so a failure there leaves it unlatched. Recorded as a known
    // limitation; a V1 sweep over met-but-unlatched goals closes it.
    try {
      await settleGoals(candidate, now, goalsCompleted);
    } catch (goalError) {
      await admin.from('app_events').insert({
        user_id: candidate.user_id,
        type: 'goal_settle_failed',
        payload: {
          localDate: candidate.local_date,
          error: (goalError as Error).message,
        },
      });
    }

    // ---- challenges ------------------------------------------------------
    //
    // Wrapped for the same reason as goals, and separately from them: a
    // challenge that fails to latch must not stop the day closing, and must not
    // take a goal completion down with it.
    //
    // Unlike goals, this does not read `daily_scores` at all — a challenge is
    // resolved from `workout_sessions` and never touches the score. It sits
    // after the goal pass only because it is the cheaper thing to lose.
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
    goalsCompleted,
    challengesCleared,
    failures,
    // A full batch means more days are waiting; the next hourly run picks them
    // up, but a persistently full batch is worth alerting on.
    truncated: candidates.length >= MAX_DAYS_PER_RUN,
  });
});

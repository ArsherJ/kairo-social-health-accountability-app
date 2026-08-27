import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { fail, json } from '../_shared/http.ts';
import {
  countsAgainstBudget,
  evaluateEvent,
  planNotifications,
  pooledDays,
  type EventProgressRow,
} from '../_shared/core.ts';
import {
  DIGEST_HOUR,
  planDigest,
  type DispatchCandidate,
} from '../_shared/notification-plan.ts';
import { digestCopy, type DigestFacts } from '../_shared/notification-copy.ts';
import { eventRowToEvent, type EventRow } from '../_shared/event-plan.ts';
import { sendToUser } from '../_shared/push.deno.ts';

/**
 * dispatch-notifications — the one scheduled push a day (deviation #52).
 *
 * Runs hourly, seven past, and twenty-three of those runs send nothing. Because
 * every player has their own timezone, every hour of the day is somebody's
 * 08:00: the same run that greets a Manila player greets a New York one
 * thirteen hours later.
 *
 * §14's three scheduled pushes — 23:00, 00:00 and the mid-morning nudge —
 * collapsed into this on 2026-08-25. The digest carries what none of them
 * could: yesterday's *finished* race, which the screen does not show.
 *
 * Deliberately NOT part of finalize-days. That function selects days whose
 * local midnight passed more than two hours ago — the §12 grace window — so a
 * digest sent from it would fire at about 2am. It also caps at 500 days inside
 * a 55s timeout, and a push round trip per user does not belong in that budget.
 * A failed push must never stop a day from closing.
 *
 * **The once-a-day cap is enforced in the database, not here.** A client-side
 * cap is a race between the same account's devices, and a cap applied after
 * selection is one this handler cannot see across two invocations of the cron.
 * `users_needing_digest()` excludes anyone already sent, in the same query that
 * does the timezone arithmetic, and `notification_log_one_digest_per_day` is
 * the backstop underneath it.
 *
 * Every decision lives in a pure module tested in plain Node — which hour
 * carries the digest and which dates it concerns in `notification-plan.ts`,
 * whether a candidate may go out in `kairo-core/notifications.ts`, and what it
 * says in `notification-copy.ts`. This handler only reads, plans, sends, logs.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('CRON_SECRET');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A squad membership, resolved once for every candidate in the run. */
type SquadByUser = Map<string, string>;

Deno.serve(async (req: Request): Promise<Response> => {
  // Scheduled invocation only. Without this any caller could push the whole
  // user base, at any hour.
  if (cronSecret) {
    if (req.headers.get('x-cron-secret') !== cronSecret) return fail('forbidden', 403);
  }

  const now = new Date();

  // The hour is decided in SQL, not here. `users_needing_digest` compares each
  // recipient's own local hour against the argument and excludes anyone already
  // sent today, so the handler passes the constant and the database does both —
  // the same division `users_at_local_hour` already used, and the reason there
  // is no timezone library in this function. Computing an hour from a UTC
  // instant here would send every user the digest at 08:00 UTC.
  const { data: userRows, error: userError } = await admin.rpc('users_needing_digest', {
    p_hour: DIGEST_HOUR,
  });
  if (userError) return fail(`digest lookup failed: ${userError.message}`, 500);

  const candidates: DispatchCandidate[] = planDigest({
    hour: DIGEST_HOUR,
    users: (userRows ?? []).map((row: Record<string, unknown>) => ({
      userId: row.user_id as string,
      localDate: row.local_date as string,
      timeZone: row.timezone as string,
    })),
  });

  if (candidates.length === 0) {
    return json({ ranAt: now.toISOString(), candidates: 0, sent: 0, suppressed: 0 });
  }

  const squadByUser = await squadsFor(candidates.map((c) => c.userId));

  let sent = 0;
  let suppressed = 0;
  const failures: Array<{ userId: string; trigger: string; error: string }> = [];

  for (const candidate of candidates) {
    const { sendDate, resultDate, timeZone } = candidate.data;

    // The budget still applies — it bounds the event-driven pushes, which #52
    // did not touch — and is read fresh for each candidate rather than batched.
    const sentToday = await budgetSpent(candidate.userId, sendDate);

    const [admitted] = planNotifications({
      candidates: [candidate],
      sentToday,
      // The hour the candidate was selected for IS the recipient's local hour —
      // that is what users_needing_digest answered. Minute is not part of any
      // §14 rule, and passing the UTC minute here would be noise.
      localNow: { hour: DIGEST_HOUR, minute: 0 },
    });

    if (!admitted) {
      suppressed += 1;
      continue;
    }

    const squadId = squadByUser.get(candidate.userId);
    const message = digestCopy(await digestFactsFor(candidate, squadId));

    const { delivered, failures: sendFailures } = await sendToUser(
      admin,
      candidate.userId,
      message,
      // Every notification deep-links to the relevant screen. `today` is plan
      // 3's fourth tab, which is where the race summary and the quests are —
      // the digest is about the present moment, so that is where it lands.
      { trigger: candidate.trigger, localDate: resultDate, screen: 'today' },
    );

    if (delivered > 0) {
      sent += 1;
      // Written only on a successful send. A logged suppression would inflate
      // sentToday and suppress the next one too.
      await admin.from('notification_log').insert({
        user_id: candidate.userId,
        kind: candidate.trigger,
        local_date: sendDate,
      });
    } else if (sendFailures.length > 0) {
      failures.push({
        userId: candidate.userId,
        trigger: candidate.trigger,
        error: sendFailures[0]!,
      });
    }

    // `timeZone` rides along for debugging a mis-dated push; nothing reads it.
    void timeZone;
  }

  return json({
    ranAt: now.toISOString(),
    candidates: candidates.length,
    sent,
    suppressed,
    failures,
  });
});

/** One squad per user — free users cap at one, and MVP ranks against it. */
async function squadsFor(userIds: readonly string[]): Promise<SquadByUser> {
  const byUser: SquadByUser = new Map();
  if (userIds.length === 0) return byUser;

  const { data, error } = await admin
    .from('squad_members')
    .select('user_id, squad_id')
    .in('user_id', [...new Set(userIds)]);

  if (error) return byUser;
  for (const row of data ?? []) {
    if (!byUser.has(row.user_id as string)) {
      byUser.set(row.user_id as string, row.squad_id as string);
    }
  }
  return byUser;
}

/**
 * What the digest has to say, for one recipient.
 *
 * Three reads, each of which may legitimately come back empty — and every empty
 * has its own copy branch rather than a placeholder. A user with no squad, a
 * squad whose race for yesterday is not final because one member is still
 * living in it, and a squad with no live Event are all ordinary states, not
 * errors.
 *
 * The race result is read from `race_results` **directly** rather than through
 * `race_result()`: this runs with the service role and no JWT, so `auth.uid()`
 * is null and that function would raise. Reading the table is correct here, and
 * is why the table has no client grant rather than an RLS policy — the service
 * role is the only reader that is not a viewer.
 */
async function digestFactsFor(
  candidate: DispatchCandidate,
  squadId: string | undefined,
): Promise<DigestFacts> {
  if (!squadId) return { inSquad: false };

  const [resultRow, standingRows, eventRows] = await Promise.all([
    admin
      .from('race_results')
      .select('standings')
      .eq('squad_id', squadId)
      .eq('local_date', candidate.data.resultDate)
      .maybeSingle(),
    admin.rpc('squad_leaderboard', {
      p_squad_id: squadId,
      p_local_date: candidate.data.standingDate,
      p_mode: 'current',
      // The cron has no JWT. squad_leaderboard honours this only when auth.uid()
      // is null, so it cannot be used by a client to read as somebody else.
      p_as_user: candidate.userId,
    }),
    admin
      .from('challenge_events')
      .select('id, squad_id, title, description, kind, metric, target, starts_on, ends_on')
      .eq('squad_id', squadId)
      // `closed_at is null` is not optional on any read: the table still holds
      // every pre-pivot Goal row, and one of those graded here would be a
      // points target that means nothing to this copy.
      .is('closed_at', null)
      .lte('starts_on', candidate.data.standingDate)
      .gte('ends_on', candidate.data.standingDate)
      .limit(1),
  ]);

  // The live Event's pooled fraction, through the same two functions the client
  // and finalize-days use — `pooledDays()` takes each date once (event_progress
  // repeats the pooled figure on every participant's row) and `evaluateEvent()`
  // is the single implementation of the arithmetic. A third reading of a bar
  // three surfaces already draw is exactly what deviation #18 forbids.
  let event: DigestFacts['event'] = null;
  const liveEvent = (eventRows.data ?? [])[0] as EventRow | undefined;
  if (liveEvent) {
    const { data: progressRows } = await admin.rpc('event_progress', {
      p_event_id: liveEvent.id,
      p_as_user: candidate.userId,
    });
    const parsed = eventRowToEvent(liveEvent);
    event = {
      kind: parsed.kind,
      fraction: evaluateEvent(
        parsed,
        pooledDays((progressRows ?? []) as EventProgressRow[]),
        candidate.data.standingDate,
      ).fraction,
    };
  }

  const standings = (resultRow.data?.standings ?? []) as Array<{
    user_id: string;
    rank: number;
  }>;
  const mine = standings.find((s) => s.user_id === candidate.userId);

  // Today's standing is ranked by the RPC's weighted total, not by capped
  // steps — the race re-ranks on the client (deviation #46). At 08:00 almost
  // nobody has moved, so the two orderings agree in practice, and re-ranking
  // here would mean a second implementation of rankRacers on the server for a
  // difference nobody can observe. Stated so it is a decision rather than an
  // oversight.
  const board = (standingRows.data ?? []) as Array<{ user_id: string; rank: number }>;
  const myRow = board.find((r) => r.user_id === candidate.userId);

  return {
    inSquad: true,
    result: mine ? { rank: Number(mine.rank), racers: standings.length } : null,
    standing: myRow ? { rank: Number(myRow.rank), racers: board.length } : null,
    event,
  };
}

/** Sends already logged against this user's local date that count (§14). */
async function budgetSpent(userId: string, localDate: string): Promise<number> {
  const { data, error } = await admin
    .from('notification_log')
    .select('kind')
    .eq('user_id', userId)
    .eq('local_date', localDate);

  if (error) return 0;
  // Exempt sends are logged too, and must not crowd out the scheduled three.
  // The predicate is kairo-core's, not a copy of it — see BUDGET_EXEMPT.
  return (data ?? []).filter((row) =>
    countsAgainstBudget(row.kind as Parameters<typeof countsAgainstBudget>[0]),
  ).length;
}

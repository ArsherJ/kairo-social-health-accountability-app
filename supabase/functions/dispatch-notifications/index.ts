import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { fail, json } from '../_shared/http.ts';
import { countsAgainstBudget, currentLocalDate, planNotifications } from '../_shared/core.ts';
import {
  DISPATCH_HOURS,
  planHourlyDispatch,
  type DispatchCandidate,
  type DispatchUser,
} from '../_shared/notification-plan.ts';
import { notificationCopy } from '../_shared/notification-copy.ts';
import { sendToUser } from '../_shared/push.deno.ts';

/**
 * dispatch-notifications — the three scheduled pushes of §14.
 *
 * Runs hourly, seven past. Because every player has their own timezone, every
 * hour of the day is somebody's 11 PM: the same run that tells a Manila player
 * their day is ending tells a New York player theirs has begun.
 *
 * Deliberately NOT part of finalize-days. That function selects days whose
 * local midnight passed more than two hours ago — the §12 grace window — which
 * would fire "Day ends" at 02:00 local, two hours late and deep inside quiet
 * hours. It also caps at 500 days inside a 55s timeout, and a push round trip
 * per user does not belong in that budget. A failed push must never stop a day
 * from closing.
 *
 * Every decision lives in a pure module tested in plain Node — which hours
 * carry which trigger and which date they concern in `notification-plan.ts`,
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
  const hours = Object.keys(DISPATCH_HOURS).map(Number);

  // Who is at each of the three hours right now. Three cheap queries against
  // profiles; the timezone arithmetic stays in SQL, next to the data.
  const usersByHour = new Map<number, DispatchUser[]>();
  for (const hour of hours) {
    const { data, error } = await admin.rpc('users_at_local_hour', { p_hour: hour });
    if (error) return fail(`hour lookup failed: ${error.message}`, 500);
    usersByHour.set(
      hour,
      (data ?? []).map((row: Record<string, unknown>) => ({
        userId: row.user_id as string,
        localDate: row.local_date as string,
        timeZone: row.timezone as string,
      })),
    );
  }

  const openedApp = await usersWhoOpenedToday(usersByHour.get(9) ?? [], now);

  const candidates: DispatchCandidate[] = [];
  for (const hour of hours) {
    candidates.push(
      ...planHourlyDispatch({ hour, users: usersByHour.get(hour) ?? [], openedApp }),
    );
  }

  if (candidates.length === 0) {
    return json({ ranAt: now.toISOString(), candidates: 0, sent: 0, suppressed: 0 });
  }

  const squadByUser = await squadsFor(candidates.map((c) => c.userId));

  let sent = 0;
  let suppressed = 0;
  const failures: Array<{ userId: string; trigger: string; error: string }> = [];

  for (const candidate of candidates) {
    const { sendDate, aboutDate, timeZone } = candidate.data;

    // The budget is per recipient per local day, and it is read fresh for each
    // candidate rather than batched: a user reachable at two of the three hours
    // in one run must see their own first send when the second is planned.
    const sentToday = await budgetSpent(candidate.userId, sendDate);

    const [admitted] = planNotifications({
      candidates: [candidate],
      sentToday,
      // The hour the candidate was selected for IS the recipient's local hour —
      // that is what users_at_local_hour answered. Minute is not part of any
      // §14 rule, and passing the UTC minute here would be noise.
      localNow: { hour: hourOf(candidate.trigger), minute: 0 },
    });

    if (!admitted) {
      suppressed += 1;
      continue;
    }

    const squadId = squadByUser.get(candidate.userId);
    const standing = await standingFor(candidate, squadId, aboutDate);

    const message = notificationCopy(candidate.trigger, {
      ...standing,
      inSquad: Boolean(squadId),
    });
    const { delivered, failures: sendFailures } = await sendToUser(
      admin,
      candidate.userId,
      message,
      // §14: every notification deep-links to the relevant screen.
      { trigger: candidate.trigger, localDate: aboutDate, screen: squadId ? 'squad' : 'character' },
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

/** Which trigger belongs to which local hour, inverted. */
function hourOf(trigger: string): number {
  for (const [hour, t] of Object.entries(DISPATCH_HOURS)) {
    if (t === trigger) return Number(hour);
  }
  return 12;
}

/**
 * Users who have already opened the app on their current local date.
 *
 * §14 makes "Day starts" conditional on this. The window is the last 48 hours
 * of `app_open` events — wide enough to cover every timezone's version of
 * "today", with the actual comparison done per user against their own local
 * date, which is the only way the question means anything in a squad spanning
 * Dubai and Cebu.
 */
async function usersWhoOpenedToday(
  users: readonly DispatchUser[],
  now: Date,
): Promise<string[]> {
  if (users.length === 0) return [];

  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('app_events')
    .select('user_id, occurred_at')
    .eq('type', 'app_open')
    .in('user_id', users.map((u) => u.userId))
    .gte('occurred_at', since);

  if (error) return [];

  const zoneOf = new Map(users.map((u) => [u.userId, u]));
  const opened = new Set<string>();
  for (const row of data ?? []) {
    const user = zoneOf.get(row.user_id as string);
    if (!user) continue;
    if (currentLocalDate(new Date(row.occurred_at as string), user.timeZone) === user.localDate) {
      opened.add(user.userId);
    }
  }
  return [...opened];
}

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
 * The rank and score a message needs.
 *
 * `rank: null` means "no squad", which selects the solo copy variant rather
 * than suppressing the push — solo players are exactly the population §7's
 * churn argument is about.
 *
 * The rank comes from `squad_leaderboard` rather than a query written here.
 * That function already weights totals by the squad's program and orders on
 * ties by name; reproducing it would eventually make the number in the push
 * disagree with the number on the screen.
 */
async function standingFor(
  candidate: DispatchCandidate,
  squadId: string | undefined,
  aboutDate: string,
): Promise<{ rank: number | null; total: number }> {
  if (!squadId) {
    const { data } = await admin
      .from('daily_scores')
      .select('total')
      .eq('user_id', candidate.userId)
      .eq('local_date', aboutDate)
      .maybeSingle();
    return { rank: null, total: data ? Number(data.total) : 0 };
  }

  // "A new day begins" carries no rank, so there is nothing to ask for.
  if (candidate.trigger === 'day_starts') return { rank: null, total: 0 };

  const { data, error } = await admin.rpc('squad_leaderboard', {
    p_squad_id: squadId,
    // An explicit date rather than p_mode: the candidate already knows which
    // day it is about, and letting the board re-derive "yesterday" would be a
    // second chance to disagree about it.
    p_local_date: aboutDate,
    // The cron has no JWT. squad_leaderboard honours this only when auth.uid()
    // is null, so it cannot be used by a client to read as somebody else.
    p_as_user: candidate.userId,
  });

  if (error || !data) return { rank: null, total: 0 };

  const own = (data as Record<string, unknown>[]).find((r) => r.user_id === candidate.userId);
  return {
    rank: own ? Number(own.rank) : null,
    total: own ? Number(own.total) : 0,
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

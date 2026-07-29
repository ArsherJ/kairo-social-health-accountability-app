import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { fail, json } from '../_shared/http.ts';
import { rescoreDay } from '../_shared/rescore.deno.ts';
import {
  PERSONAS,
  expandDateRange,
  findUnlistedUsers,
  generateDay,
  hashSeed,
  type Persona,
} from '../_shared/seed-plan.ts';

/**
 * seed-health — development-only. NEVER deploy this to a project with real
 * users.
 *
 * Without it, testing a leaderboard means physically walking 10,000 steps and
 * testing week-3 competitive stamina is impossible for one person.
 *
 * Three guards, deliberately independent:
 *   1. SEED_SECRET must be configured AND match. Unlike finalize-days, an
 *      unset secret refuses everything rather than disabling the check — a
 *      function that fabricates scores must fail closed.
 *   2. Every target user must appear in seed_test_users. This is what makes a
 *      leaked secret survivable: it cannot reach a real player's row.
 *   3. It is not deployed to production, which is why the other two exist
 *      rather than instead of them.
 *
 * It writes health_buckets and then rescores through the same helper as
 * deploy-sabotage and finalize-days. It never writes daily_scores directly:
 * a fabricated total would mean the UI is verified against numbers the
 * scoring engine never produced.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const seedSecret = Deno.env.get('SEED_SECRET');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface CreateUsersBody {
  action: 'create-users';
  count: number;
  timezone?: string;
  namePrefix?: string;
}

interface AddToSquadBody {
  action: 'add-to-squad';
  userIds: string[];
  inviteCode: string;
}

interface SeedDaysBody {
  action: 'seed-days';
  userIds: string[];
  from: string;
  to: string;
  persona: Persona;
}

type Body = CreateUsersBody | AddToSquadBody | SeedDaysBody;

/** Refuses the whole request if any target is not allowlisted. */
async function assertAllowlisted(userIds: string[]): Promise<string | null> {
  const { data, error } = await admin
    .from('seed_test_users')
    .select('user_id')
    .in('user_id', userIds);

  if (error) return `allowlist lookup failed: ${error.message}`;

  const unlisted = findUnlistedUsers(
    userIds,
    (data ?? []).map((row: { user_id: string }) => row.user_id),
  );
  if (unlisted.length > 0) {
    return `not seed test users: ${unlisted.join(', ')}`;
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Fail closed. A missing secret must not mean "no check".
  if (!seedSecret) {
    return fail('SEED_SECRET is not configured; seed-health refuses to run', 503);
  }
  if (req.headers.get('x-seed-secret') !== seedSecret) {
    return fail('forbidden', 403);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail('invalid JSON body', 400);
  }

  if (body.action === 'create-users') {
    const count = Math.trunc(body.count);
    if (!Number.isFinite(count) || count < 1 || count > 20) {
      return fail('count must be between 1 and 20', 400);
    }

    const timezone = body.timezone ?? 'Asia/Manila';
    const prefix = body.namePrefix ?? 'Seed';
    const created: Array<{ userId: string; characterName: string }> = [];

    for (let i = 0; i < count; i++) {
      const label = `${prefix}${i + 1}`;
      const { data, error } = await admin.auth.admin.createUser({
        email: `seed-${crypto.randomUUID()}@kairo.test`,
        password: crypto.randomUUID(),
        email_confirm: true,
      });
      if (error || !data.user) {
        return fail(`user creation failed: ${error?.message ?? 'no user'}`, 500);
      }

      const userId = data.user.id;

      const { error: profileError } = await admin.from('profiles').insert({
        id: userId,
        character_name: label,
        timezone,
      });
      if (profileError) {
        return fail(`profile insert failed: ${profileError.message}`, 500);
      }

      // Recorded before any data is written, so a user can never hold seeded
      // buckets without appearing on the allowlist.
      const { error: listError } = await admin
        .from('seed_test_users')
        .insert({ user_id: userId, label });
      if (listError) {
        return fail(`allowlist insert failed: ${listError.message}`, 500);
      }

      created.push({ userId, characterName: label });
    }

    return json({ created });
  }

  if (body.action === 'add-to-squad') {
    if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
      return fail('userIds must be a non-empty array', 400);
    }

    const denied = await assertAllowlisted(body.userIds);
    if (denied) return fail(denied, 403);

    const { data: squad, error: squadError } = await admin
      .from('squads')
      .select('id')
      .eq('invite_code', body.inviteCode.trim().toUpperCase())
      .maybeSingle();

    if (squadError) return fail(`squad lookup failed: ${squadError.message}`, 500);
    if (!squad) return fail('invalid invite code', 404);

    // join_squad() resolves the joiner from auth.uid(), so it can only ever add
    // the caller. Seeding therefore inserts membership directly — the table's
    // triggers still enforce the per-user squad cap and squads.max_members.
    const { error } = await admin
      .from('squad_members')
      .upsert(
        body.userIds.map((userId) => ({ squad_id: squad.id, user_id: userId })),
        { onConflict: 'squad_id,user_id' },
      );
    if (error) return fail(`membership insert failed: ${error.message}`, 500);

    return json({ squadId: squad.id, added: body.userIds.length });
  }

  if (body.action === 'seed-days') {
    if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
      return fail('userIds must be a non-empty array', 400);
    }
    if (!PERSONAS.includes(body.persona)) {
      return fail(`persona must be one of: ${PERSONAS.join(', ')}`, 400);
    }

    const denied = await assertAllowlisted(body.userIds);
    if (denied) return fail(denied, 403);

    let dates: string[];
    try {
      dates = expandDateRange(body.from, body.to);
    } catch (error) {
      return fail((error as Error).message, 400);
    }

    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('id, timezone')
      .in('id', body.userIds);
    if (profileError) return fail(`profile lookup failed: ${profileError.message}`, 500);

    const zones = new Map(
      (profiles ?? []).map((p: { id: string; timezone: string }) => [p.id, p.timezone]),
    );

    const now = new Date();
    const seeded: Array<{ userId: string; localDate: string; total: number }> = [];

    for (const userId of body.userIds) {
      const timeZone = zones.get(userId);
      if (!timeZone) return fail(`no profile for ${userId}`, 400);

      for (const localDate of dates) {
        const buckets = generateDay(body.persona, hashSeed(userId, localDate));

        const { error } = await admin.from('health_buckets').upsert(
          buckets.map((bucket) => ({
            user_id: userId,
            local_date: localDate,
            hour: bucket.hour,
            steps: bucket.steps,
            distance_m: bucket.distanceM,
            active_kcal: bucket.activeKcal,
            active_minutes: bucket.activeMinutes,
          })),
          { onConflict: 'user_id,local_date,hour' },
        );
        if (error) return fail(`bucket upsert failed: ${error.message}`, 500);

        const result = await rescoreDay(admin, { userId, localDate, timeZone, now });
        if ('error' in result) {
          return fail(`rescore failed for ${userId} ${localDate}: ${result.error}`, 500);
        }

        seeded.push({ userId, localDate, total: result.total });
      }
    }

    return json({ seeded });
  }

  return fail('unknown action', 400);
});

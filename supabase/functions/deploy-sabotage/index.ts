import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { corsHeaders, fail, json } from '../_shared/http.ts';
import { currentLocalDate, type SabotageEvent } from '../_shared/core.ts';
import { rescoreDay } from '../_shared/rescore.deno.ts';
import {
  blockMessage,
  dailyGrantFor,
  planDeploy,
  validateDeployRequest,
} from '../_shared/sabotage-plan.ts';

/**
 * deploy-sabotage — the only way a sabotage event enters the log.
 *
 * Every rule that makes the mechanic fair is enforced here, in one place:
 * squad membership, the daily deploy cap, the same-item cooldown, and whether
 * the target's day is still live. RLS gives clients no INSERT on
 * sabotage_events, so this cannot be bypassed.
 *
 * The log is append-only at the database level, so a deploy is a fact the
 * moment it lands. Scores are then replayed from that log rather than adjusted,
 * which is why a retry cannot double-charge anyone.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return fail('missing bearer token', 401);

  const { data: auth, error: authError } = await admin.auth.getUser(
    authHeader.slice('Bearer '.length),
  );
  if (authError || !auth.user) return fail('invalid token', 401);
  const actorId = auth.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('body must be valid JSON', 400);
  }

  const validated = validateDeployRequest(body);
  if (!validated.ok) return fail(validated.error, 400);
  const { targetId, item } = validated.value;

  const now = new Date();

  const [actorProfile, targetProfile] = await Promise.all([
    admin
      .from('profiles')
      .select('timezone, is_legendary, character_name')
      .eq('id', actorId)
      .maybeSingle(),
    admin.from('profiles').select('timezone, character_name').eq('id', targetId)
      .maybeSingle(),
  ]);

  if (actorProfile.error || !actorProfile.data) {
    return fail('complete onboarding before deploying items', 403);
  }
  if (targetProfile.error || !targetProfile.data) {
    return fail('that player does not exist', 404);
  }

  const actorTimeZone = actorProfile.data.timezone as string;
  const targetTimeZone = targetProfile.data.timezone as string;
  const actorLocalDate = currentLocalDate(now, actorTimeZone);
  const targetLocalDate = currentLocalDate(now, targetTimeZone);

  // Squads the two share. Resolved server-side so a client cannot nominate a
  // squad it does not belong to in order to reach a stranger.
  const { data: sharedRows, error: sharedError } = await admin
    .from('squad_members')
    .select('squad_id')
    .eq('user_id', actorId)
    .in(
      'squad_id',
      (
        await admin.from('squad_members').select('squad_id').eq('user_id', targetId)
      ).data?.map((r) => r.squad_id as string) ?? [],
    );
  if (sharedError) return fail(`squad lookup failed: ${sharedError.message}`, 500);
  const sharedSquadIds = (sharedRows ?? []).map((r) => r.squad_id as string);

  const [deploysToday, ledger, targetDay] = await Promise.all([
    admin
      .from('sabotage_events')
      .select('id, actor_id, target_id, squad_id, item, created_at, target_local_date')
      .eq('actor_id', actorId)
      .eq('actor_local_date', actorLocalDate),
    admin
      .from('daily_item_ledger')
      .select('granted, deployed')
      .eq('user_id', actorId)
      .eq('local_date', actorLocalDate)
      .maybeSingle(),
    admin
      .from('daily_scores')
      .select('status')
      .eq('user_id', targetId)
      .eq('local_date', targetLocalDate)
      .maybeSingle(),
  ]);

  if (deploysToday.error) {
    return fail(`deploy history lookup failed: ${deploysToday.error.message}`, 500);
  }

  // The daily grant is materialised lazily on first use, so a user who never
  // opens the app costs nothing to maintain.
  const grant = dailyGrantFor(actorProfile.data.is_legendary === true);
  let granted = ledger.data ? Number(ledger.data.granted) : 0;
  const deployed = ledger.data ? Number(ledger.data.deployed) : 0;

  if (!ledger.data) {
    const { error } = await admin
      .from('daily_item_ledger')
      .insert({ user_id: actorId, local_date: actorLocalDate, granted: grant, deployed: 0 });
    if (error) return fail(`could not grant items: ${error.message}`, 500);
    granted = grant;
  }

  const todaysDeploys: SabotageEvent[] = (deploysToday.data ?? []).map((row) => ({
    id: row.id as string,
    actorId: row.actor_id as string,
    targetId: row.target_id as string,
    squadId: row.squad_id as string,
    item: row.item as SabotageEvent['item'],
    createdAt: row.created_at as string,
    targetLocalDate: row.target_local_date as string,
  }));

  const plan = planDeploy({
    actorId,
    targetId,
    item,
    now,
    actorTimeZone,
    targetTimeZone,
    actorIsLegendary: actorProfile.data.is_legendary === true,
    sharedSquadIds,
    todaysDeploys,
    granted,
    deployed,
    targetDayFinalized: targetDay.data?.status === 'final',
  });

  if (!plan.ok) {
    return json({ ok: false, reason: plan.reason, message: blockMessage(plan.reason) }, 409);
  }

  const { data: inserted, error: insertError } = await admin
    .from('sabotage_events')
    .insert(plan.row)
    .select('id, created_at')
    .single();
  if (insertError) return fail(`deploy failed: ${insertError.message}`, 500);

  // Spend the item only after the event landed, so a failed insert never costs
  // the user an item they did not get to use.
  const { error: spendError } = await admin
    .from('daily_item_ledger')
    .update({ deployed: deployed + 1, updated_at: now.toISOString() })
    .eq('user_id', actorId)
    .eq('local_date', actorLocalDate);
  if (spendError) return fail(`could not record spend: ${spendError.message}`, 500);

  const rescored = await rescoreDay(admin, {
    userId: targetId,
    localDate: plan.targetLocalDate,
    timeZone: targetTimeZone,
    now,
  });
  if ('error' in rescored) return fail(`rescore failed: ${rescored.error}`, 500);

  await admin.from('app_events').insert([
    {
      user_id: actorId,
      type: 'sabotage_deployed',
      payload: { targetId, item, squadId: plan.row.squad_id },
    },
    {
      user_id: targetId,
      type: 'sabotage_received',
      payload: { actorId, item, newTotal: rescored.total },
    },
  ]);

  // Push notification is deliberately absent until Firebase credentials exist.
  // §14 calls this the emotional core — "[Name] hit you with a banana!" always
  // sends, exempt from the daily notification budget — so it is wired in Phase 5
  // rather than stubbed here in a way that could silently swallow sends.
  return json({
    ok: true,
    eventId: inserted.id,
    actorName: actorProfile.data.character_name,
    targetName: targetProfile.data.character_name,
    targetLocalDate: plan.targetLocalDate,
    targetNewTotal: rescored.total,
    itemsRemaining: granted - (deployed + 1),
  });
});

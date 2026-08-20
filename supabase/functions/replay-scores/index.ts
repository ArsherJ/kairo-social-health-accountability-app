import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { fail, json } from '../_shared/http.ts';
import { authorizeReplay, parseReplayRequest } from '../_shared/replay-plan.ts';
import { replayScores } from '../_shared/replay.deno.ts';

/**
 * replay-scores — a one-off, for the three-stat deploy window (deviation #41).
 *
 * `daily_scores` is always *replayed* from stored `health_buckets`, never
 * adjusted in place. That property is what makes a model migration possible at
 * all: change the engine, run every stored day back through it, and the table
 * describes the new model with no arithmetic done by hand anywhere. Nothing
 * had ever executed it, though — `finalize-days` reaches days through
 * `finalizable_days()`, which filters `status = 'provisional'`, and
 * `seed-health` fabricates buckets and can only touch seeded test users. So
 * "replay all history" was a runbook step with no command under it.
 *
 * This is that command. It is deliberately narrow:
 *
 *  - It refuses to run without `REPLAY_SECRET`, which is its own secret and not
 *    `CRON_SECRET`. `finalize-days` skips its check when the secret is unset;
 *    that default is right for a job whose worst case is a day closing early
 *    and wrong for one that rewrites every score row in the project.
 *  - It defaults to a dry run. Turning it off is a deliberate `dryRun: false`.
 *  - It preserves each day's `status` and `finalized_at`. A replay changes what
 *    a day scored, never when its competition ended.
 *
 * Everything that decides anything lives in `../_shared/replay-plan.ts` (pure,
 * tested in Node) and `../_shared/replay.deno.ts` (tested in Node against a
 * fake PostgREST client). This file authenticates, plans, and returns.
 *
 * Delete it once the window has closed and #41 is recorded — it has no place
 * in steady state, and an authenticated door onto every score row is not a
 * thing to leave standing for a reason nobody remembers.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const replaySecret = Deno.env.get('REPLAY_SECRET');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return fail('method not allowed', 405);

  const auth = authorizeReplay(replaySecret, req.headers.get('x-replay-secret'));
  if (!auth.ok) return fail(auth.error, auth.status);

  // An absent body is the mis-typed-curl shape, and `parseReplayRequest` reads
  // it as a dry run rather than rejecting it.
  let body: unknown = null;
  const raw = await req.text();
  if (raw.trim().length > 0) {
    try {
      body = JSON.parse(raw);
    } catch {
      return fail('body must be valid JSON', 400);
    }
  }

  const parsed = parseReplayRequest(body);
  if (!parsed.ok) return fail(parsed.error, 400);

  const result = await replayScores(admin, {
    now: new Date(),
    dryRun: parsed.value.dryRun,
    userId: parsed.value.userId,
    limit: parsed.value.limit,
  });
  if ('error' in result) return fail(result.error, 500);

  return json(result);
});

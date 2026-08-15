#!/usr/bin/env node
/**
 * Post-deploy smoke check for the health ingest path.
 *
 * Why this exists: on 2026-08-09 the `remove_sabotage` migration dropped
 * `daily_scores.sabotage_delta` and the Edge Functions were not redeployed. The
 * deployed `sync-health` kept sending that column, so its bucket upsert (which
 * runs first) committed while its score upsert 500'd. Health data kept landing
 * and nothing scored for two days, in total silence. All 916 tests passed
 * throughout — they exercise the *source*, and nothing checked the deployed
 * artifact. See the addendum in docs/qa/kairo-end-to-end-qa-report.md.
 *
 * So this asserts the one property that outage broke: buckets, score and the
 * profile rollups must agree after a real sync, through the real door, against
 * the really deployed function.
 *
 * Run it after every `supabase functions deploy`, and after any migration that
 * touches a table an Edge Function writes:
 *
 *   node supabase/scripts/smoke-sync.mjs
 *
 * It creates a throwaway anonymous account, exercises the path, then deletes
 * the `auth.users` row through remote-sql.sh (which cascades). Reads
 * EXPO_PUBLIC_SUPABASE_* from .env — the publishable key only, the same one
 * shipped in the app.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(PROJECT, 'package.json'));
const { createClient } = require('@supabase/supabase-js');

const env = Object.fromEntries(
  readFileSync(join(PROJECT, '.env'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const url = env['EXPO_PUBLIC_SUPABASE_URL'];
const key = env['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
if (!url || !key) {
  console.error('missing EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY in .env');
  process.exit(78);
}

const TZ = 'Asia/Manila';
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let userId = null;

/** Erasure runs over HTTPS like every other schema operation on this machine. */
function cleanup() {
  if (!userId) return;
  try {
    execFileSync(
      join(PROJECT, 'supabase', 'scripts', 'remote-sql.sh'),
      [`delete from auth.users where id = '${userId}';`],
      { stdio: 'pipe' },
    );
    console.log(`cleaned up ${userId}`);
  } catch {
    console.error(`could not delete ${userId} — remove it by hand`);
  }
}

function fail(step, detail) {
  console.error(`\nFAIL at ${step}: ${detail}`);
  cleanup();
  process.exit(1);
}

const { data: auth, error: authError } = await supabase.auth.signInAnonymously();
if (authError) fail('sign-in', authError.message);
userId = auth.user.id;

// daily_scores.user_id references profiles(id), so scoring cannot land without
// a profile. This is the row onboarding commits.
const { error: profileError } = await supabase
  .from('profiles')
  .insert({ id: userId, character_name: 'SmokeCheck', timezone: TZ });
if (profileError) fail('profile insert', profileError.message);

// A day emitted whole, all 24 hours including zeros, the way the client sends
// it (deviation #8).
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const buckets = Array.from({ length: 24 }, (_, hour) => {
  const active = hour >= 8 && hour < 18;
  return {
    localDate,
    hour,
    steps: active ? 1100 : 0,
    distanceM: active ? 825 : 0,
    activeKcal: active ? 26 : 0,
    activeMinutes: active ? 6 : 0,
    hadWorkout: false,
    elevatedHeartRate: false,
    avgHeartRate: null,
  };
});

// One workout session, so the deployed function's newest write path is
// exercised too. This is the same class of drift the outage was: a migration
// adds a table, the deployed function does not know about it (or knows about a
// column that has gone), and every test still passes because tests check the
// source rather than the artifact.
const sessions = [
  {
    hkUuid: `smoke-${userId}`,
    localDate,
    startedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    endedAt: new Date().toISOString(),
    // HKWorkoutActivityType.running — see challenge.ts.
    activityType: 37,
    durationS: 2_700,
    distanceM: 7_400.5,
    activeKcal: 512.25,
  },
];

const { error: syncError } = await supabase.functions.invoke('sync-health', {
  body: { timezone: TZ, buckets, sleep: [{ localDate, minutes: 420 }], sessions },
});
if (syncError) {
  let body = '';
  try {
    body = await syncError.context?.text();
  } catch {
    /* the status alone is enough to act on */
  }
  fail('sync-health', `status=${syncError.context?.status} ${body || syncError.message}`);
}

const { data: score, error: scoreError } = await supabase
  .from('daily_scores')
  .select('agi_points, str_points, vit_points, total, xp_awarded, status')
  .eq('user_id', userId)
  .eq('local_date', localDate)
  .maybeSingle();
if (scoreError) fail('daily_scores', scoreError.message);
// This is the outage signature exactly: buckets accepted, no score written.
if (!score) fail('daily_scores', 'buckets synced but NO score row was written');
if (score.total <= 0) fail('daily_scores', `score row written but total=${score.total}`);

const { data: profile, error: rollupError } = await supabase
  .from('profiles')
  .select('total_xp, level, agi_total, str_total, end_total, vit_total')
  .eq('id', userId)
  .maybeSingle();
if (rollupError) fail('profiles', rollupError.message);
if (!profile || profile.agi_total <= 0) {
  fail('profiles', `rollups did not move: ${JSON.stringify(profile)}`);
}

const { data: workout, error: workoutError } = await supabase
  .from('workout_sessions')
  .select('activity_type, distance_m, active_kcal')
  .eq('user_id', userId)
  .eq('hk_uuid', `smoke-${userId}`)
  .maybeSingle();
if (workoutError) fail('workout_sessions', workoutError.message);
if (!workout) {
  fail(
    'workout_sessions',
    'sync accepted the payload but NO session row was written — the deployed ' +
      'sync-health predates the workout_sessions migration, or the migration ' +
      'has not been applied',
  );
}

console.log(`score  ${JSON.stringify(score)}`);
console.log(`rollup ${JSON.stringify(profile)}`);
console.log(`workout ${JSON.stringify(workout)}`);
console.log('\nPASS — buckets, score, rollups and workout sessions agree.');
cleanup();

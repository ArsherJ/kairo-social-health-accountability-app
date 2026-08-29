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
//
// **Two** sessions, and the second one is the point. The three origin columns
// (`source_bundle_id`, `was_user_entered`, `has_heart_rate_evidence`) all
// default to false/null, so a single session sending false and null observes
// nothing a missing column would not also produce. The pair is chosen so every
// assertion below is on a value the DEFAULT cannot supply: the Apple-sourced
// one carries a bundle id and heart-rate evidence, the hand-typed one carries
// `was_user_entered = true`.
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
    // On WORKOUT_SOURCE_ALLOWLIST, so this session is what §3's STR threshold
    // shift is computed from — the branch Task 3 wired and nothing observed.
    sourceBundleId: 'com.apple.workout',
    wasUserEntered: false,
    hasHeartRateEvidence: true,
  },
  {
    hkUuid: `smoke-manual-${userId}`,
    localDate,
    startedAt: new Date(Date.now() - 120 * 60_000).toISOString(),
    endedAt: new Date(Date.now() - 90 * 60_000).toISOString(),
    activityType: 37,
    durationS: 1_800,
    distanceM: 0,
    activeKcal: 100,
    sourceBundleId: null,
    wasUserEntered: true,
    hasHeartRateEvidence: false,
  },
];

const { error: syncError } = await supabase.functions.invoke('sync-health', {
  body: {
    timezone: TZ,
    // `wasUserEntered: false` is load-bearing rather than decoration: a
    // hand-typed night scores no MND and does not open §3's capability window,
    // so the normalization assertion below would read 1.500 instead of 1.000.
    sleep: [{ localDate, minutes: 420, wasUserEntered: false }],
    buckets,
    sessions,
  },
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
  // normalization_factor is the branch's one new write-path column. Selecting
  // it is half the check: a 400 here says the migration has not been applied,
  // which is the same source/artifact drift this script exists for.
  .select(
    'agi_points, str_points, mind_points, total, xp_awarded, status, normalization_factor',
  )
  .eq('user_id', userId)
  .eq('local_date', localDate)
  .maybeSingle();
if (scoreError) {
  fail(
    'daily_scores',
    `${scoreError.message} — if this names normalization_factor, migration ` +
      '20260819130000 has not been applied',
  );
}
// This is the outage signature exactly: buckets accepted, no score written.
if (!score) fail('daily_scores', 'buckets synced but NO score row was written');
if (score.total <= 0) fail('daily_scores', `score row written but total=${score.total}`);

// The other half, and the one a 500 could never have shown: the column has to
// carry the value the engine computed, not its 1.000 DEFAULT by coincidence.
// The payload sends a real, non-hand-typed night, so all three stats are
// earnable and §2's factor is exactly 1.000 — a deployed function that never
// passes `earnableStats` produces the same number, so this is checked
// together with mind_points, which such a function cannot produce at all.
if (score.normalization_factor === undefined || score.normalization_factor === null) {
  fail('daily_scores', 'normalization_factor is absent from the score row');
}
if (Number(score.normalization_factor) !== 1) {
  fail(
    'daily_scores',
    `normalization_factor=${score.normalization_factor}, expected 1.000 — the ` +
      'deployed function scored this day as phone-only despite a real night of sleep',
  );
}
if (score.mind_points <= 0) {
  fail(
    'daily_scores',
    `420 minutes of sleep were sent and mind_points=${score.mind_points} — the ` +
      'deployed sync-health predates the three-stat switch',
  );
}

const { data: profile, error: rollupError } = await supabase
  .from('profiles')
  // end_total and vit_total still exist and are dropped in Phase 3; nothing
  // writes them any more, so asserting on them would test the past.
  .select('total_xp, level, agi_total, str_total, mnd_total, has_sleep_source')
  .eq('id', userId)
  .maybeSingle();
if (rollupError) fail('profiles', rollupError.message);
if (!profile || profile.agi_total <= 0) {
  fail('profiles', `rollups did not move: ${JSON.stringify(profile)}`);
}
// mnd_total is maintained by recalculate_user_xp(), and the rollup trigger's
// skip guard learned about mind_points in the same migration. A guard that
// never saw it leaves this at 0 with no error anywhere — the exact shape of
// the bug 20260810150000 was written to fix, reopened by the new column.
if (profile.mnd_total <= 0) {
  fail(
    'profiles',
    `mind_points=${score.mind_points} scored but mnd_total=${profile.mnd_total} — ` +
      'recalculate_user_xp() or the rollup skip guard does not know about mind_points',
  );
}

const { data: workouts, error: workoutError } = await supabase
  .from('workout_sessions')
  .select(
    'hk_uuid, activity_type, distance_m, active_kcal, source_bundle_id, ' +
      'was_user_entered, has_heart_rate_evidence',
  )
  .eq('user_id', userId)
  .order('hk_uuid');
if (workoutError) {
  fail(
    'workout_sessions',
    `${workoutError.message} — if this names one of the origin columns, ` +
      'migration 20260819100000 has not been applied',
  );
}
const workout = (workouts ?? []).find((w) => w.hk_uuid === `smoke-${userId}`);
const manual = (workouts ?? []).find((w) => w.hk_uuid === `smoke-manual-${userId}`);
if (!workout || !manual) {
  fail(
    'workout_sessions',
    'sync accepted the payload but the session rows were not written — the ' +
      'deployed sync-health predates the workout_sessions migration, or the ' +
      'migration has not been applied',
  );
}

// Each assertion is on a value the column DEFAULT cannot produce, which is
// what makes this an observation of the write path rather than of the schema.
if (workout.source_bundle_id !== 'com.apple.workout') {
  fail(
    'workout_sessions',
    `source_bundle_id=${JSON.stringify(workout.source_bundle_id)}, expected ` +
      '"com.apple.workout" — the deployed sync-health drops the origin fields, ' +
      'so every session reads unverified and §3 never shifts the STR threshold',
  );
}
if (workout.has_heart_rate_evidence !== true) {
  fail(
    'workout_sessions',
    `has_heart_rate_evidence=${workout.has_heart_rate_evidence}, expected true`,
  );
}
if (manual.was_user_entered !== true) {
  fail(
    'workout_sessions',
    `was_user_entered=${manual.was_user_entered} on the hand-typed session, ` +
      'expected true — a hand-typed workout is being counted as verified',
  );
}

console.log(`score   ${JSON.stringify(score)}`);
// The payload carried a real, non-user-entered night, so the deployed function
// must have observed sleep capability and persisted it. This is not cosmetic:
// the client draws quests from this column and `finalize-days` grades against
// it, so a deploy where the write is missing silently withholds every sleep
// quest from every account — with the day still scoring perfectly, which is
// exactly the kind of drift a source-only test cannot see.
if (profile.has_sleep_source !== true) {
  fail(
    'profiles',
    'a real night of sleep synced but has_sleep_source is still false — the ' +
      'deployed sync-health is not writing sleep capability',
  );
}

console.log(`rollup  ${JSON.stringify(profile)}`);
console.log(`workout ${JSON.stringify(workout)}`);
console.log(`manual  ${JSON.stringify(manual)}`);
console.log(
  '\nPASS — buckets, score, normalization, rollups, sleep capability and workout session origin agree.',
);
cleanup();

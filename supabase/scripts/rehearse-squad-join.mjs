#!/usr/bin/env node
/**
 * Put a second, throwaway member into a squad so the first one can watch.
 *
 * The half of the squad flow no automated test can reach. `supabase/tests`
 * proves `join_squad` and `squad_leaderboard` behave correctly under RLS, but
 * it runs against PGlite — which has a stubbed `realtime` schema and therefore
 * cannot prove that a broadcast **arrives at a subscribed client**. That is the
 * property the daily board depends on, and the only way to check it is to make
 * something happen from outside and look at a real phone.
 *
 * It stages two observable events, deliberately apart:
 *
 *   1. the join   → an empty seat fills, `SlotUnlockReveal` should fire
 *   2. the sync   → a real score lands and the board should reorder
 *
 * Both should appear on the watching device **without pulling to refresh**. If
 * one only shows up after a manual refresh, `useSquadRealtime` is not receiving
 * — which is exactly the failure the schema suite cannot see.
 *
 * `--join-only` skips the score, which is what isolates the reveal. Both
 * effects otherwise arrive on the *same* broadcast: membership has no
 * broadcast of its own (Phase 4 follow-up #8), so `useSquadRealtime` rides the
 * member-count refetch on the `daily_scores` one — meaning a scored join fires
 * the unlock reveal and re-ranks the board in the same frame, and the reveal is
 * easy to miss inside the reorder. With no score, the only thing that can
 * change is the seat.
 *
 * The refetch then needs a trigger, and foregrounding the app is one
 * (`dispatch({ kind: 'foreground' })`). So: run this, background the app,
 * come back, and the reveal fires alone.
 *
 * Usage:
 *
 *   node supabase/scripts/rehearse-squad-join.mjs UFVHWA
 *   node supabase/scripts/rehearse-squad-join.mjs UFVHWA --join-only
 *   node supabase/scripts/rehearse-squad-join.mjs UFVHWA --rejoin
 *   node supabase/scripts/rehearse-squad-join.mjs --cleanup
 *
 * The account is anonymous and disposable. `--cleanup` erases every account
 * this script has ever made, through `auth.users`, which cascades — the same
 * exit smoke-sync.mjs uses. Nothing here touches a real user's rows.
 *
 * Anonymous sign-in works because `external_anonymous_users_enabled` is true on
 * the project on purpose (deviation #7): the `__DEV__` guard in
 * `availableProviders()`, not the project setting, is what keeps anonymous out
 * of TestFlight.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(PROJECT, 'package.json'));
const { createClient } = require('@supabase/supabase-js');

/** Marks the accounts this script owns, so --cleanup cannot overreach. */
const NAME_PREFIX = 'Rehearsal';
const TZ = 'Asia/Manila';

const env = Object.fromEntries(
  readFileSync(join(PROJECT, '.env'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

function sql(statement) {
  const out = execFileSync(
    join(PROJECT, 'supabase', 'scripts', 'remote-sql.sh'),
    [statement],
    { encoding: 'utf8', stdio: 'pipe' },
  );
  const start = out.indexOf('[');
  return start === -1 ? [] : JSON.parse(out.slice(start));
}

const arg = process.argv[2];

if (arg === '--cleanup') {
  // Scoped by the name prefix, never by "all anonymous users" — a real beta
  // tester could be anonymous in a dev build, and this runs against the live
  // project.
  const gone = sql(`
    delete from auth.users
    where id in (select id from profiles where character_name like '${NAME_PREFIX}%')
    returning id;
  `);
  console.log(`removed ${gone.length} rehearsal account(s)`);
  process.exit(0);
}

if (!arg) {
  console.error('Usage: node supabase/scripts/rehearse-squad-join.mjs <INVITE_CODE> [--join-only]');
  console.error('       node supabase/scripts/rehearse-squad-join.mjs --cleanup');
  process.exit(1);
}

const inviteCode = arg.trim().toUpperCase();
const joinOnly = process.argv.includes('--join-only');
const rejoin = process.argv.includes('--rejoin');

const supabase = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function fail(step, detail) {
  console.error(`\nFAIL at ${step}: ${detail}`);
  process.exit(1);
}

const { data: auth, error: authError } = await supabase.auth.signInAnonymously();
if (authError) fail('sign-in', authError.message);
const userId = auth.user.id;

const characterName = `${NAME_PREFIX}${String(Date.now()).slice(-4)}`;
const { error: profileError } = await supabase
  .from('profiles')
  .insert({ id: userId, character_name: characterName, timezone: TZ });
if (profileError) fail('profile insert', profileError.message);

console.log(`created ${characterName} (${userId})`);

// ---------------------------------------------------------------------------
// Event 1 — the seat fills
// ---------------------------------------------------------------------------
const { data: joined, error: joinError } = await supabase.rpc('join_squad', {
  p_invite_code: inviteCode,
});
if (joinError) fail('join_squad', `${joinError.code} ${joinError.message}`);

// `join_squad` is `returns public.squads`, so this is the squad row itself.
console.log(`joined "${joined.name}" (${joined.program}, ${joined.id})`);

if (rejoin) {
  // `leave_squad()` and rejoining, against the **hosted** auth schema.
  // `supabase/tests` covers the logic, but docs/mvp-completion-plan.md names
  // this as one of two things the PGlite harness cannot settle, because its
  // `auth` schema is a stub. So it is checked here, for real.
  //
  // An ordinary member, deliberately — not the leader. Succession is a
  // different path and testing it on a live squad would hand someone else's
  // squad to a throwaway account.
  const { error: leaveError } = await supabase.rpc('leave_squad', {
    p_squad_id: joined.id,
  });
  if (leaveError) fail('leave_squad', `${leaveError.code} ${leaveError.message}`);

  const afterLeave = sql(`
    select count(*)::int as n from squad_members
    where squad_id = '${joined.id}' and user_id = '${userId}'
  `);
  if (afterLeave[0]?.n !== 0) fail('leave_squad', 'membership row survived the leave');
  console.log('left the squad — membership row is gone');

  const { data: rejoined, error: rejoinError } = await supabase.rpc('join_squad', {
    p_invite_code: inviteCode,
  });
  if (rejoinError) fail('rejoin', `${rejoinError.code} ${rejoinError.message}`);
  if (rejoined.id !== joined.id) fail('rejoin', 'landed in a different squad');

  const afterRejoin = sql(`
    select count(*)::int as n from squad_members
    where squad_id = '${joined.id}' and user_id = '${userId}'
  `);
  if (afterRejoin[0]?.n !== 1) fail('rejoin', 'membership row did not come back');

  console.log('rejoined with the same code — PASS');
  console.log('\nleave_squad() and rejoin both behave on the hosted auth schema.');
  process.exit(0);
}

if (joinOnly) {
  console.log(
    '\n→ The seat is taken, and nothing has broadcast — membership has no\n' +
      '  signal of its own. Background Kairo and come back: the foreground\n' +
      '  refetch is what moves the count, and SlotUnlockReveal should fire\n' +
      '  on its own, with no reordering to hide inside.',
  );
  process.exit(0);
}

console.log('\n→ WATCH THE PHONE: an empty seat should fill, with no refresh.');

// Long enough to look up from the terminal, short enough not to be a wait.
// The two events have to be separable, or a board that only updates on one of
// them looks like a board that updates.
for (let i = 15; i > 0; i -= 5) {
  console.log(`   scoring in ${i}s…`);
  await sleep(5000);
}

// ---------------------------------------------------------------------------
// Event 2 — a score lands and the board reorders
// ---------------------------------------------------------------------------
// A whole day, all 24 hours including zeros, the way the client sends it
// (deviation #8). Deliberately a big day: the point is to displace whoever is
// currently top, and a rehearsal that ties proves nothing about ordering.
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const buckets = Array.from({ length: 24 }, (_, hour) => {
  const active = hour >= 6 && hour < 20;
  return {
    localDate,
    hour,
    steps: active ? 1400 : 0,
    distanceM: active ? 1050 : 0,
    activeKcal: active ? 34 : 0,
    activeMinutes: active ? 8 : 0,
    hadWorkout: false,
    elevatedHeartRate: false,
    avgHeartRate: null,
  };
});

const { error: syncError } = await supabase.functions.invoke('sync-health', {
  body: { timezone: TZ, buckets, sleep: [{ localDate, minutes: 420 }] },
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

console.log('\n→ WATCH THE PHONE: the board should reorder, still with no refresh.');

// The board as the new member sees it — which is also a check that
// squad_leaderboard's program weighting and rank agree with what the phone is
// showing. A disagreement here means the two are reading different things.
const { data: board, error: boardError } = await supabase.rpc('squad_leaderboard', {
  p_squad_id: joined.id,
});
if (boardError) {
  console.log(`(could not read the board back: ${boardError.message})`);
} else {
  console.log('\nBoard, as the joining member sees it:');
  for (const row of board ?? []) {
    console.log(
      `  ${row.rank}. ${row.character_name.padEnd(14)} ${String(row.total).padStart(6)}` +
        `  ${row.status}${row.is_self ? '   ← the rehearsal account' : ''}`,
    );
  }
}

console.log(
  `\nLeave it in place to test rejoin, or remove it with:\n` +
    `  node supabase/scripts/rehearse-squad-join.mjs --cleanup`,
);

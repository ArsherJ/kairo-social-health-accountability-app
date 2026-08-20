#!/usr/bin/env node
/**
 * Operator front end for the `replay-scores` Edge Function.
 *
 * Step 6 of the three-stat deploy window — "replay all history" — had no
 * command under it for most of Phase 3. This is it. The function does the work;
 * this only makes the result readable, because the number an operator has to
 * act on mid-window ("did every day move, and did any day's `finalized_at`
 * change?") is not something to read out of a wall of JSON.
 *
 * Usage:
 *
 *   REPLAY_SECRET=… node supabase/scripts/replay-scores.mjs --dry-run
 *   REPLAY_SECRET=… node supabase/scripts/replay-scores.mjs --commit
 *
 * Always run `--dry-run` first and read every row. `--commit` rewrites every
 * score row in the project.
 *
 * Reads EXPO_PUBLIC_SUPABASE_* from `.env` — the publishable key only, which
 * authenticates nothing on its own and exists because the Functions gateway
 * rejects a request with no Authorization header before the handler runs (see
 * 20260807110500). The real guard is `REPLAY_SECRET`, compared inside the
 * handler, and it is deliberately not `CRON_SECRET`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const HELP = `replay-scores — recompute every stored day through the current engine

  node supabase/scripts/replay-scores.mjs --dry-run [options]
  node supabase/scripts/replay-scores.mjs --commit  [options]

Exactly one mode is required; there is no default, because the two differ by
whether every score row in the project is rewritten.

  --dry-run        Report what would be written. Writes nothing.
  --commit         Write it.
  --user <uuid>    Replay one user only. Default: every user.
  --limit <n>      Cap days per invocation (1..500). Default: 500.
  --json           Print the raw report instead of the table.
  --help           This.

Environment:
  REPLAY_SECRET    Required. Must match the function's own secret:
                     supabase secrets set REPLAY_SECRET=… --project-ref <ref>
                   The function refuses to run when it is unset — unlike
                   finalize-days, an unset secret here means refuse, not allow.

What a replay does and does not do:
  It recomputes agi/str/mind/consistency points, the total, the normalization
  factor, contributing_stats and XP, from stored health_buckets, through the
  same rescoreDay() every other write path uses.
  It does NOT move status or finalized_at. A day that finalized on 2026-08-14
  is still a day that finalized on 2026-08-14.
`;

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
  process.stdout.write(HELP);
  process.exit(argv.length === 0 ? 64 : 0);
}

function flagValue(name) {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  const value = argv[i + 1];
  if (!value || value.startsWith('--')) {
    console.error(`${name} needs a value`);
    process.exit(64);
  }
  return value;
}

const dry = argv.includes('--dry-run');
const commit = argv.includes('--commit');
if (dry === commit) {
  console.error('pass exactly one of --dry-run or --commit (see --help)');
  process.exit(64);
}

const body = { dryRun: dry };
const user = flagValue('--user');
if (user) body.userId = user;
const limit = flagValue('--limit');
if (limit) {
  body.limit = Number(limit);
  if (!Number.isInteger(body.limit) || body.limit < 1) {
    console.error('--limit must be a positive integer');
    process.exit(64);
  }
}

const secret = process.env.REPLAY_SECRET;
if (!secret) {
  console.error('REPLAY_SECRET is not set in this shell — refusing to send');
  process.exit(78);
}

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

const response = await fetch(`${url}/functions/v1/replay-scores`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    'x-replay-secret': secret,
  },
  body: JSON.stringify(body),
});

const text = await response.text();
let report;
try {
  report = JSON.parse(text);
} catch {
  console.error(`HTTP ${response.status}: ${text}`);
  process.exit(1);
}

if (!response.ok || report.error) {
  console.error(`HTTP ${response.status}: ${report.error ?? text}`);
  process.exit(1);
}

if (argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const head = [
    'date'.padEnd(10),
    'status'.padEnd(11),
    'finalized_at'.padEnd(24),
    'total'.padStart(12),
    'stats'.padStart(7),
    'norm'.padStart(11),
    'xp'.padStart(11),
  ].join(' ');
  console.log(head);
  console.log('-'.repeat(head.length));
  for (const day of report.days) {
    console.log(
      [
        day.localDate.padEnd(10),
        day.status.padEnd(11),
        (day.finalizedAt ?? '—').padEnd(24),
        `${day.before.total}→${day.after.total}`.padStart(12),
        `${day.before.contributingStats}→${day.after.contributingStats}`.padStart(7),
        `${day.before.normalizationFactor}→${day.after.normalizationFactor}`.padStart(11),
        `${day.before.xpAwarded}→${day.after.xpAwarded}`.padStart(11),
      ].join(' '),
    );
  }
  console.log('');
  console.log(
    `${report.dryRun ? 'DRY RUN' : 'COMMITTED'} — scanned ${report.scanned}, ` +
      `replayed ${report.replayed}, changed ${report.changed}, ` +
      `failures ${report.failures.length}${report.truncated ? ', TRUNCATED' : ''}`,
  );
}

for (const failure of report.failures) {
  console.error(`FAILED ${failure.userId} ${failure.localDate}: ${failure.error}`);
}

// A truncated run is not a finished one, and a failure list is not an aside:
// step 7 checks `max(contributing_stats)` and will read 4 if either happened.
if (report.failures.length > 0 || report.truncated) process.exit(1);

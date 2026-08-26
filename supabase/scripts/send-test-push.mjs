#!/usr/bin/env node
/**
 * Send a push to a real device, on demand, and report what Apple did with it.
 *
 * The one scheduled push fires at a single local hour (`DIGEST_HOUR` in
 * supabase/functions/_shared/notification-plan.ts), so verifying push by
 * waiting for one costs most of a day and tests the dispatcher's clock
 * arithmetic at the same time as its delivery. This tests delivery alone:
 * registration → Expo → APNs → the banner → where the tap lands.
 *
 * That separation is the point. If this succeeds and a scheduled push never
 * arrives, the fault is in candidate selection or the budget, not in
 * credentials — and those are the two halves it is otherwise very easy to
 * confuse, because both present as "no notification".
 *
 * Usage:
 *
 *   node supabase/scripts/send-test-push.mjs                    # list who can be sent to
 *   node supabase/scripts/send-test-push.mjs Jay                 # → Today tab
 *   node supabase/scripts/send-test-push.mjs Jay squad           # → Squad tab
 *   node supabase/scripts/send-test-push.mjs Jay train           # → Challenges
 *   node supabase/scripts/send-test-push.mjs Jay events <id>     # → that battle
 *
 * The name matches `profiles.character_name`, case-insensitively. Tokens come
 * from `device_tokens` through remote-sql.sh, because port 5432 is blocked on
 * this network and the Management API over HTTPS is the only way in.
 *
 * No credential of ours is involved: Expo authenticates the *token*, not the
 * sender. Setting EXPO_ACCESS_TOKEN closes that off in production and this
 * script passes it through when present.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REMOTE_SQL = join(PROJECT, 'supabase', 'scripts', 'remote-sql.sh');

const EXPO_SEND = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS = 'https://exp.host/--/api/v2/push/getReceipts';

/** The screens `notificationTarget()` in src/features/notifications knows. */
const SCREENS = new Set(['today', 'squad', 'character', 'train', 'events']);

function sql(statement) {
  const out = execFileSync(REMOTE_SQL, [statement], { encoding: 'utf8', stdio: 'pipe' });
  // remote-sql.sh prints the Management API's JSON array, sometimes preceded by
  // progress chatter. Take the last JSON value in the output.
  const start = out.indexOf('[');
  if (start === -1) return [];
  return JSON.parse(out.slice(start));
}

const [name, screenArg = 'today', eventId] = process.argv.slice(2);

const registered = sql(`
  select p.character_name, d.token
  from device_tokens d
  join profiles p on p.id = d.user_id
  order by d.updated_at desc
`);

if (registered.length === 0) {
  console.error(
    'No device has registered for push.\n' +
      'Grant the permission in the app, then check the Delivery line in Profile.',
  );
  process.exit(1);
}

if (!name) {
  console.log('Devices that can be sent to:\n');
  for (const row of registered) console.log(`  ${row.character_name}`);
  console.log('\nRe-run with a name, e.g.:');
  console.log(`  node supabase/scripts/send-test-push.mjs ${registered[0].character_name}`);
  process.exit(0);
}

if (!SCREENS.has(screenArg)) {
  console.error(`Unknown screen "${screenArg}". Expected one of: ${[...SCREENS].join(', ')}`);
  process.exit(1);
}

const targets = registered.filter(
  (row) => row.character_name.toLowerCase() === name.toLowerCase(),
);

if (targets.length === 0) {
  console.error(`No registered device for "${name}". Run with no arguments to list them.`);
  process.exit(1);
}

// Deliberately the same shape the Edge Functions send, field for field —
// dispatch-notifications for the digest, finalize-days for the two latched
// pushes. A test payload that drifted from the real one would prove the
// routing works for a message nothing sends.
const TRIGGERS = {
  today: 'daily_digest',
  events: 'event_completed',
  train: 'challenge_cleared',
  // Historical, and still routed: a push sent before deviation #52's deploy can
  // be tapped after it, so the two retired destinations stay testable.
  squad: 'day_ending_soon',
  character: 'day_starts',
};

const data = {
  trigger: TRIGGERS[screenArg],
  localDate: new Date().toISOString().slice(0, 10),
  screen: screenArg,
  ...(eventId ? { eventId } : {}),
};

const where = {
  today: 'the Today tab',
  squad: 'the Squad tab',
  character: 'the Character tab',
  train: 'Challenges',
  events: 'that battle',
};

const messages = targets.map((row) => ({
  to: row.token,
  title: 'Kairo',
  body: `Tap me — I should open ${where[screenArg]}.`,
  sound: 'default',
  data,
}));

const accessToken = process.env.EXPO_ACCESS_TOKEN;

const response = await fetch(EXPO_SEND, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  },
  body: JSON.stringify(messages),
});

if (!response.ok) {
  console.error(`Expo rejected the request: ${response.status} ${await response.text()}`);
  process.exit(1);
}

const tickets = (await response.json()).data ?? [];
const ids = [];

tickets.forEach((ticket, i) => {
  if (ticket.status === 'ok') {
    ids.push(ticket.id);
    console.log(`queued → ${targets[i].character_name}`);
  } else {
    // DeviceNotRegistered is the one worth calling out: the deployed
    // sendToUser() deletes those tokens automatically, so it is self-healing
    // in production but looks like a mystery here.
    console.error(
      `rejected → ${targets[i].character_name}: ${ticket.message ?? ticket.status}` +
        (ticket.details?.error ? ` (${ticket.details.error})` : ''),
    );
  }
});

if (ids.length === 0) process.exit(1);

// The ticket only says Expo accepted it. The receipt says what APNs did, which
// is the half that actually answers "is the push credential right" — and it
// takes a few seconds to exist.
console.log('\nwaiting for APNs receipts…');
await sleep(5000);

const receipts = await fetch(EXPO_RECEIPTS, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  },
  body: JSON.stringify({ ids }),
}).then((r) => r.json());

let failed = false;
for (const [id, receipt] of Object.entries(receipts.data ?? {})) {
  if (receipt.status === 'ok') {
    console.log(`  ${id}: ok — Apple accepted it`);
  } else {
    failed = true;
    console.error(`  ${id}: ${receipt.status} ${receipt.message ?? ''}`);
    // The message that means the APNs key was never uploaded to Expo
    // (`eas credentials`), which is the failure this whole script exists to
    // make legible.
    if (receipt.details?.error) console.error(`    error: ${receipt.details.error}`);
  }
}

console.log(
  failed
    ? '\nDelivery failed. Check the APNs key on expo.dev, then `eas credentials`.'
    : '\nDelivered. A receipt of ok means Apple took it — if no banner appeared,\n' +
        'the fault is on the device (permission, Focus mode), not in the push path.',
);

process.exit(failed ? 1 : 0);

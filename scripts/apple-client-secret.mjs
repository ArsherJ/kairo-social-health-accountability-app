#!/usr/bin/env node
/**
 * Mint the Sign in with Apple client secret, and optionally install it on the
 * Supabase project.
 *
 * Apple does not issue a client secret. It is a short-lived ES256 JWT that you
 * sign yourself with the `.p8` key from the Developer portal, and **it expires
 * — six months at the outside**. When it expires, sign-in stops working for
 * everybody with no code change to blame, which is the same silent-failure
 * shape as the August 2026 deployment gap. So this script always prints the
 * exact expiry date, and refuses to mint a secret that outlives Apple's limit.
 *
 * Usage:
 *
 *   node scripts/apple-client-secret.mjs \
 *     --key ~/Downloads/AuthKey_ABC123DEFG.p8 \
 *     --team-id TEAM123456 \
 *     [--key-id ABC123DEFG] \
 *     [--client-id com.arsherj.kairo] \
 *     [--days 180] \
 *     [--push]
 *
 * `--key-id` is inferred from an `AuthKey_<KEYID>.p8` filename, which is what
 * Apple names the download.
 *
 * With `--push` the secret goes straight to the Supabase project over the
 * Management API and is never printed. Without it, the JWT is written to
 * stdout for pasting into the dashboard — note that this puts a live
 * credential in your scrollback.
 */

import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const DEFAULT_CLIENT_ID = 'com.arsherj.kairo';
const DEFAULT_PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'zniopywbwenrzxezolwv';
/**
 * Apple rejects anything longer. Their documented ceiling is 15777000 seconds,
 * which is 182.6 days — not "six months", and calendar months overshoot it.
 */
const APPLE_MAX_LIFETIME_SECONDS = 15_777_000;
/** Comfortably inside the ceiling, and a round number to diary against. */
const DEFAULT_LIFETIME_DAYS = 180;

function fail(message) {
  console.error(`apple-client-secret: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { push: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--push') {
      args.push = true;
      continue;
    }
    if (!arg.startsWith('--')) fail(`unexpected argument ${arg}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(`${arg} needs a value`);
    args[arg.slice(2)] = value;
    i += 1;
  }
  return args;
}

/** Apple names the download `AuthKey_<KEYID>.p8`, so the id is usually free. */
function keyIdFromFilename(path) {
  const match = /^AuthKey_([A-Z0-9]+)\.p8$/i.exec(basename(path));
  return match ? match[1] : null;
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function mint({ privateKeyPem, keyId, teamId, clientId, lifetimeSeconds }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + lifetimeSeconds;

  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = base64url(
    JSON.stringify({
      iss: teamId,
      iat: issuedAt,
      exp: expiresAt,
      aud: 'https://appleid.apple.com',
      // The bundle ID for the native iOS flow. A Services ID would go here
      // only for a web or Android client, which Kairo does not have.
      sub: clientId,
    }),
  );

  const signingInput = `${header}.${payload}`;
  // `ieee-p1363` is the r||s concatenation JOSE requires. Node's default is
  // DER, which every JWT verifier rejects — and the rejection surfaces as a
  // generic "invalid client", so it is worth being explicit about.
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: createPrivateKey(privateKeyPem),
    dsaEncoding: 'ieee-p1363',
  });

  return {
    token: `${signingInput}.${base64url(signature)}`,
    expiresAt: new Date(expiresAt * 1000),
  };
}

function supabaseToken() {
  try {
    const token = execFileSync(
      'security',
      ['find-generic-password', '-s', 'Supabase CLI', '-w'],
      { encoding: 'utf8' },
    ).trim();
    if (token) return token;
  } catch {
    // Fall through to the same message as an empty entry.
  }
  fail('no Supabase CLI token in the Keychain. Run: supabase login');
}

async function push({ projectRef, clientId, secret }) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${supabaseToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_apple_enabled: true,
      external_apple_client_id: clientId,
      external_apple_secret: secret,
    }),
  });

  if (!response.ok) {
    fail(`Supabase returned HTTP ${response.status}\n${await response.text()}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.key) fail('--key is required (the .p8 downloaded from the Developer portal)');
  if (!args['team-id']) fail('--team-id is required (Developer portal → Membership)');

  const keyId = args['key-id'] ?? keyIdFromFilename(args.key);
  if (!keyId) fail('--key-id is required when the file is not named AuthKey_<KEYID>.p8');

  const clientId = args['client-id'] ?? DEFAULT_CLIENT_ID;
  const days = Number(args.days ?? DEFAULT_LIFETIME_DAYS);
  if (!Number.isFinite(days) || days <= 0) fail('--days must be a positive number');

  const lifetimeSeconds = Math.round(days * 24 * 60 * 60);
  if (lifetimeSeconds > APPLE_MAX_LIFETIME_SECONDS) {
    fail(
      `--days ${days} exceeds Apple's maximum of ${APPLE_MAX_LIFETIME_SECONDS / 86_400} days; Apple would reject the secret`,
    );
  }

  let privateKeyPem;
  try {
    privateKeyPem = readFileSync(args.key, 'utf8');
  } catch (error) {
    fail(`cannot read ${args.key}: ${error.message}`);
  }

  const { token, expiresAt } = mint({
    privateKeyPem,
    keyId,
    teamId: args['team-id'],
    clientId,
    lifetimeSeconds,
  });

  if (args.push) {
    const projectRef = args['project-ref'] ?? DEFAULT_PROJECT_REF;
    await push({ projectRef, clientId, secret: token });
    console.log(`Apple provider enabled on ${projectRef} for client id ${clientId}.`);
  } else {
    console.log(token);
  }

  console.error('');
  console.error(`  Client ID: ${clientId}`);
  console.error(`  Key ID:    ${keyId}`);
  console.error(`  EXPIRES:   ${expiresAt.toISOString().slice(0, 10)}`);
  console.error('');
  console.error('  Put that date in a calendar now. When it passes, sign-in fails for');
  console.error('  every user at once and nothing in the codebase will have changed.');
  console.error('  Re-run this script with the same key to mint a fresh secret.');
}

await main();

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import type { PushMessage } from './notification-copy.ts';

/**
 * The FCM HTTP v1 boundary — the only place in the codebase that talks to a
 * push provider.
 *
 * Credentials come from a function secret, never the repo:
 *
 *   supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
 *
 * **Absent credentials are a supported state, not an error.** The Developer
 * Program gates the APNs auth key, so until it lands every send returns
 * `not_configured` and the dispatcher runs end to end without it — which is
 * itself the integration test for everything except the last hop.
 *
 * ⚠️ **The last hop has an open question worth stating plainly.** FCM addresses
 * *FCM registration tokens*. On iOS, `expo-notifications` hands back an APNs
 * device token, and only the Firebase Messaging SDK exchanges that for an FCM
 * token. So delivery needs one of two decisions at the Apple gate: add
 * `@react-native-firebase/messaging` to the client, or drop FCM and send via
 * Expo's push service, which speaks APNs tokens directly. Everything either
 * choice touches is inside this file and `registerDeviceToken` on the client —
 * `device_tokens` stores an opaque string and does not care.
 */

const SERVICE_ACCOUNT = Deno.env.get('FCM_SERVICE_ACCOUNT');
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export type PushOutcome =
  | { ok: true }
  | { ok: false; reason: 'not_configured' }
  /** FCM says this token is dead. The caller deletes it rather than retrying. */
  | { ok: false; reason: 'unregistered' }
  | { ok: false; reason: 'error'; message: string };

export function pushConfigured(): boolean {
  return Boolean(SERVICE_ACCOUNT);
}

function serviceAccount(): ServiceAccount {
  return JSON.parse(SERVICE_ACCOUNT!) as ServiceAccount;
}

function base64Url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string'
    ? bytes
    : String.fromCharCode(...bytes);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PEM -> the DER bytes crypto.subtle.importKey wants. */
function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const der = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) der[i] = binary.charCodeAt(i);
  return der.buffer as ArrayBuffer;
}

// Google's tokens last an hour. Cached in module scope so a dispatch run
// sending to fifty users performs one OAuth round trip, not fifty.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // A minute of slack, so a token cannot expire between the check and the send.
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;

  const account = serviceAccount();
  const claims = {
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };

  const unsigned = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${
    base64Url(JSON.stringify(claims))
  }`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    // A secret pasted through a shell often arrives with literal \n.
    pemToDer(account.private_key.replace(/\\n/g, '\n')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64Url(signature)}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`token exchange failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: now + body.expires_in };
  return body.access_token;
}

/**
 * Send one message to one device token.
 *
 * `data` is what the tap deep-links on (§14: "all notifications deep-link to
 * relevant screen"). FCM requires every data value to be a string.
 */
export async function sendPush(
  token: string,
  message: PushMessage,
  data: Record<string, string> = {},
): Promise<PushOutcome> {
  if (!SERVICE_ACCOUNT) return { ok: false, reason: 'not_configured' };

  try {
    const account = serviceAccount();
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data,
            apns: {
              payload: { aps: { sound: 'default' } },
            },
          },
        }),
      },
    );

    if (response.ok) return { ok: true };

    const text = await response.text();
    // 404 UNREGISTERED is FCM saying the app was deleted or the token rotated.
    // Retrying it forever is how a token table fills with the dead.
    if (response.status === 404 || text.includes('UNREGISTERED')) {
      return { ok: false, reason: 'unregistered' };
    }
    return { ok: false, reason: 'error', message: `${response.status} ${text}` };
  } catch (error) {
    return { ok: false, reason: 'error', message: (error as Error).message };
  }
}

/**
 * Send to every device a user has registered.
 *
 * Returns whether at least one device was reached, which is what decides
 * whether a `notification_log` row is written — a send that reached nobody must
 * not consume the user's daily budget.
 */
export async function sendToUser(
  admin: SupabaseClient,
  userId: string,
  message: PushMessage,
  data: Record<string, string> = {},
): Promise<{ delivered: number; failures: string[] }> {
  const { data: rows, error } = await admin
    .from('device_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error) return { delivered: 0, failures: [error.message] };

  const tokens = (rows ?? []).map((r) => r.token as string);
  let delivered = 0;
  const failures: string[] = [];
  const dead: string[] = [];

  for (const token of tokens) {
    const outcome = await sendPush(token, message, data);
    if (outcome.ok) {
      delivered += 1;
    } else if (outcome.reason === 'unregistered') {
      dead.push(token);
    } else {
      failures.push(outcome.reason === 'not_configured' ? 'not_configured' : outcome.message);
    }
  }

  if (dead.length > 0) {
    await admin.from('device_tokens').delete().in('token', dead);
  }

  return { delivered, failures };
}

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.58.0';
import type { PushMessage } from './notification-copy.ts';
import { classifyTicket, expoMessagesFor, type ExpoTicket } from './push-plan.ts';

/**
 * The Expo push boundary — the only place in the codebase that talks to a push
 * provider.
 *
 * **Why Expo and not FCM,** which spec C locked: FCM addresses *FCM
 * registration tokens*, and `expo-notifications` on iOS hands back an APNs
 * device token. Only the Firebase Messaging SDK bridges those, so the specced
 * pairing could not have delivered a single notification. Founder decision
 * 2026-08-07, recorded as deviation #15. Expo's service speaks to APNs on our
 * behalf, the app is already all-in on Expo, and the swap deleted more code
 * than it added.
 *
 * **There is no server credential.** Expo authenticates the *token*, not the
 * sender, so this works today with nothing configured. What the Apple
 * Developer Program still gates is the APNs key that Expo needs on its side —
 * upload it with `eas credentials`. Until then a send returns a ticket error
 * rather than silently doing nothing, which is the honest failure.
 *
 * `EXPO_ACCESS_TOKEN` is optional and recommended for production: with it set,
 * a leaked push token cannot be used by anyone else to notify your users.
 *
 *   supabase secrets set EXPO_ACCESS_TOKEN=<token from expo.dev>
 */

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

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
  // One request for all of a user's devices. Expo accepts up to 100 messages
  // per call, and nobody in this product has 100 phones.
  const messages = expoMessagesFor(tokens, message, data);

  if (messages.length === 0) {
    return {
      delivered: 0,
      failures: tokens.length > 0 ? ['no addressable expo push token'] : [],
    };
  }

  let tickets: ExpoTicket[];
  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      return {
        delivered: 0,
        failures: [`${response.status} ${await response.text()}`],
      };
    }

    const body = (await response.json()) as { data?: ExpoTicket[] };
    tickets = body.data ?? [];
  } catch (err) {
    return { delivered: 0, failures: [(err as Error).message] };
  }

  let delivered = 0;
  const failures: string[] = [];
  const dead: string[] = [];

  // Tickets come back positionally, in the order the messages were sent.
  tickets.forEach((ticket, i) => {
    const result = classifyTicket(ticket);
    if (result.outcome === 'ok') delivered += 1;
    else if (result.outcome === 'unregistered') dead.push(messages[i]!.to);
    else failures.push(result.message);
  });

  if (dead.length > 0) {
    await admin.from('device_tokens').delete().in('token', dead);
  }

  return { delivered, failures };
}

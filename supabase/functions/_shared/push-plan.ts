/**
 * The decision-making half of push delivery, kept free of I/O so it can be
 * tested in plain Node.
 *
 * Which tokens are addressable, what the request body looks like, and what
 * Expo's answer means. `push.deno.ts` does the HTTP and nothing else.
 */

import type { PushMessage } from './notification-copy.ts';

/**
 * Expo issues tokens as `ExponentPushToken[...]`; newer clients also emit the
 * `ExpoPushToken[...]` spelling. Both are valid and both must be accepted.
 */
const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

/**
 * Whether Expo can address this token at all.
 *
 * Load-bearing during the transport change: `device_tokens` held raw APNs
 * device tokens while the server still spoke FCM, and Expo rejects those one
 * slow round trip at a time with a message about registered recipients. Better
 * to know before sending.
 */
export function isExpoPushToken(token: string): boolean {
  return EXPO_TOKEN_PATTERN.test(token);
}

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  /** §14: every notification deep-links to the relevant screen. */
  data: Record<string, string>;
  sound: 'default';
}

/** One message per addressable token. Unaddressable ones are dropped, not sent. */
export function expoMessagesFor(
  tokens: readonly string[],
  message: PushMessage,
  data: Record<string, string>,
): ExpoMessage[] {
  return tokens.filter(isExpoPushToken).map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data,
    sound: 'default' as const,
  }));
}

/** One entry of Expo's `data` array — a "push ticket". */
export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export type TicketOutcome =
  | { outcome: 'ok' }
  /** Expo's name for FCM's UNREGISTERED. The caller deletes rather than retries. */
  | { outcome: 'unregistered' }
  | { outcome: 'error'; message: string };

export function classifyTicket(ticket: ExpoTicket): TicketOutcome {
  if (ticket.status === 'ok') return { outcome: 'ok' };

  const code = ticket.details?.error;
  if (code === 'DeviceNotRegistered') return { outcome: 'unregistered' };

  return {
    outcome: 'error',
    message: code ? `${code}: ${ticket.message ?? ''}` : (ticket.message ?? 'unknown error'),
  };
}

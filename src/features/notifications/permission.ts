import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase.ts';
import type { NotificationPermission } from './ask-policy.ts';

/**
 * The thin I/O half of the notification permission flow. Every decision lives
 * in `ask-policy.ts`; nothing importable from `expo-notifications` appears
 * there, which is what keeps the rule testable in Node.
 */

/** iOS's three-state answer, in our own vocabulary. */
export async function readNotificationPermission(): Promise<NotificationPermission> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  // `undetermined` plus canAskAgain=false is a denial iOS will not re-prompt
  // for; treating it as undetermined would show a sheet whose button is a no-op.
  if (status === 'undetermined' && canAskAgain) return 'undetermined';
  return 'denied';
}

/** Shows the OS dialog. Only ever called from behind our own explaining sheet. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted' ? 'granted' : 'denied';
}

/**
 * The last token written this session.
 *
 * Two jobs. It lets sign-out delete the registration without asking APNs for
 * the token again, and it collapses the repeat writes that a token listener
 * firing more than once would otherwise produce.
 */
let lastWrittenToken: string | null = null;

/**
 * Hand a push token to the server.
 *
 * Through the `register_device_token` RPC rather than an upsert on
 * `device_tokens`: the table's primary key is the token, so a device that
 * changed hands has to move to its new owner, and the RLS UPDATE policy tests
 * the row that is already there — which still belongs to the previous owner.
 *
 * Fire-and-forget in spirit, like telemetry: a failed registration costs the
 * user notifications, and must never cost them the screen they were on.
 */
export async function upsertDeviceToken(token: string): Promise<boolean> {
  if (!token) return false;
  if (token === lastWrittenToken) return true;

  const { error } = await supabase.rpc('register_device_token', {
    p_token: token,
    p_platform: Platform.OS === 'android' ? 'android' : 'ios',
  });
  if (error) {
    console.warn('[notifications] token registration failed', error.code, error.message);
    return false;
  }

  lastWrittenToken = token;
  return true;
}

/**
 * Ask the OS for this device's token, then register it.
 *
 * **Call this once, from a mount effect — never from the push-token listener.**
 * `getDevicePushTokenAsync()` asks iOS to register for remote notifications,
 * and a token arriving from that request *fires the listener*. A listener that
 * responds by calling this function feeds itself: hand verification on the
 * simulator produced 66 registration attempts in 25 seconds. The listener has
 * the new token in its argument and must use it directly.
 *
 * ⚠️ **What this returns is an APNs device token**, and the server currently
 * sends through FCM, which addresses FCM registration tokens. Closing that gap
 * is a decision for the Apple gate — add `@react-native-firebase/messaging` to
 * mint an FCM token, or send through Expo's push service, which speaks APNs
 * directly. `device_tokens` stores an opaque string and is indifferent; the
 * change is this function and `_shared/push.deno.ts`.
 */
export async function registerDeviceToken(): Promise<boolean> {
  try {
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    return await upsertDeviceToken(String(token ?? ''));
  } catch (error) {
    // Routine on a simulator with no APNs path, and survivable on a device:
    // the next foreground tries again.
    console.warn('[notifications] could not read a push token', (error as Error).message);
    return false;
  }
}

/**
 * Drop this device's registration.
 *
 * Called on sign-out. Without it, the next person to sign in on this phone
 * keeps receiving the previous account's sabotage alerts until the server
 * happens to try the token and FCM reports it dead — which it never will,
 * because the token is perfectly alive.
 *
 * Uses the remembered token rather than asking APNs for it again, for the same
 * reason the listener does: that call has a side effect.
 */
export async function unregisterDeviceToken(): Promise<void> {
  if (!lastWrittenToken) return;
  try {
    await supabase.from('device_tokens').delete().eq('token', lastWrittenToken);
  } catch {
    // Best effort. Signing out must not be blocked by a push registration.
  } finally {
    lastWrittenToken = null;
  }
}

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
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
 * The EAS project the Expo push service issues tokens against.
 *
 * Populated by `eas init`, which writes `extra.eas.projectId` into the app
 * config. Until that has been run there is no id to ask with, and
 * `getExpoPushTokenAsync` throws — so this is checked explicitly and reported
 * once, rather than surfacing as a mystery at every launch.
 */
function easProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    // Present in builds produced by EAS even when the config is not.
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

/**
 * Ask Expo for this device's push token, then register it.
 *
 * **Call this once, from a mount effect — never from the push-token listener.**
 * Getting a token asks iOS to register for remote notifications, and the token
 * that arrives from that request *fires the listener*. A listener that responds
 * by calling this function feeds itself: hand verification on the simulator
 * produced 66 registration attempts in 25 seconds before this was split apart.
 *
 * An **Expo** push token, not the raw APNs one — `ExponentPushToken[...]`.
 * Expo's service holds the APNs key and relays for us (deviation #15), which is
 * why nothing here or on the server needs a push credential.
 */
export async function registerDeviceToken(): Promise<boolean> {
  const projectId = easProjectId();
  if (!projectId) {
    console.warn(
      '[notifications] no EAS projectId — run `eas init`. Push is registered but undeliverable until then.',
    );
    return false;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return await upsertDeviceToken(String(token ?? ''));
  } catch (error) {
    // Routine on a simulator with no APNs path, and survivable on a device:
    // Expo's docs call this out as expected when offline, and the next
    // foreground tries again.
    console.warn('[notifications] could not read a push token', (error as Error).message);
    return false;
  }
}

/** The last native token the rotation listener acted on. See below. */
let lastSeenDeviceToken: string | null = null;

/**
 * React to APNs handing this device a new native token.
 *
 * The listener reports the *native* token, but the server addresses Expo
 * tokens, so the new one has to be exchanged — which means calling back into
 * `registerDeviceToken()`, which asks for a token, which fires this listener
 * again. That is the same cycle that produced 66 attempts in 25 seconds.
 *
 * The dedupe is what breaks it: the echo carries the token we just acted on, so
 * it stops here. Only a genuinely different native token gets exchanged.
 */
export async function handleDeviceTokenRotation(deviceToken: string): Promise<void> {
  if (!deviceToken || deviceToken === lastSeenDeviceToken) return;
  lastSeenDeviceToken = deviceToken;
  await registerDeviceToken();
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
    lastSeenDeviceToken = null;
  }
}

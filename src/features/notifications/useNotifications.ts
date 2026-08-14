import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { track } from '@/features/telemetry/events.ts';
import {
  handleDeviceTokenRotation,
  readNotificationPermission,
  registerDeviceToken,
} from './permission.ts';
import { notificationTarget } from './routing.ts';

/**
 * Keeps this device's push registration current.
 *
 * Two things move under us: the user may grant permission from Settings rather
 * than from our sheet, and APNs may rotate the token at any time. Neither
 * produces an error anywhere — the server simply stops reaching the device —
 * so both are watched rather than assumed.
 *
 * The listener reports the *native* token while the server addresses Expo
 * tokens, so a rotation has to be exchanged — and asking for a token fires this
 * listener again. `handleDeviceTokenRotation` owns the dedupe that breaks that
 * cycle; hand verification on the simulator caught the un-broken version doing
 * 66 registration attempts in 25 seconds.
 */
export function useDeviceTokenRegistration(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    void readNotificationPermission().then((permission) => {
      if (!cancelled && permission === 'granted') void registerDeviceToken();
    });

    const subscription = Notifications.addPushTokenListener((token) => {
      void handleDeviceTokenRotation(String(token.data ?? ''));
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [userId]);
}

/**
 * Takes the user where a tapped notification promised to take them.
 *
 * Every push carries a destination — `dispatch-notifications` sends
 * `{ trigger, localDate, screen }` and `finalize-days` adds `goalId` — and
 * until this existed nothing read any of it. §14 specifies the deep link; the
 * server half has been sending it correctly the whole time.
 *
 * `notificationTarget()` decides, this performs, and the split is what lets the
 * mapping be tested in Node. See `routing.ts` for why the payload is treated as
 * untrusted.
 *
 * **Both entry paths are wired, and they are not redundant.** Expo's docs are
 * explicit that on iOS the response listener fires in all three app states, but
 * that Android may deliver a background or terminated tap only as a startup
 * value — so `useLastNotificationResponse()` is the Android-shaped half, live
 * now rather than discovered missing during V1.5. The dedupe below is what
 * keeps the overlap harmless.
 *
 * **Mount this in `app/(tabs)/_layout.tsx` and nowhere else.** That layout
 * exists only for a user `resolveRoute()` calls `'ready'`, so its mounting *is*
 * the readiness condition — no flag to pass and none to get wrong. Mounting it
 * in `Gate` instead would let a tap navigate to `/squad` while `redirectTarget`
 * was pushing a half-onboarded user into `(onboard)`, and the two would fight.
 *
 * The cold-start tap survives the wait that implies. A tap launching the app
 * from terminated produces its response within the first frame, seconds before
 * the session and profile resolve and this layout mounts — but
 * `useLastNotificationResponse()` holds the last response rather than emitting
 * it once, so mounting late still reads it. That is the difference between it
 * and the listener, and the reason both are here.
 */
export function useNotificationRouting(): void {
  const router = useRouter();
  const lastResponse = Notifications.useLastNotificationResponse();

  /** Notification ids already acted on — the dedupe across both paths. */
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    function handle(response: Notifications.NotificationResponse | null | undefined) {
      if (!response) return;

      // Without this, the listener and the retained last-response both act on
      // the same warm tap, and the second navigate lands on a screen the user
      // has to press back through twice.
      const id = response.notification.request.identifier;
      if (handled.current.has(id)) return;
      handled.current.add(id);

      const target = notificationTarget(response.notification.request.content.data);
      if (!target) return;

      // `navigate` rather than `push`: two of the three destinations are tabs,
      // and pushing a tab stacks a second copy of a screen the user can
      // already reach from the bar.
      router.navigate(target);
    }

    handle(lastResponse);

    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [lastResponse, router]);
}

/**
 * Records that the app was opened (§11), which is what makes §14's "Day starts"
 * conditional: it fires mid-morning **only if the app has not been opened yet**.
 *
 * Deduped per calendar day **within a session** — the marker is module state,
 * so a cold start writes another row. That is deliberate rather than sloppy:
 * collapsing foreground churn is worth it, and cold starts are the signal §11
 * most wants. The dispatcher only asks whether a row exists on the user's own
 * local date, so duplicates cost a row and change nothing.
 */
let lastTrackedDay: string | null = null;

export function useAppOpenTelemetry(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;

    function record() {
      const today = new Date().toDateString();
      if (lastTrackedDay === today) return;

      // Claimed before the write, not after: two foregrounds in the same tick
      // would otherwise both pass the check and write twice. The claim is
      // released again below if the write did not land.
      lastTrackedDay = today;

      void track(userId, 'app_open').then((landed) => {
        // A failed write must not count as a send. This marker is what makes
        // the dedupe work, so poisoning it turns one dropped row into a whole
        // missing day — the next foreground would be suppressed too, and §14's
        // "day starts" push reads exactly this signal. Offline at breakfast is
        // the common case; the pre-profile 23503 that motivated the migration
        // beside this change was the loud one.
        //
        // Guarded on the day still being ours, so a release cannot clobber a
        // later day's successful claim.
        if (!landed && lastTrackedDay === today) lastTrackedDay = null;
      });
    }

    // The cold start is an open too, and it is the one that matters most: it is
    // the morning the notification would otherwise have been sent.
    record();

    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') record();
    });

    return () => subscription.remove();
  }, [userId]);
}

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { track } from '@/features/telemetry/events.ts';
import {
  handleDeviceTokenRotation,
  readNotificationPermission,
  registerDeviceToken,
} from './permission.ts';

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
      lastTrackedDay = today;
      track(userId, 'app_open');
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

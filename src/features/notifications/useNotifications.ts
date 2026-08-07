import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { track } from '@/features/telemetry/events.ts';
import { readNotificationPermission, registerDeviceToken } from './permission.ts';

/**
 * Keeps this device's push registration current.
 *
 * Two things move under us: the user may grant permission from Settings rather
 * than from our sheet, and APNs may rotate the token at any time. Neither
 * produces an error anywhere — the server simply stops reaching the device —
 * so both are watched rather than assumed.
 */
export function useDeviceTokenRegistration(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    void readNotificationPermission().then((permission) => {
      if (!cancelled && permission === 'granted') void registerDeviceToken();
    });

    const subscription = Notifications.addPushTokenListener(() => {
      void registerDeviceToken();
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
 * Deduped per device calendar day purely to keep `app_events` lean — the
 * dispatcher does the real comparison against each user's own local date, and
 * only cares whether a row exists.
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

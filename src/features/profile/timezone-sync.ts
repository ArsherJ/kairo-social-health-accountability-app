import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
import { track } from '@/features/telemetry/events.ts';
import { deviceTimeZone } from './device-timezone.ts';
import { profileKey } from './queries.ts';
import { shouldUpdateTimezone } from './timezone-rule.ts';

/**
 * Reconciles profiles.timezone with the device on every foreground.
 *
 * Cheap, and the alternative is silent: a user who travels keeps finalizing on
 * their old midnight, and nothing in the app looks broken while their day
 * closes at the wrong hour.
 */
export function useTimezoneSync(
  userId: string | undefined,
  storedTimeZone: string | undefined,
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    async function reconcile() {
      const device = deviceTimeZone();
      if (!shouldUpdateTimezone(storedTimeZone, device)) return;

      const { error } = await supabase
        .from('profiles')
        .update({ timezone: device })
        .eq('id', userId as string);

      // The failure this file's header describes, arriving as a write error.
      // Nothing in the UI changes when it happens: the user keeps finalizing on
      // the timezone they left behind, and the only symptom is a day that
      // closes at the wrong hour. Leave a row so it is at least answerable.
      if (error) {
        track(userId, 'timezone_sync_failed', {
          code: error.code,
          from: storedTimeZone ?? null,
          to: device,
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: profileKey(userId) });
    }

    void reconcile();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcile();
    });

    return () => subscription.remove();
  }, [userId, storedTimeZone, queryClient]);
}

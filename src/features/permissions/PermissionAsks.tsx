import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Panel } from '@/ui/index.ts';
import { colors, space } from '@/theme.ts';
import { HealthAsk } from '@/features/health/HealthPermissionSheet.tsx';
import { readHealthPermissionState } from '@/features/health/permission.ts';
import { track } from '@/features/telemetry/events.ts';
import type { HealthPermissionState } from '@/features/health/permission-state.ts';
import { NotificationAsk } from '@/features/notifications/NotificationPermissionSheet.tsx';
import type { NotificationPermission } from '@/features/notifications/ask-policy.ts';
import { readNotificationPermission } from '@/features/notifications/permission.ts';
import { nextPermissionAsk } from './ask-order.ts';

/**
 * The one place that presents a permission sheet.
 *
 * **There is exactly one `<Modal>` in this app's permission flow, and it lives
 * here.** That is the whole point. A `<Modal>` presents on the root view
 * controller no matter where it is mounted, so two of them mounted in different
 * subtrees are not independent — when both turned visible in the same frame,
 * UIKit refused the second (*"Attempt to present … which is already
 * presenting …"*), suppressed it with no error the user could see, and left the
 * window wedged badly enough that the tab bar stopped taking touches.
 *
 * Which ask wins, and whether to ask at all, is `nextPermissionAsk` — pure and
 * tested. This component only owns the I/O it decides from: the two permission
 * reads, the per-session dismissals, and the one-ask-per-session latch.
 *
 * Mounted at the tabs shell, not on a screen: the ask is keyed to what has
 * happened to the user, not to where they are standing. In practice the app
 * opens on the character tab, so the Health ask still overlays the character it is
 * about to power, which is what §5 wanted from putting it there.
 */
export function PermissionAsks({
  userId,
  hasSquad,
  hasGoal,
}: {
  userId: string | undefined;
  hasSquad: boolean;
  hasGoal: boolean;
}) {
  const [health, setHealth] = useState<HealthPermissionState | null>(null);
  const [notification, setNotification] = useState<NotificationPermission | null>(null);
  const [healthDismissed, setHealthDismissed] = useState(false);
  const [notificationDismissed, setNotificationDismissed] = useState(false);
  const [answeredAnAskThisSession, setAnswered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readHealthPermissionState().then((state) => {
      if (!cancelled) setHealth(state);
    });
    void readNotificationPermission().then((state) => {
      if (!cancelled) setNotification(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Both reads must land before anything is decided. Deciding on a half-read
  // state would present the Health sheet and then swap it for the notification
  // one a frame later, which is the flicker the single modal exists to avoid.
  //
  // `userId` gates the whole thing. The tabs shell now stays mounted while the
  // Gate resolves (see `app/_layout.tsx`), so on a cold start this component
  // exists for a frame or two before the redirect to sign-in lands — and
  // without this guard the Health sheet would present over it, asking for
  // HealthKit on behalf of nobody.
  const ask =
    userId === undefined || health === null || notification === null
      ? null
      : nextPermissionAsk({
          health,
          healthDismissed,
          notification,
          notificationDismissed,
          hasSquad,
          hasGoal,
          answeredAnAskThisSession,
        });

  return (
    <Modal visible={ask !== null} transparent animationType="slide">
      <View style={styles.backdrop}>
        <Panel variant="plain" style={styles.sheet}>
          {ask === 'health' && (
            <HealthAsk
              userId={userId}
              onAnswered={() => {
                // 'asked' rather than re-reading: HealthKit deliberately will
                // not tell us what was granted, so the request completing is
                // the only signal there is.
                setHealth('asked');
                setAnswered(true);
              }}
              onDismiss={() => {
                setHealthDismissed(true);
                void track(userId, 'health_ask_dismissed');
              }}
            />
          )}

          {ask === 'notifications' && (
            <NotificationAsk
              onAnswered={(result) => {
                setNotification(result);
                setAnswered(true);
              }}
              onDismiss={() => setNotificationDismissed(true)}
            />
          )}
        </Panel>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: `${colors.bg}CC`,
  },
  sheet: { marginTop: 0, marginBottom: space.lg, marginHorizontal: space.lg },
});

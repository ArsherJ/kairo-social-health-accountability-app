import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme.ts';
import { shouldAskForNotifications, type NotificationPermission } from './ask-policy.ts';
import {
  readNotificationPermission,
  registerDeviceToken,
  requestNotificationPermission,
} from './permission.ts';

/**
 * The in-context ask (§5), deliberately not in onboarding.
 *
 * It appears once the user has a squad or has been hit — at which point the
 * "why" is on screen behind the sheet. iOS grants exactly one dialog per
 * install, so spending it during onboarding, before the user has anything to be
 * notified about, is spending it on a no.
 *
 * Dismissal is per-session, matching HealthPermissionSheet: there is no "never
 * ask again" until there is a settings screen to re-enable it from.
 */
export function NotificationPermissionSheet({
  hasSquad,
  hasBeenSabotaged,
}: {
  hasSquad: boolean;
  hasBeenSabotaged: boolean;
}) {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readNotificationPermission().then((state) => {
      if (!cancelled) setPermission(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = permission !== null &&
    shouldAskForNotifications({
      permission,
      hasSquad,
      hasBeenSabotaged,
      dismissedThisSession: dismissed,
    });

  async function ask() {
    setBusy(true);
    try {
      const result = await requestNotificationPermission();
      setPermission(result);
      // Register straight away. A granted permission with no token registered
      // is indistinguishable, from the server, from no permission at all.
      if (result === 'granted') await registerDeviceToken();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.label}>DON'T MISS THE HIT</Text>
          <Text style={styles.title}>Know the moment it happens</Text>
          <Text style={styles.body}>
            Get told when a squadmate throws a banana at you, and when your day is
            about to close. That is the part you cannot see coming.
          </Text>
          <Text style={styles.fine}>
            Three a day at most, and nothing between 10 PM and 7 AM — except a
            sabotage, which you will want to know about immediately.
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void ask()}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.buttonLabel}>Turn on notifications</Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => setDismissed(true)}>
            <Text style={styles.later}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000AA' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    paddingBottom: space.xl,
  },
  label: { color: colors.accent, ...font.label },
  title: { color: colors.text, ...font.title, marginTop: space.sm },
  body: { color: colors.subtle, ...font.body, marginTop: space.md },
  fine: { color: colors.muted, fontSize: 13, marginTop: space.md },
  button: {
    marginTop: space.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  buttonLabel: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  later: {
    color: colors.muted,
    ...font.body,
    textAlign: 'center',
    marginTop: space.md,
  },
});

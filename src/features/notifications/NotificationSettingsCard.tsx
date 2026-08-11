import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Text } from 'react-native';
import { Button, Label, Panel } from '@/ui/index.ts';
import { colors, font, ramp, space } from '@/theme.ts';
import type { NotificationPermission } from './ask-policy.ts';
import { readNotificationPermission } from './permission.ts';
import { notificationStatus } from './status-copy.ts';

/**
 * Whether notifications are on, and the way back if they are not.
 *
 * Deliberately shaped like the Timezone panel beside it rather than as
 * something louder: a permission the user turned off is a decision, not an
 * error, and the row's job is to make the state legible and reversible — not to
 * campaign for it back.
 *
 * **Re-read on every foreground.** The state only ever changes in iOS Settings,
 * which means leaving the app is the only way to change it, which means
 * returning is the only moment worth checking. Reading once at mount is exactly
 * how the QA session ended up with a screen quietly describing permissions the
 * user had already revoked.
 */
export function NotificationSettingsCard() {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  const refresh = useCallback(() => {
    void readNotificationPermission().then(setPermission);
  }, []);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // A pending read is not an answer. Rendering "Off" for a frame and correcting
  // it would be the same lie in miniature.
  if (permission === null) return null;

  const status = notificationStatus(permission);

  return (
    <Panel>
      <Label>Notifications</Label>
      <Text style={styles.value}>{status.value}</Text>
      <Text style={styles.help}>{status.help}</Text>

      {status.action !== null && (
        <Button
          label={status.action}
          variant="secondary"
          // openSettings lands on Kairo's own pane, so this is one tap from
          // here to the switch — not a instruction to go hunting for it.
          onPress={() => void Linking.openSettings()}
        />
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  value: { color: colors.text, ...font.display.minor, fontSize: 19, marginTop: space.xs },
  help: {
    ...font.body.body,
    fontSize: 12,
    color: ramp.neutral[600],
    marginTop: space.sm,
    marginBottom: space.sm,
    lineHeight: 18,
  },
});

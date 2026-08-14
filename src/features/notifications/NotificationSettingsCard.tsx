import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Linking, StyleSheet, Text } from 'react-native';
import * as Application from 'expo-application';
import { Button, Label, Panel } from '@/ui/index.ts';
import { colors, font, ramp, space } from '@/theme.ts';
import type { NotificationPermission } from './ask-policy.ts';
import {
  isDeviceTokenRegistered,
  readNotificationPermission,
  subscribeToTokenRegistration,
} from './permission.ts';
import { deliveryStatus, notificationStatus, type PushEnvironment } from './status-copy.ts';

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

  /**
   * Which APNs environment this build registered against — where readable.
   *
   * It is not readable on TestFlight: `expo-application` parses
   * `embedded.mobileprovision`, and App Store distribution strips that file
   * from the bundle. So this is `null` on exactly the install the value was
   * wanted for, and `deliveryStatus` leans on registration instead.
   */
  const [environment, setEnvironment] = useState<PushEnvironment>(null);

  /**
   * A simulator cannot register with APNs at all, and saying so is different
   * from reporting a failure.
   *
   * The release type answers this without a provisioning profile — its native
   * implementation falls back to a compile-time simulator check when the file
   * is absent — which is precisely why it, and not a null environment, is what
   * decides.
   */
  const [isSimulator, setIsSimulator] = useState(false);

  // Not polled. `upsertDeviceToken` publishes, so a registration that lands a
  // second after this card mounts updates it instead of leaving a stale
  // "not registered" on screen.
  const registered = useSyncExternalStore(subscribeToTokenRegistration, isDeviceTokenRegistered);

  const refresh = useCallback(() => {
    void readNotificationPermission().then(setPermission);
    void Application.getIosPushNotificationServiceEnvironmentAsync()
      .then(setEnvironment)
      // Android, or a runtime without the native method. Not a failure worth
      // surfacing: null is already the normal TestFlight answer, and
      // `deliveryStatus` reports registration rather than depending on it.
      .catch(() => setEnvironment(null));
    void Application.getIosApplicationReleaseTypeAsync()
      .then((type) => setIsSimulator(type === Application.ApplicationReleaseType.SIMULATOR))
      .catch(() => setIsSimulator(false));
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
  const delivery = deliveryStatus({ permission, isSimulator, environment, registered });

  return (
    <Panel>
      <Label>Notifications</Label>
      <Text style={styles.value}>{status.value}</Text>
      <Text style={styles.help}>{status.help}</Text>

      {delivery !== null && <Text style={styles.delivery}>{delivery}</Text>}

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
  // A diagnostic rather than an explanation, so it sits apart from `help`
  // without going quieter than it: this ships in Release specifically so a
  // beta tester can read it back, and lightening it to signal "minor" is how
  // small print becomes unreadable. Separated by the rule above instead.
  delivery: {
    ...font.body.body,
    fontSize: 12,
    color: colors.subtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ramp.neutral[300],
    paddingTop: space.sm,
    marginBottom: space.sm,
    lineHeight: 16,
  },
});

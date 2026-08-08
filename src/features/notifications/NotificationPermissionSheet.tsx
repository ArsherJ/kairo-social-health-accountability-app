import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Button } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';
import type { NotificationPermission } from './ask-policy.ts';
import { registerDeviceToken, requestNotificationPermission } from './permission.ts';

/**
 * The in-context ask (§5), as sheet *content* rather than a sheet.
 *
 * It appears once the user has a squad or has been hit — at which point the
 * "why" is on screen behind it. iOS grants exactly one dialog per install, so
 * spending it during onboarding, before the user has anything to be notified
 * about, is spending it on a no.
 *
 * *When* it may show is `shouldAskForNotifications` in `ask-policy.ts`; whether
 * it wins the slot against the Health ask is `permissions/ask-order.ts`. Both
 * are pure. This component owns neither — that separation is what stopped the
 * two sheets presenting on top of each other.
 */
export function NotificationAsk({
  onAnswered,
  onDismiss,
}: {
  onAnswered: (result: NotificationPermission) => void;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function ask() {
    setBusy(true);
    try {
      const result = await requestNotificationPermission();
      // Register straight away. A granted permission with no token registered
      // is indistinguishable, from the server, from no permission at all.
      if (result === 'granted') await registerDeviceToken();
      onAnswered(result);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
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

      <Button
        label="Turn on notifications"
        variant="primary"
        busy={busy}
        onPress={() => void ask()}
      />

      <Pressable accessibilityRole="button" onPress={onDismiss}>
        <Text style={styles.later}>Not now</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.accent, ...font.body.label },
  title: { color: colors.text, ...font.body.title, marginTop: space.sm },
  body: { color: colors.subtle, ...font.body.body, marginTop: space.md },
  fine: { color: colors.muted, fontSize: 13, marginTop: space.md },
  later: {
    color: colors.muted,
    ...font.body.body,
    textAlign: 'center',
    marginTop: space.md,
  },
});

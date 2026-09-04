import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Button, Text } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';
import { NOTIFICATION_ASK_COPY } from './ask-copy.ts';
import type { NotificationPermission } from './ask-policy.ts';
import { registerDeviceToken, requestNotificationPermission } from './permission.ts';

/**
 * The in-context ask (§5), as sheet *content* rather than a sheet.
 *
 * It appears once the user has a squad, a running Battle, or a first scored
 * day — at which point the "why" is on screen behind it. iOS grants exactly one
 * dialog per install, so spending it during onboarding, before the user has
 * anything to be notified about, is spending it on a no.
 *
 * *When* it may show is `shouldAskForNotifications` in `ask-policy.ts`; whether
 * it wins the slot against the Health ask is `permissions/ask-order.ts`. Both
 * are pure. This component owns neither — that separation is what stopped the
 * two sheets presenting on top of each other. **What it says** is
 * `ask-copy.ts`, pure for a third reason: the sheet spent a fortnight
 * advertising three pushes the app had retired, and nothing could fail.
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
      <Text style={styles.label}>{NOTIFICATION_ASK_COPY.label}</Text>
      <Text style={styles.title}>{NOTIFICATION_ASK_COPY.title}</Text>
      <Text style={styles.body}>{NOTIFICATION_ASK_COPY.body}</Text>
      <Text style={styles.fine}>{NOTIFICATION_ASK_COPY.fine}</Text>

      <Button
        label={NOTIFICATION_ASK_COPY.primary}
        variant="primary"
        busy={busy}
        onPress={() => void ask()}
      />

      {/* Dismiss only — it never reaches `requestNotificationPermission`, so
          the player keeps the one dialog iOS grants per install. */}
      <Pressable accessibilityRole="button" onPress={onDismiss}>
        <Text style={styles.later}>{NOTIFICATION_ASK_COPY.dismiss}</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.accentDeep, ...font.body.label },
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

import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Button, Text } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';
import type { NotificationPermission } from './ask-policy.ts';
import { registerDeviceToken, requestNotificationPermission } from './permission.ts';

/**
 * The in-context ask (§5), as sheet *content* rather than a sheet.
 *
 * It appears once the user has a squad, a live Battle, or a first scored day of
 * their own — at which point the "why" is on screen behind it. iOS grants
 * exactly one dialog per install, so spending it during onboarding, before the
 * user has anything to be notified about, is spending it on a no.
 *
 * *When* it may show is `shouldAskForNotifications` in `ask-policy.ts`; whether
 * it wins the slot against the Health ask is `permissions/ask-order.ts`. Both
 * are pure. This component owns neither — that separation is what stopped the
 * two sheets presenting on top of each other.
 *
 * **The copy describes the Digest, and was rewritten on 2026-09-02 because it
 * had stopped being true.** It promised "when this one is about to close" and
 * "the two that close out your day, which arrive at 11 PM and midnight" —
 * `day_ending_soon` and `day_ends`, both retired by deviation #52 when three
 * pushes a day became one. Nothing has emitted them since 2026-08-25. The
 * staleness was invisible for a week because the ask only ever fired for a user
 * with a squad or a live Battle; deviation #60 opened it to every solo player
 * on their first scored day, which is what put a false promise in front of the
 * whole new-user cohort.
 *
 * Two things the copy deliberately does **not** say. It never names a rank or a
 * standing: `digestCopy()`'s solo branch says nothing about rank on purpose —
 * a solo player races their own past days, and "1st of 4" against three ghosts
 * is a claim about people who do not exist — and this sheet is now read mostly
 * by exactly that player. And it does **not** promise "three a day at most",
 * which the old copy did and which was never guaranteed: `event_completed` is
 * in `BUDGET_EXEMPT`, so it is admitted without spending the budget and can
 * land on top of a full one. What is exact is the schedule and the quiet
 * window, so those are what it states.
 *
 * `ask-copy.test.ts` guards the retired phrasings. This is the second surface
 * in a week found making a promise the product had stopped keeping, and the
 * first — the invite message's privacy clause — went stale for exactly the
 * same reason: nothing was watching it.
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
      <Text style={styles.label}>ONE PUSH A DAY</Text>
      <Text style={styles.title}>Your day, read back each morning</Text>
      <Text style={styles.body}>
        At eight, in your own timezone — how yesterday finished and where today
        has got to. It is the only push Kairo schedules.
      </Text>
      <Text style={styles.fine}>
        Nothing between 10 PM and 7 AM. A Battle going down or a Challenge
        clearing can add one; nothing else sends.
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

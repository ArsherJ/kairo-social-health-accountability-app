import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { track } from '@/features/telemetry/events.ts';
import { Button, Text } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';
import { configureHealthBackgroundDelivery } from './background.ts';
import { HEALTH_DISCLOSURE } from './disclosure.ts';
import { readHealthPermissionState, requestHealthPermission } from './permission.ts';
import { notifyHealthPermissionGranted } from './useHealthSync.ts';

/**
 * The in-context ask (§5), as sheet *content* rather than a sheet.
 *
 * It used to own its own `<Modal>` and its own visibility, mounted on the
 * character screen so the prompt overlaid the character it was about to power.
 * That independence was the bug: `NotificationPermissionSheet` did the same
 * thing at the tabs shell, and two `<Modal>`s presenting on one root view
 * controller means UIKit refuses the second and suppresses it silently. See
 * `src/features/permissions/ask-order.ts`.
 *
 * So visibility, ordering and dismissal now belong to `PermissionAsks`, and
 * what remains here is the copy, the request, and what to do when it fails.
 */
export function HealthAsk({
  userId,
  onAnswered,
  onDismiss,
}: {
  userId: string | undefined;
  /** The request completed — the caller advances past this ask. */
  onAnswered: () => void;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * This used to be `try { … } finally { … }` with no `catch`, which was worse
   * than swallowing the error: it left an unhandled rejection from an onPress
   * handler, and the `finally` closed the sheet either way — so a failed
   * connect looked exactly like a successful one, and the user was left with a
   * character powered by nothing and no reason to suspect it.
   *
   * The ask is now only reported answered on the success path. `track()` is
   * fire-and-forget and never throws, so nothing here can make the failure
   * worse.
   */
  async function ask() {
    setBusy(true);
    setFailed(false);
    try {
      await requestHealthPermission();
      await configureHealthBackgroundDelivery();
      // Sync straight away rather than waiting for the next foreground. The
      // user just connected Health and is looking at a screen showing zero.
      notifyHealthPermissionGranted();
      // No granted/denied: HealthKit does not report read-permission denial, so
      // an event claiming either would be believed and wrong. The resulting
      // state is what is actually knowable.
      //
      // `.catch(() => null)` rather than letting a rejection here fall into
      // the `catch` below: everything above this line already succeeded —
      // the permission request, background-delivery config, and the sync
      // kickoff — so a transient failure *reading back* the state must not
      // report the connect as failed, re-present the sheet, or write a false
      // `health_permission_failed`. The payload tolerates `null`.
      const state = await readHealthPermissionState().catch(() => null);
      void track(userId, 'health_ask_completed', { state });
      onAnswered();
    } catch (error) {
      track(userId, 'health_permission_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Text style={styles.label}>POWER YOUR CHARACTER</Text>
      <Text style={styles.title}>Your real life is the game</Text>
      <Text style={styles.body}>
        Your activity levels your character and puts you on the squad
        leaderboard. Here is everything Kairo reads from Apple Health:
      </Text>

      {/* Rendered from HEALTH_DISCLOSURE rather than written out, so the list
          cannot fall behind what the app actually requests — which is exactly
          how it came to name four types while asking for eight. */}
      <View style={styles.disclosure}>
        {HEALTH_DISCLOSURE.map((group) => (
          <View key={group.label} style={styles.disclosureRow}>
            <Text style={styles.disclosureLabel}>{group.label}</Text>
            <Text style={styles.disclosurePurpose}>{group.purpose}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.fine}>
        Your squad only ever sees ability ratings and scores — never your raw
        numbers, and never when you move. Kairo writes nothing back to Health.
      </Text>

      <Button
        label="Connect Apple Health"
        variant="primary"
        busy={busy}
        onPress={() => void ask()}
      />

      {failed && (
        <Text style={styles.error}>
          That didn't connect. Try again — or grant Kairo access in Settings →
          Privacy & Security → Health.
        </Text>
      )}

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
  disclosure: { marginTop: space.md },
  // Hairline-separated rows rather than bullets: this is a schedule of what is
  // being asked for, and it should read like one.
  disclosureRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  disclosureLabel: { color: colors.text, ...font.body.strong, flexShrink: 0 },
  disclosurePurpose: {
    color: colors.muted,
    ...font.body.strong,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: space.sm,
  },
  fine: { color: colors.muted, fontSize: 13, marginTop: space.md },
  error: { color: colors.damage, fontSize: 13, marginTop: space.md, lineHeight: 19 },
  later: {
    color: colors.muted,
    ...font.body.body,
    textAlign: 'center',
    marginTop: space.md,
  },
});

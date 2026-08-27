import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Button, Text } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';
import { connectHealth } from './connect-health.ts';
import { HEALTH_DISCLOSURE } from './disclosure.ts';

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

  // `useWindowDimensions` rather than `PixelRatio.getFontScale()`: the hook is
  // reactive, and iOS can change the text size under a running app from
  // Control Centre. A one-off read would leave the layout in whichever shape
  // it was mounted with.
  //
  // 1.3 because that is roughly where the two columns stop both fitting on a
  // 390pt screen. It is a layout threshold, not an accessibility one — there is
  // no cutoff at which this app stops scaling type, per `src/ui/Text.tsx`.
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;

  /**
   * The sequence itself moved to `connect-health.ts` when `/connect` became a
   * second caller — it had been paraphrased there and three quarters of it went
   * missing. What stays here is this sheet's own reaction to the outcome.
   *
   * The ask is only reported answered on the success path. A failure used to
   * advance regardless, which made a failed connect look exactly like a
   * successful one.
   */
  async function ask() {
    setBusy(true);
    setFailed(false);
    try {
      const result = await connectHealth(userId);
      if (result.ok) onAnswered();
      else setFailed(true);
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
          how it came to name four types while asking for eight.

          **The schedule becomes a list at large text sizes.** Two columns on
          one line is the right shape for "what is asked for, and what for" —
          it reads as a schedule, which is what it is. But two columns need
          width neither of them can give up: the label must not shrink (a
          truncated "Steps and dist…" is the wrong half to lose) and the
          purpose is a sentence. Past ~1.3x they were clipping *both* sides on
          a real device. Stacking keeps every word rather than defending a
          layout at the cost of the content it exists to show. */}
      <View style={styles.disclosure}>
        {HEALTH_DISCLOSURE.map((group) => (
          <View
            key={group.label}
            style={[styles.disclosureRow, stacked && styles.disclosureRowStacked]}
          >
            <Text style={styles.disclosureLabel}>{group.label}</Text>
            <Text
              style={[styles.disclosurePurpose, stacked && styles.disclosurePurposeStacked]}
            >
              {group.purpose}
            </Text>
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
  label: { color: colors.accentDeep, ...font.body.label },
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
  // Stacked: a column, left-aligned, with the label above its own purpose.
  // `alignItems` moves from `baseline` — which is meaningless in a column and
  // silently collapses the children's width in RN — to `stretch`.
  disclosureRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: space.sm,
  },
  disclosureLabel: { color: colors.text, ...font.body.strong, flexShrink: 0 },
  disclosurePurpose: {
    color: colors.muted,
    ...font.body.strong,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: space.sm,
  },
  // The right-alignment and the gutter were both holding the second column off
  // the first. In a stack there is no first column to clear, and right-aligned
  // body text under a left-aligned label reads as two unrelated things.
  disclosurePurposeStacked: {
    textAlign: 'left',
    marginLeft: 0,
    marginTop: 2,
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

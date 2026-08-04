import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Panel, Button } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';
import { configureHealthBackgroundDelivery } from './background.ts';
import { readHealthPermissionState, requestHealthPermission } from './permission.ts';
import { notifyHealthPermissionGranted } from './useHealthSync.ts';

/**
 * The in-context ask (§5). Presented over the character screen so the prompt
 * overlays the Hunter it is about to power, rather than gating the user before
 * they have anything to care about.
 *
 * Dismissal is per-session on purpose: there is no "never ask again" until
 * there is a settings screen to re-enable it from (Phase 7).
 */
export function HealthPermissionSheet() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readHealthPermissionState().then((state) => {
      if (!cancelled) setVisible(state === 'should-ask');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function ask() {
    setBusy(true);
    try {
      await requestHealthPermission();
      await configureHealthBackgroundDelivery();
      // Sync straight away rather than waiting for the next foreground. The
      // user just connected Health and is looking at a screen showing zero.
      notifyHealthPermissionGranted();
    } finally {
      setBusy(false);
      setVisible(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <Panel variant="plain" style={styles.panelOverride}>
          <Text style={styles.label}>POWER YOUR CHARACTER</Text>
          <Text style={styles.title}>Your real life is the game</Text>
          <Text style={styles.body}>
            Kairo reads your steps, distance, active calories and active minutes from
            Apple Health. That is what levels your Hunter and puts you on the squad
            leaderboard.
          </Text>
          <Text style={styles.fine}>
            Your squad only ever sees tiers and scores — never your raw numbers, and
            never when you move. Kairo writes nothing back to Health.
          </Text>

          <Button
            label="Connect Apple Health"
            onPress={() => void ask()}
            variant="primary"
            disabled={false}
            busy={busy}
          />

          <Pressable accessibilityRole="button" onPress={() => setVisible(false)}>
            <Text style={styles.later}>Not now</Text>
          </Pressable>
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
  panelOverride: { marginTop: 0, marginBottom: space.lg, marginHorizontal: space.lg },
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

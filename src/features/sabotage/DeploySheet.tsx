import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BANANA_SCORE_DELTA } from '@kairo/core';
import { useDeploySabotage } from './mutations.ts';
import { colors, font, ramp, radius, space } from '@/theme.ts';

/**
 * Confirm one throw at one squadmate.
 *
 * The target is already chosen — it is the row that was tapped — so this is a
 * single confirm step, not a picker. §20.4 calls sabotage the soul of the
 * product; two steps between the impulse and the banana is where an impulse
 * dies.
 */
export function DeploySheet({
  userId,
  squadId,
  timeZone,
  target,
  remaining,
  onClose,
}: {
  userId: string | undefined;
  squadId: string | undefined;
  timeZone: string | undefined;
  /** Null closes the sheet. */
  target: { user_id: string; character_name: string } | null;
  remaining: number;
  onClose: () => void;
}) {
  const deploy = useDeploySabotage(userId, squadId, timeZone);

  function close() {
    deploy.reset();
    onClose();
  }

  return (
    <Modal visible={target !== null} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.badge}>
            <Text style={styles.badgeEmoji}>🍌</Text>
          </View>

          <Text style={styles.label}>THROW A BANANA</Text>
          <Text style={styles.title} numberOfLines={1}>
            {target?.character_name}
          </Text>

          {/* From BANANA_SCORE_DELTA, never a literal: the number the player is
              told is the number kairo-core will apply. */}
          <Text style={styles.body}>
            {Math.abs(BANANA_SCORE_DELTA).toLocaleString()} points off their day.
            They will see it.
          </Text>

          <Text style={styles.fine}>
            {remaining <= 1
              ? 'This is your last one today.'
              : `${remaining - 1} left after this.`}
          </Text>

          {/* The sheet stays open on failure so the reason can be read and
              dismissed deliberately — a cooldown or a locked day is
              information, not a dead end. */}
          {deploy.isError && <Text style={styles.error}>{deploy.error.message}</Text>}

          <Pressable
            accessibilityRole="button"
            disabled={deploy.isPending || !target}
            onPress={() =>
              target &&
              deploy.mutate({ targetId: target.user_id }, { onSuccess: close })
            }
            style={({ pressed }) => [
              styles.button,
              (pressed || deploy.isPending) && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.buttonLabel}>
              {deploy.isPending ? 'Throwing…' : 'Throw it 🍌'}
            </Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={close}>
            <Text style={styles.later}>Never mind</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The scrim is burnt rather than black. Sabotage is the one moment the app
  // changes temperature, and a neutral black would read as a system dialog
  // interrupting the game instead of as part of it.
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#402310b8' },
  sheet: {
    backgroundColor: ramp.accent[900],
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.lg,
    paddingBottom: space.xl,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: ramp.accent[700],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  badgeEmoji: { fontSize: 34 },
  label: { ...font.body.label, textTransform: 'uppercase', color: ramp.accent[400] },
  title: { ...font.display.major, color: ramp.accent[100], marginTop: space.xs },
  body: { ...font.body.body, fontSize: 16, lineHeight: 24, color: ramp.accent[200], marginTop: space.md },
  fine: { ...font.body.strong, color: ramp.accent[300], marginTop: space.sm },
  // Legible against the burnt sheet — `colors.damage` is that sheet's own
  // family and would vanish into it.
  error: { ...font.body.strong, fontSize: 13, color: ramp.accent[300], marginTop: space.md },
  button: {
    marginTop: space.lg,
    backgroundColor: ramp.accent[400],
    borderRadius: radius.pill,
    paddingVertical: 19,
    alignItems: 'center',
  },
  buttonLabel: { ...font.display.action, color: ramp.accent[900] },
  later: {
    ...font.body.strong,
    fontSize: 15,
    color: ramp.accent[300],
    textAlign: 'center',
    marginTop: space.md,
    paddingVertical: space.sm,
  },
});

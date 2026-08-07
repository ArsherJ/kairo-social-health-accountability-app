import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BANANA_SCORE_DELTA } from '@kairo/core';
import { useDeploySabotage } from './mutations.ts';
import { colors, font, radius, space } from '@/theme.ts';

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
  fine: { color: colors.muted, fontSize: 13, marginTop: space.sm },
  error: { color: colors.danger, fontSize: 13, marginTop: space.md },
  button: {
    marginTop: space.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  buttonLabel: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  later: { color: colors.muted, ...font.body, textAlign: 'center', marginTop: space.md },
});

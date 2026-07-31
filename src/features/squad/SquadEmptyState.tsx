import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme.ts';

/**
 * The whole squad tab until the user belongs to one. Two actions and nothing
 * else — anything more here is a decision the user has no context to make yet.
 */
export function SquadEmptyState({
  onCreate,
  onJoin,
}: {
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.label}>NO SQUAD YET</Text>
        <Text style={styles.title}>Nobody is watching.</Text>
        <Text style={styles.help}>
          A squad is up to six people ranked on the same day. They see your score,
          you see theirs. That is the entire mechanism.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onCreate}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryLabel}>Create a squad</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={onJoin}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryLabel}>Join with a code</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between' },
  top: { flex: 1, justifyContent: 'center' },
  label: { color: colors.muted, ...font.label },
  title: { color: colors.text, ...font.title, marginTop: space.sm },
  help: { color: colors.subtle, ...font.body, marginTop: space.sm, lineHeight: 22 },
  actions: { paddingBottom: space.xl },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  primaryLabel: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  secondary: {
    marginTop: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  secondaryLabel: { color: colors.text, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSessionStore } from '@/features/auth/session.ts';
import { CreateSquadForm } from '@/features/squad/CreateSquadForm.tsx';
import { JoinSquadForm } from '@/features/squad/JoinSquadForm.tsx';
import { Leaderboard } from '@/features/squad/Leaderboard.tsx';
import { SoloBoard } from '@/features/squad/SoloBoard.tsx';
import { useMySquad } from '@/features/squad/queries.ts';
import { colors, font, radius, space } from '@/theme.ts';

/** Which of the no-squad screens is showing. Local state, not a route. */
type Pane = 'choose' | 'create' | 'join';

export default function Squad() {
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const squad = useMySquad(userId);
  const [pane, setPane] = useState<Pane>('choose');

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.lg }]}>
      {/* A pending query must not render the empty state. "You have no squad"
          is a claim the user will act on, and during a load it is a guess. */}
      {squad.isPending && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {squad.isError && (
        <View style={styles.centered}>
          <Text style={styles.error}>{squad.error.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void squad.refetch()}
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          >
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      )}

      {squad.isSuccess && squad.data && <Leaderboard squad={squad.data} />}

      {/* Solo mode replaces the old empty state: the tab is worth opening
          before the barkada joins (§7). Create and join stay one tap away. */}
      {squad.isSuccess && !squad.data && pane === 'choose' && (
        <SoloBoard
          userId={userId}
          onCreate={() => setPane('create')}
          onJoin={() => setPane('join')}
        />
      )}

      {squad.isSuccess && !squad.data && pane === 'create' && (
        <CreateSquadForm userId={userId} onCancel={() => setPane('choose')} />
      )}

      {squad.isSuccess && !squad.data && pane === 'join' && (
        <JoinSquadForm userId={userId} onCancel={() => setPane('choose')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, ...font.body, textAlign: 'center' },
  retry: {
    marginTop: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});

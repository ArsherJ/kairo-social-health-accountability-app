import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSessionStore } from '@/features/auth/session.ts';
import { CreateSquadForm } from '@/features/squad/CreateSquadForm.tsx';
import { JoinSquadForm } from '@/features/squad/JoinSquadForm.tsx';
import { Leaderboard } from '@/features/squad/Leaderboard.tsx';
import { SoloBoard } from '@/features/squad/SoloBoard.tsx';
import { useMySquad } from '@/features/squad/queries.ts';
import { colors, font } from '@/theme.ts';
import { Button, Screen } from '@/ui/index.ts';

/** Which of the no-squad screens is showing. Local state, not a route. */
type Pane = 'choose' | 'create' | 'join';

export default function Squad() {
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const squad = useMySquad(userId);
  const [pane, setPane] = useState<Pane>('choose');

  // `Leaderboard` and `SoloBoard` each carry their own `Screen` — this file
  // owns layout only for the states that have no other component to supply
  // it, so no branch below ends up padded twice.

  // A pending query must not render the empty state. "You have no squad" is a
  // claim the user will act on, and during a load it is a guess.
  if (squad.isPending) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (squad.isError) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <Text style={styles.error}>{squad.error.message}</Text>
          <Button label="Try again" variant="secondary" onPress={() => void squad.refetch()} />
        </View>
      </Screen>
    );
  }

  if (squad.data) {
    return <Leaderboard squad={squad.data} />;
  }

  // Solo mode replaces the old empty state: the tab is worth opening before
  // the barkada joins (§7). Create and join stay one tap away.
  if (pane === 'choose') {
    return (
      <SoloBoard
        userId={userId}
        onCreate={() => setPane('create')}
        onJoin={() => setPane('join')}
      />
    );
  }

  if (pane === 'create') {
    return (
      <Screen scroll={false}>
        <CreateSquadForm userId={userId} onCancel={() => setPane('choose')} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <JoinSquadForm userId={userId} onCancel={() => setPane('choose')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, ...font.body.body, textAlign: 'center' },
});

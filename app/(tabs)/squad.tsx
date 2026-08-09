import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSessionStore } from '@/features/auth/session.ts';
import { CreateSquadForm } from '@/features/squad/CreateSquadForm.tsx';
import { JoinSquadForm } from '@/features/squad/JoinSquadForm.tsx';
import { Leaderboard } from '@/features/squad/Leaderboard.tsx';
import { SoloBoard } from '@/features/squad/SoloBoard.tsx';
import { useMySquad } from '@/features/squad/queries.ts';
import { colors, font } from '@/theme.ts';
import { setNavHidden } from '@/ui/chrome.ts';
import { Button, Screen } from '@/ui/index.ts';

/** Which of the no-squad screens is showing. Local state, not a route. */
type Pane = 'choose' | 'create' | 'join';

export default function Squad() {
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const squad = useMySquad(userId);
  const [pane, setPane] = useState<Pane>('choose');

  // Create and join are full-screen: the orbit nav floating over a half-filled
  // form reads as an escape hatch, and it paints over the bottom of it.
  //
  // `useFocusEffect`, not `useEffect`. The cleanup is the load-bearing half,
  // and Expo Router keeps tab screens mounted — so unmount is not the event
  // that matters. Anything navigating away mid-form (§14 sends eight
  // notification types straight to a screen) blurs this tab without
  // unmounting it, and a plain effect would strand the nav hidden everywhere.
  const composing = pane !== 'choose' && !squad.data;
  useFocusEffect(
    useCallback(() => {
      setNavHidden(composing);
      return () => setNavHidden(false);
    }, [composing]),
  );

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
    // `pane` is written on the assumption that a board never disappears
    // underneath it, and leaving breaks that: someone who opened Create,
    // joined by deep link without backing out, then leaves would land on the
    // create form with no board and no way back. Reset on the way out.
    return (
      <Leaderboard
        squad={squad.data}
        userId={userId}
        onLeave={() => setPane('choose')}
      />
    );
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
  error: { color: colors.damage, ...font.body.body, textAlign: 'center' },
});

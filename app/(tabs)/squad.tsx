import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSessionStore } from '@/features/auth/session.ts';
import { CreateSquadForm } from '@/features/squad/CreateSquadForm.tsx';
import { JoinSquadForm } from '@/features/squad/JoinSquadForm.tsx';
import { Leaderboard } from '@/features/squad/Leaderboard.tsx';
import { SoloBoard } from '@/features/squad/SoloBoard.tsx';
import { SquadDataConsentSheet } from '@/features/squad/SquadDataConsentSheet.tsx';
import { useSquadDataConsent } from '@/features/squad/consent.ts';
import { useMySquad } from '@/features/squad/queries.ts';
import { colors, font } from '@/theme.ts';
import { setNavHidden } from '@/ui/chrome.ts';
import { Button, Screen, Text } from '@/ui/index.ts';

/** Which of the no-squad screens is showing. Local state, not a route. */
type Pane = 'choose' | 'create' | 'join';

/**
 * Whether the consent prompt has already been declined this launch.
 *
 * **Module scope, not MMKV, and that is the decision.** Everyone already in a
 * squad joined under the previous model, where their totals were never
 * projected — so they have to be asked, and asked again next launch if they
 * say no. A permanent dismissal would strand that whole cohort on a track
 * where every lane but theirs reads "not sharing", with no way back to the
 * question. Same reasoning as the species prompt in deviation #40.
 *
 * It is not state, because nothing should re-render when it changes — the
 * `declined` state below is what does that, and this only survives the unmount
 * a tab switch does not cause but a remount would.
 */
let declinedThisLaunch = false;

export default function Squad() {
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const squad = useMySquad(userId);
  const [pane, setPane] = useState<Pane>('choose');
  const { consented, isSuccess } = useSquadDataConsent(userId);
  const [declined, setDeclined] = useState(declinedThisLaunch);

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
          <ActivityIndicator color={colors.accentDeep} />
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

  // Existing members are asked once per launch, because they joined under a
  // model where their totals were never projected to anyone (spec §4.5).
  //
  // `isSuccess &&`, never `!consented` alone: the query reads false while in
  // flight, and a sheet flashing over the board on every tab visit reads as a
  // bug. Declining leaves them on the board with four empty columns, which is
  // exactly what not sharing means.
  if (squad.data && isSuccess && !consented && !declined) {
    return (
      <Screen scroll={false}>
        <SquadDataConsentSheet
          userId={userId}
          onDecline={() => {
            declinedThisLaunch = true;
            setDeclined(true);
          }}
        />
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
  // the squad fills up (§7). Create and join stay one tap away.
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

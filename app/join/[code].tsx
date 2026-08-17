import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { resolveRoute } from '@/features/auth/route.ts';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { JoinSquadForm } from '@/features/squad/JoinSquadForm.tsx';
import { inviteCodeFromParam } from '@/features/squad/pending-invite.ts';
import { stashPendingInvite } from '@/features/squad/pending-invite-store.ts';
import { useMySquad } from '@/features/squad/queries.ts';
import { colors, font, space } from '@/theme.ts';
import { BackRow, Button, Label, Panel, Screen, Text } from '@/ui/index.ts';

/**
 * `https://<domain>/join/AB12CD`, and the `kairo://join/AB12CD` scheme with it.
 *
 * The link is an accelerator, never an action: it fills the field in and stops.
 * A link can be stale, belong to a squad that is full, or be tapped by somebody
 * who did not mean to join, and joining is not free — the free tier allows one
 * squad, so a wrong automatic join costs the user a `leave` and a rejoin they
 * did not ask for. `JoinSquadForm`'s own preview then shows them the squad's
 * name and program before they commit, which is the point of arriving here
 * rather than being dropped straight onto a board.
 *
 * Three arrivals, none of them unusual, and none of which the gate in
 * `app/_layout.tsx` handles for us:
 *
 * - **Signed out.** The gate replaces this route with `/sign-in` and the code
 *   is gone. It is written to MMKV first, and `app/(tabs)/_layout.tsx` — which
 *   only mounts for a `'ready'` user, so mounting *is* the gate — reads it back.
 * - **Already in a squad.** Explained here rather than redirected silently: a
 *   tap that lands you on your own board with no word about the invite reads
 *   as the link being broken.
 * - **A code that is not a code.** The form renders empty with a line saying
 *   so. Never a blank screen, and never a crash.
 */
export default function JoinByLink() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const code = inviteCodeFromParam(params.code);

  const session = useSessionStore((s) => s.session);
  const sessionLoading = useSessionStore((s) => s.loading);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const squad = useMySquad(userId);

  // The same verdict the gate acts on, read here so the two cannot disagree
  // about who gets redirected. Both shells that bounce this route are covered:
  // 'signed-out' goes to `/sign-in`, and 'needs-profile' goes to `/character`
  // — a user part-way through onboarding when the link arrives would otherwise
  // lose the code just as surely as one with no account at all.
  const route = resolveRoute({
    sessionLoading,
    hasSession: Boolean(session),
    profileLoading: profile.isPending,
    profileError: profile.isError,
    hasProfile: Boolean(profile.data),
  });
  const willBeRedirected = route === 'signed-out' || route === 'needs-profile';

  // Written before the gate can act, not after: `redirectTarget` fires from an
  // effect in the layout *above* this one, and child effects run first, so the
  // stash lands in the same commit that navigates away.
  //
  // Only for a user about to be sent elsewhere. Stashing unconditionally would
  // leave an entry that nothing consumes — `usePendingInvite` already ran at
  // mount for a ready user — and it would resurface on the next launch as a
  // join screen nobody asked for.
  //
  // `Date.now()` is read here rather than in the store, so that module stays
  // clock-free like every other decision this feature makes.
  useEffect(() => {
    if (!willBeRedirected || code === null) return;
    stashPendingInvite(code, Date.now());
  }, [willBeRedirected, code]);

  // Held, not guessed. Rendering "join a squad" to somebody who already has one
  // and then swapping it for the explanation below is a flicker that says the
  // app changed its mind.
  if (squad.isPending) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (squad.data) {
    return (
      <Screen scroll={false}>
        <BackRow onPress={() => router.replace('/squad')} />
        <Panel variant="plain" style={styles.panel}>
          <Label>INVITE</Label>
          <Text style={styles.title}>You're already in a squad.</Text>
          <Text style={styles.body}>
            Kairo is one squad at a time. To take this invite, leave{' '}
            {squad.data.name} first — your character, your streak and your
            history all stay with you.
          </Text>
        </Panel>
        <View style={styles.actions}>
          <Button
            label="Go to my squad"
            variant="primary"
            disabled={false}
            busy={false}
            onPress={() => router.replace('/squad')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <JoinSquadForm
        userId={userId}
        initialCode={code ?? undefined}
        notice={
          code === null
            ? "That link didn't carry a usable code. Ask for the six characters and type them in."
            : undefined
        }
        // `replace`, not `back`: arriving from a link means there is nothing
        // behind this screen to go back to, and `back()` on an empty stack is
        // a no-op that reads as a dead button.
        onCancel={() => router.replace('/squad')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  panel: { flex: 1 },
  title: { color: colors.text, ...font.body.title, marginTop: space.sm },
  body: { color: colors.subtle, ...font.body.body, marginTop: space.sm, lineHeight: 22 },
  actions: { paddingBottom: space.xl },
});

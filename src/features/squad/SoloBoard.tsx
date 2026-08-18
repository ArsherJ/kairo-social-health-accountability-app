import { RefreshControl, StyleSheet, View } from 'react-native';
import { DEFAULT_SQUAD_PROGRAM, FREE_SQUAD_MAX_MEMBERS } from '@kairo/core';
import { useTodayScore } from '@/features/character/queries.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { colors, font, space } from '@/theme.ts';
import { Button, Screen, Text } from '@/ui/index.ts';
import { LeaderboardRow } from './LeaderboardRow.tsx';
import { LockedSlot } from './LockedSlot.tsx';
import type { LeaderboardRow as Row } from './queries.ts';

/**
 * The squad tab before anyone joins (§7).
 *
 * §7 calls solo mode a "critical design decision" for a churn reason: one
 * person installs, their friends do not follow, and an empty screen is what
 * they leave over. A squadless user already *scores* correctly — this is a
 * rendering problem — so the board shows their real day beside the seat nobody
 * is sitting in.
 *
 * **One empty seat, not five, and no "1st of 1" above it** (2026-08-17). The
 * hero used to render an ordinal at 64pt over an audience of one, which is a
 * fake victory — the only thing it could ever say is that you beat nobody. And
 * five empty seats is a picture of loneliness drawn five times; one is a
 * picture of what a squad looks like. The actions move above the row for the
 * same reason: the thing to do here is invite somebody, not admire your rank.
 *
 * The data source is `useTodayScore`, not `squad_leaderboard`: the row is the
 * caller's own, and the RPC exists to project *other* people's data safely.
 */
export function SoloBoard({
  userId,
  onCreate,
  onJoin,
}: {
  userId: string | undefined;
  onCreate: () => void;
  onJoin: () => void;
}) {
  const profile = useProfile(userId);
  const score = useTodayScore(userId, profile.data?.timezone);

  const today = score.data;

  /**
   * `LeaderboardRow` rather than a parallel self-row component: the shape is
   * the same data — the user's own ratings, level and total — and two renderers
   * for one row would drift. Nothing here is invented about another player.
   */
  const selfRow: Row = {
    rank: 1,
    user_id: userId ?? 'self',
    character_name: profile.data?.character_name ?? '—',
    class: profile.data?.class ?? '',
    level: profile.data?.level ?? 1,
    local_date: '',
    total: today?.total ?? 0,
    tiers: today?.tiers ?? {},
    // Straight off the profile rollups, the same numbers the character screen
    // reads. Solo is the one board where the row is not built by the RPC, so
    // this is where the two sources have to be kept saying the same thing.
    ratings: {
      AGI: profile.data?.agi_total ?? 0,
      STR: profile.data?.str_total ?? 0,
      END: profile.data?.end_total ?? 0,
      VIT: profile.data?.vit_total ?? 0,
    },
    contributing_stats: today?.contributing_stats ?? 0,
    // From the profile, for the same reason the ratings above are: solo is the
    // one board the RPC does not build, so this is where the row and the
    // character screen have to be kept showing the same animal.
    species: profile.data?.species ?? null,
    has_rec: false,
    // Both are squad-social signals (§20, §5) with no meaning at an audience of
    // one, and the streak lands with the profile screen rather than here.
    flagged: false,
    current_streak: 0,
    status: today?.status ?? 'provisional',
    is_self: true,
    // Solo has no squad, so there is no program tilting anything. The total
    // above is the stored, unweighted one — which is exactly what all_around
    // means.
    program: DEFAULT_SQUAD_PROGRAM,
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={score.isRefetching}
          onRefresh={() => void score.refetch()}
          tintColor={colors.subtle}
        />
      }
    >
      <Text style={styles.title}>Your squad</Text>

      <Text style={styles.help}>
        A squad is up to {FREE_SQUAD_MAX_MEMBERS} people on the same day — they
        see your score, you see theirs. That is the entire mechanism.
      </Text>

      {/* Above the board, not below it. Nothing on this screen rewards
          reading downward — there is one real row and one empty one — so the
          action belongs where the eye lands first. */}
      <View style={styles.actions}>
        <Button label="Create a squad" variant="primary" onPress={onCreate} />

        {/* Deliberately not a second equal-weight button. Creating is the
            funnel — someone who already has a code knows they have one, and
            giving the two actions equal weight makes the empty board read as a
            two-way gate rather than a place you already belong. `ghost` is how
            that hierarchy is expressed now the button kit owns the styling. */}
        <Button label="Have an invite code?" variant="ghost" onPress={onJoin} />
      </View>

      {/* Solo is one row and nobody is above it — the same "nothing above"
          case `leaderboardGaps` returns null for on a real board. This is the
          one place a solo user sees their own day on this tab, and it is real
          numbers, which is why it survived the rest of this screen. */}
      <LeaderboardRow row={selfRow} mode="current" gap={null} />

      {/* One seat. `resolveSlots` is no longer called: it answered "how many
          seats are free under the free cap", and the answer stopped being what
          this screen draws. A count is still the right question on a real
          board, where that helper is still used. */}
      <LockedSlot rank={2} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, ...font.body.title },
  help: {
    color: colors.subtle,
    ...font.body.body,
    marginTop: space.md,
    lineHeight: 22,
  },
  actions: { marginTop: space.lg, marginBottom: space.md },
});

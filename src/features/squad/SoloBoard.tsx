import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { DEFAULT_SQUAD_PROGRAM, FREE_SQUAD_MAX_MEMBERS } from '@kairo/core';
import { useTodayScore } from '@/features/character/queries.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { colors, font, space } from '@/theme.ts';
import { Button, Numeral, Screen } from '@/ui/index.ts';
import { LeaderboardRow } from './LeaderboardRow.tsx';
import { LockedSlot } from './LockedSlot.tsx';
import type { LeaderboardRow as Row } from './queries.ts';
import { resolveSlots } from './slots.ts';

/**
 * The squad tab before anyone joins (§7).
 *
 * §7 calls solo mode a "critical design decision" for a churn reason: one
 * person installs, their friends do not follow, and an empty screen is what
 * they leave over. A squadless user already *scores* correctly — this is a
 * rendering problem — so the board shows their real day beside the seats
 * nobody is sitting in.
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

  // Solo is exactly one filled seat. The count is not fetched because there is
  // no squad to count — resolveSlots still owns the arithmetic so the free-cap
  // rule lives in one place.
  const { locked } = resolveSlots({
    memberCount: 1,
    maxMembers: FREE_SQUAD_MAX_MEMBERS,
  });

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

      <View style={styles.hero}>
        <Numeral value="1st" size="hero" color={colors.accent} />
        <Text style={styles.standing}>of 1</Text>
      </View>

      <Text style={styles.help}>
        You are ranked on your own for now. A squad is up to{' '}
        {FREE_SQUAD_MAX_MEMBERS} people on the same day — they see your score,
        you see theirs. That is the entire mechanism.
      </Text>

      <LeaderboardRow row={selfRow} mode="current" />

      {Array.from({ length: locked }, (_, index) => (
        <LockedSlot key={index} rank={index + 2} />
      ))}

      <View style={styles.actions}>
        <Button label="Create a squad" variant="primary" onPress={onCreate} />

        {/* Deliberately not a second equal-weight button. Creating is the
            funnel — someone who already has a code knows they have one, and
            giving the two actions equal weight makes the empty board read as a
            two-way gate rather than a place you already belong. `ghost` is how
            that hierarchy is expressed now the button kit owns the styling. */}
        <Button label="Have an invite code?" variant="ghost" onPress={onJoin} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, ...font.body.title },
  hero: { marginTop: space.lg },
  standing: { color: colors.subtle, ...font.body.body, marginTop: space.xs },
  help: {
    color: colors.subtle,
    ...font.body.body,
    marginTop: space.md,
    lineHeight: 22,
  },
  actions: { marginTop: space.lg },
});

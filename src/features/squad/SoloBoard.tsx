import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DEFAULT_SQUAD_PROGRAM, FREE_SQUAD_MAX_MEMBERS } from '@kairo/core';
import { useTodayScore } from '@/features/character/queries.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { colors, font, radius, space } from '@/theme.ts';
import { LeaderboardRow } from './LeaderboardRow.tsx';
import { LockedSlot } from './LockedSlot.tsx';
import type { LeaderboardRow as Row } from './queries.ts';
import { resolveSlots } from './slots.ts';

/**
 * The squad tab before anyone joins (§7).
 *
 * §7 calls solo mode a "critical design decision" for a churn reason: one
 * person installs, their barkada does not follow, and an empty screen is what
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
   * the same data — the user's own tiers, level and total — and two renderers
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={score.isRefetching}
          onRefresh={() => void score.refetch()}
          tintColor={colors.subtle}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Your squad</Text>
        <Text style={styles.members}>
          1 of {FREE_SQUAD_MAX_MEMBERS}
        </Text>
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
        <Pressable
          accessibilityRole="button"
          onPress={onCreate}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryLabel}>Create a squad</Text>
        </Pressable>

        {/* Deliberately a link, not a second button. Creating is the funnel
            — someone who already has a code knows they have one, and giving
            the two actions equal weight makes the empty board read as a
            two-way gate rather than a place you already belong. */}
        <Pressable
          accessibilityRole="link"
          onPress={onJoin}
          style={({ pressed }) => [styles.inviteLink, pressed && styles.pressed]}
        >
          <Text style={styles.inviteLabel}>Have an invite code?</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: space.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  title: { color: colors.text, ...font.title, flexShrink: 1 },
  members: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  help: {
    color: colors.subtle,
    ...font.body,
    marginTop: space.sm,
    marginBottom: space.sm,
    lineHeight: 22,
  },
  actions: { marginTop: space.lg },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  primaryLabel: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  inviteLink: { marginTop: space.sm, paddingVertical: space.md, alignItems: 'center' },
  inviteLabel: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});

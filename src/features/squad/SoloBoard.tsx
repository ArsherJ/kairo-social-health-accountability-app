import { RefreshControl, StyleSheet, View } from 'react-native';
import {
  DEFAULT_SQUAD_PROGRAM,
  FREE_SQUAD_MAX_MEMBERS,
  currentLocalDate,
  ghostRivals,
  type RacerInput,
} from '@kairo/core';
import { useTodayBuckets } from '@/features/character/buckets.ts';
import { useTodayScore } from '@/features/character/queries.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { colors, font, space } from '@/theme.ts';
import { Button, Screen, Text } from '@/ui/index.ts';
import { describeAge } from '@/features/health/sync-status.ts';
import { useSyncStatusStore } from '@/features/health/status-store.ts';
import { ghostDayLabel } from './ghost-day-label.ts';
import { LeaderboardRow } from './LeaderboardRow.tsx';
import { LockedSlot } from './LockedSlot.tsx';
import { RaceTrack } from './RaceTrack.tsx';
import { useOwnRecentDays, type LeaderboardRow as Row } from './queries.ts';

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
  // The day in raw units. `daily_scores` stores points and tiers, never steps,
  // so the race needs its own source — and solo is the one board the RPC does
  // not build, so this is it. No consent gate: consent governs what squadmates
  // see, never what you see of yourself.
  const raw = useTodayBuckets(userId, profile.data?.timezone);

  const days = useOwnRecentDays(userId, profile.data?.timezone);
  const { lastSyncedAt } = useSyncStatusStore();

  const today = score.data;
  const totals = raw.data?.totals;

  /**
   * Your rivals are your own recent days.
   *
   * The source design's §20 warns against solo Race/Battle/Adventure modes, and
   * this is the narrow, deliberate exception: it exists so nobody ever meets an
   * empty Squad tab, and so the mechanic teaches itself before a friend
   * arrives. `ghostRivals` drops days that scored nothing — a new account
   * otherwise lines up against three zeroes, which reads as the feature being
   * broken rather than as an easy win.
   *
   * Today is excluded by the query itself (`.lt('local_date', today)`), which
   * matters: racing a ghost of yourself puts two figures at exactly the same
   * position, drawn on top of each other.
   */
  const localDate = profile.data?.timezone
    ? currentLocalDate(new Date(), profile.data.timezone)
    : undefined;

  const ghosts = ghostRivals(days.data ?? [], 3).map((g) => ({
    ...g,
    // `race-label.ts` prefixes a ghost with "your", so this has to read
    // "your Saturday" — never "your 2026-08-22".
    characterName: localDate ? ghostDayLabel(g.characterName, localDate) : g.characterName,
    // Your own past days ran as you. A null species would draw them as blank
    // discs beside your own figure, which reads as three other people.
    species: profile.data?.species ?? null,
  }));

  const me: RacerInput = {
    userId: userId ?? 'self',
    characterName: profile.data?.character_name ?? 'You',
    species: profile.data?.species ?? null,
    steps: totals?.steps ?? 0,
    total: today?.total ?? 0,
    isSelf: true,
  };

  const syncedLabel =
    lastSyncedAt === null
      ? 'Your numbers have not synced yet'
      : `Your numbers: ${describeAge(Date.now() - lastSyncedAt)}`;

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
    // Three rollups, matching what `squad_leaderboard()` projects for everyone
    // else. MND read a hardcoded 0 while the column was still being added, and
    // 0 is indistinguishable from an unearned stat — so a wired-up sleeper
    // looked exactly like someone who had never slept, with nothing failing.
    // The character screen reads the same three, which is what keeps the two
    // agreeing.
    ratings: {
      AGI: profile.data?.agi_total ?? 0,
      STR: profile.data?.str_total ?? 0,
      MND: profile.data?.mnd_total ?? 0,
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
    // Your own day, always visible to you (deviation #47). Sleep is not read
    // here: the solo row does not draw it, and inventing a figure for a column
    // nothing renders is how the two sources start disagreeing.
    steps: totals?.steps ?? 0,
    distance_m: totals?.distanceM ?? 0,
    active_kcal: totals?.activeKcal ?? 0,
    sleep_minutes: null,
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={score.isRefetching || raw.isRefetching || days.isRefetching}
          onRefresh={() => {
            void score.refetch();
            // The track reads raw units and the ghosts read history; neither
            // rides the score query, so a pull that refreshed only the row
            // would leave the lanes where they were.
            void raw.refetch();
            void days.refetch();
          }}
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

      {/* The race, before the row. With no qualifying history `ghostRivals`
          returns nothing and you run one lane alone — never an empty track,
          and never a fabricated rival. The invite affordance above is what a
          lone lane points at. */}
      <RaceTrack rows={[]} extra={[me, ...ghosts]} syncedLabel={syncedLabel} />

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

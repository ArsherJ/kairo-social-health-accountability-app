import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DAILY_ITEM_GRANT_FREE } from '@kairo/core';
import { LeaderboardRow } from './LeaderboardRow.tsx';
import { LockedSlot } from './LockedSlot.tsx';
import { SlotUnlockReveal, useSlotUnlockReveal } from './SlotUnlockReveal.tsx';
import {
  useSquadLeaderboard,
  useSquadMemberCount,
  type LeaderboardMode,
  type LeaderboardRow as Row,
  type Squad,
} from './queries.ts';
import { useLeaveSquad } from './mutations.ts';
import { boostChipLabel, programLabel } from './program-copy.ts';
import { resolveSlots } from './slots.ts';
import { useSquadRealtime } from './useSquadRealtime.ts';
import { DeploySheet } from '@/features/sabotage/DeploySheet.tsx';
import { SquadFeed } from '@/features/sabotage/SquadFeed.tsx';
import { useDailyItems } from '@/features/sabotage/queries.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { colors, font, radius, space } from '@/theme.ts';

const MODES: ReadonlyArray<{ mode: LeaderboardMode; label: string }> = [
  { mode: 'current', label: 'Today' },
  { mode: 'completed', label: 'Yesterday' },
];

export function Leaderboard({
  squad,
  userId,
  onLeave,
}: {
  squad: Squad;
  userId: string | undefined;
  /** Fires after the squad is left, so the screen behind can reset its pane. */
  onLeave?: () => void;
}) {
  // The live board is the default: §2's hooks assume a board you check during
  // the day ("1 hour left, you're in Nth place"). Completed-day is secondary.
  const [mode, setMode] = useState<LeaderboardMode>('current');
  const board = useSquadLeaderboard(squad.id, mode);
  const leave = useLeaveSquad(userId);

  // The ledger is keyed by the caller's LOCAL date (§2), which lives on the
  // profile — the device's calendar date would read the wrong row abroad.
  const profile = useProfile(userId);
  const items = useDailyItems(
    userId,
    profile.data?.timezone,
    profile.data?.is_legendary ?? false,
  );
  // Not `?? 0` while the two queries settle: zero disables every affordance,
  // so a cold start would render the mechanic dead for a beat and then wake it
  // up. The free grant is the right guess — everyone is free at MVP — it
  // self-corrects on the first response, and the server refuses a throw the
  // client wrongly allowed. A dead button on a working account is the worse
  // failure of the two.
  const remaining = items.data?.remaining ?? DAILY_ITEM_GRANT_FREE;
  const [target, setTarget] = useState<Row | null>(null);

  // Not `board.data.length`: the RPC returns only members who have scored, so
  // deriving slots from it would render a squadmate who has not moved today as
  // an empty seat and invite them again.
  const memberCount = useSquadMemberCount(squad.id);
  const { locked } = resolveSlots({
    memberCount: memberCount.data,
    maxMembers: squad.max_members,
  });
  const reveal = useSlotUnlockReveal(memberCount.data);

  // Subscribed for as long as the board is mounted. Expo Router keeps tab
  // screens mounted, so the channel survives tab switches, which is both
  // correct and free.
  useSquadRealtime(squad.id);

  const rows = board.data ?? [];
  const boost = boostChipLabel(squad.program);

  // In completed mode every member is ranked on their OWN yesterday, so a
  // squad spanning timezones legitimately compares two calendar dates. Saying
  // so is the honest option; rendering them under one heading is not.
  const dates = [...new Set(rows.map((r) => r.local_date))].sort();
  const mixedDates = mode === 'completed' && dates.length > 1;

  function confirmLeave() {
    // Say what is lost before it is lost. Leaving is not undoable and the
    // invite code is the only way back, which is not something to discover
    // afterwards from an empty tab.
    const lines = [
      'You lose your place on this board and your history with this squad.',
      'You will need the invite code to come back.',
    ];
    if (memberCount.data === 1) {
      lines.push('You are the last member, so the squad will be deleted.');
    } else if (squad.leader_id === userId) {
      lines.push('Leadership passes to the longest-standing member.');
    }

    Alert.alert(`Leave ${squad.name}?`, lines.join('\n\n'), [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => leave.mutate({ squadId: squad.id }, { onSuccess: onLeave }),
      },
    ]);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={board.isRefetching}
          onRefresh={() => {
            void board.refetch();
            // Membership has no broadcast to ride on, so a pull is one of the
            // two moments a new squadmate can appear (§7's reveal).
            void memberCount.refetch();
          }}
          tintColor={colors.subtle}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.squadName} numberOfLines={1}>
          {squad.name}
        </Text>
        <Text style={styles.members}>
          {memberCount.data ?? '—'} of {squad.max_members}
        </Text>
      </View>

      {/* The program is the board's rule, so it belongs in the header rather
          than in a settings screen nobody opens. */}
      <View style={styles.programLine}>
        <Text style={styles.program}>{programLabel(squad.program)}</Text>
        {boost && (
          <View style={styles.boostChip}>
            <Text style={styles.boostLabel}>{boost}</Text>
          </View>
        )}
      </View>

      {/* This is how a squad grows (§9), so the code is a headline, not a
          settings row: large enough to read aloud and to survive a screenshot. */}
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>INVITE CODE</Text>
        <Text style={styles.code} selectable>
          {squad.invite_code}
        </Text>
      </View>

      <View style={styles.toggle}>
        {MODES.map(({ mode: value, label }) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === value }}
            onPress={() => setMode(value)}
            style={[styles.toggleOption, mode === value && styles.toggleActive]}
          >
            <Text
              style={[styles.toggleLabel, mode === value && styles.toggleLabelActive]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {mixedDates && (
        <Text style={styles.note}>
          Members are on different dates ({dates.join(' and ')}) — each is ranked on
          their own completed day.
        </Text>
      )}

      {board.isPending && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {/* A failed fetch must never render as "nobody here". The last phase
          stranded a user by reading an error as absence — this is the same
          shape of bug, so the error state is explicit and offers a retry. */}
      {board.isError && (
        <View style={styles.centered}>
          <Text style={styles.error}>{board.error.message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void board.refetch()}
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          >
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      )}

      {board.isSuccess && rows.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.empty}>
            Nobody on the board yet. Send the code above.
          </Text>
        </View>
      )}

      {rows.map((row) => (
        <LeaderboardRow
          key={row.user_id}
          row={row}
          mode={mode}
          remaining={remaining}
          onDeploy={setTarget}
        />
      ))}

      {reveal.visible && <SlotUnlockReveal progress={reveal.progress} />}

      {/* §7: locked slots are visible every day, not only when solo — the
          constant pull to invite the rest of the barkada. Ranked after every
          member, scored or not, so the numbering never skips or repeats. */}
      {Array.from({ length: locked }, (_, index) => (
        <LockedSlot key={index} rank={(memberCount.data ?? 0) + index + 1} />
      ))}

      <SquadFeed squadId={squad.id} />

      <DeploySheet
        userId={userId}
        squadId={squad.id}
        timeZone={profile.data?.timezone}
        target={target}
        remaining={remaining}
        onClose={() => setTarget(null)}
      />

      {/* Deliberately at the foot of the scroll and styled as quiet text, not
          a header icon: this is rare, irreversible, and must not sit next to
          the invite code someone taps every day. */}
      <View style={styles.leaveBlock}>
        {leave.isError && <Text style={styles.error}>{leave.error.message}</Text>}
        <Pressable
          accessibilityRole="button"
          disabled={leave.isPending}
          onPress={confirmLeave}
          style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
        >
          <Text style={[styles.leaveLabel, leave.isPending && styles.leaveLabelBusy]}>
            {leave.isPending ? 'Leaving…' : 'Leave squad'}
          </Text>
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
  squadName: { color: colors.text, ...font.title, flexShrink: 1 },
  members: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  programLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
  },
  program: { color: colors.subtle, fontSize: 14, fontWeight: '600' },
  boostChip: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  boostLabel: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  codeCard: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  codeLabel: { color: colors.muted, ...font.label },
  code: {
    color: colors.accent,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 10,
    // Trailing letter-spacing is added after the last glyph too, which
    // visually shifts the code left of centre without this.
    marginLeft: 10,
    marginTop: space.xs,
  },
  toggle: {
    flexDirection: 'row',
    marginTop: space.lg,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  toggleActive: { backgroundColor: colors.accent },
  toggleLabel: { color: colors.subtle, fontSize: 14, fontWeight: '700' },
  toggleLabelActive: { color: colors.bg },
  note: { color: colors.muted, fontSize: 12, marginTop: space.sm, lineHeight: 18 },
  centered: { paddingVertical: space.xl, alignItems: 'center' },
  error: { color: colors.danger, ...font.body, textAlign: 'center' },
  empty: { color: colors.muted, ...font.body, textAlign: 'center' },
  retry: {
    marginTop: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  leaveBlock: { marginTop: space.xl, alignItems: 'center' },
  leave: { paddingVertical: space.sm, paddingHorizontal: space.lg },
  leaveLabel: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  leaveLabelBusy: { color: colors.muted },
  pressed: { opacity: 0.85 },
});

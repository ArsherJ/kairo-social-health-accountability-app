import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { DAILY_ITEM_GRANT_FREE } from '@kairo/core';
import { LeaderboardRow } from './LeaderboardRow.tsx';
import { LockedSlot } from './LockedSlot.tsx';
import { SlotUnlockReveal, useSlotUnlockReveal } from './SlotUnlockReveal.tsx';
import { resolveSquadStanding, type SquadStanding } from './standing.ts';
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
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { Button, Numeral, Panel, Screen } from '@/ui/index.ts';

const MODES: ReadonlyArray<{ mode: LeaderboardMode; label: string }> = [
  { mode: 'current', label: 'Today' },
  { mode: 'completed', label: 'Yesterday' },
];

/** "1st", "2nd", "3rd", "4th"... "11th"–"13th" are the irregular teens. */
function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * 'YYYY-MM-DD' -> 'Aug 4'. Parsed as UTC on purpose: these strings are already
 * the correct local calendar date for the member(s) they describe, and
 * letting `Date` reinterpret them against the device's own offset could shift
 * the printed date by a day in either direction.
 */
function formatLocalDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * The hero line beneath the rank. `back === null` means nobody is ahead;
 * `back === 0` means tied with the row directly above — two different facts
 * that must not collapse into the same sentence.
 */
function standingSubline(standing: SquadStanding): string | null {
  switch (standing.kind) {
    case 'unknown':
      return null;
    case 'unranked':
      return `of ${standing.of}`;
    case 'ranked': {
      const of = `of ${standing.of}`;
      if (standing.back === null) return `${of} · leading`;
      if (standing.back === 0) return `${of} · tied with the player above`;
      return `${of} · ${standing.back.toLocaleString()} back`;
    }
  }
}

/**
 * The invite-code block. Exactly one of its two call sites ever renders at
 * once — the point is "put it where the reason to read it actually is", not
 * "put it everywhere": an empty board wants it beside "nobody's here yet",
 * a board with open seats wants it above the seats, and a full, scored
 * squad has no seat left to invite anyone into, so neither fires.
 */
function InviteCode({ code }: { code: string }) {
  return (
    <Panel variant="plain" style={styles.codeCard}>
      <Text style={styles.codeLabel}>INVITE CODE</Text>
      <Text style={styles.code} selectable>
        {code}
      </Text>
    </Panel>
  );
}

export function Leaderboard({
  squad,
  userId,
  onLeave,
}: {
  squad: Squad;
  userId: string | undefined;
  /** Fires after the squad is left, so the screen behind can reset its pane. */
  onLeave?: () => void;
}) {  // The live board is the default: §2's hooks assume a board you check during
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

  // This comment used to claim the RPC returns only members who have *scored*,
  // and that deriving slots from `board.data.length` would render an unmoved
  // squadmate as an empty seat. That has never been true: every version of
  // `squad_leaderboard` reaches `daily_scores` by `left join`, so a member who
  // has not moved appears with `total = 0` rather than being absent. Workstream
  // A's deploy sheet depends on that corrected reading — its target list is
  // board rows, which is only safe because every member is on them.
  //
  // So this count is now redundant for slot maths. It stays because removing it
  // is a refactor of this component's data flow, not a comment fix; recorded as
  // a V1 cleanup in `docs/superpowers/specs/2026-08-07-d-polish-design.md`.
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

  const standing = resolveSquadStanding({ rows: board.data, memberCount: memberCount.data });
  const heroValue =
    standing.kind === 'ranked'
      ? ordinal(standing.rank)
      : standing.kind === 'unranked'
        ? 'Unranked'
        : null;
  const subline = standingSubline(standing);

  // In completed mode every member is ranked on their OWN yesterday, so a
  // squad spanning timezones legitimately compares two calendar dates. Saying
  // so is the honest option; rendering them under one heading is not.
  const dates = [...new Set(rows.map((r) => r.local_date))].sort();
  const mixedDates = mode === 'completed' && dates.length > 1;
  // The header date is only shown when it is unambiguous — a mixed board
  // already says so explicitly in the note below, and guessing one date out
  // of several here would just be a second, contradicting claim.
  const [onlyDate] = dates;
  const headerDate = dates.length === 1 && onlyDate ? formatLocalDate(onlyDate) : null;

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
    <Screen
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
        {headerDate != null && <Text style={styles.date}>{headerDate}</Text>}
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

      {/* A pending standing query must never render a claim: nothing beats a
          placeholder or a dash, both of which would state something false. */}
      {heroValue != null && (
        <View style={styles.hero}>
          <Numeral value={heroValue} size="hero" color={ramp.accent[700]} />
          {subline != null && <Text style={styles.standing}>{subline}</Text>}
        </View>
      )}
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
          <Button label="Try again" variant="secondary" onPress={() => void board.refetch()} />
        </View>
      )}

      {board.isSuccess && rows.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.empty}>Nobody on the board yet. Send the code below.</Text>
          <InviteCode code={squad.invite_code} />
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
          member, scored or not, so the numbering never skips or repeats.
          Gated on `rows.length > 0`: an empty board already showed the code
          above, and showing it twice was the earlier bug here. */}
      {rows.length > 0 && locked > 0 && <InviteCode code={squad.invite_code} />}

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
    </Screen>  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  squadName: { color: colors.text, ...font.display.major, fontSize: 27, flexShrink: 1 },
  date: { ...font.body.label, color: ramp.neutral[600], letterSpacing: 0 },
  members: { ...font.body.label, color: ramp.neutral[600], letterSpacing: 0 },
  hero: { marginTop: space.md },
  standing: { color: ramp.neutral[700], ...font.body.body, marginTop: space.xs },
  programLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: 9,
  },
  // The program and its boost are the board's rule, so they read as two tags
  // on the header rather than as a sentence: sage for the lane the squad is
  // running, terracotta for the multiplier that changes the maths.
  program: {
    ...font.body.label,
    fontSize: 11.5,
    letterSpacing: 0,
    color: ramp.sage[800],
    backgroundColor: ramp.sage[200],
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  boostChip: {
    backgroundColor: ramp.accent[200],
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  boostLabel: { ...font.body.label, fontSize: 11.5, letterSpacing: 0, color: ramp.accent[800] },
  codeCard: { alignItems: 'center', backgroundColor: ramp.sage[200] },
  codeLabel: { ...font.body.label, color: ramp.sage[700], textTransform: 'uppercase' },
  code: {
    ...font.display.major,
    fontSize: 38,
    letterSpacing: 10,
    color: ramp.sage[900],
    // Trailing letter-spacing is added after the last glyph too, which
    // visually shifts the code left of centre without this.
    marginLeft: 10,
    marginTop: space.xs,
  },
  toggle: {
    flexDirection: 'row',
    marginTop: space.md,
    padding: 4,
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: ramp.neutral[200],
  },
  toggleOption: {
    flex: 1,
    // ≥44pt touch target: the pill's own vertical padding plus its text line
    // height, with no reliance on hitSlop.
    paddingVertical: 14,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  toggleActive: { backgroundColor: colors.accent },
  toggleLabel: { ...font.display.small, fontSize: 14, color: ramp.neutral[700] },
  toggleLabelActive: { color: colors.bg },
  note: { ...font.body.body, fontSize: 12, color: colors.muted, marginTop: space.sm, lineHeight: 18 },
  centered: { paddingVertical: space.xl, alignItems: 'center' },
  error: { color: colors.damage, ...font.body.body, textAlign: 'center' },
  empty: { color: colors.muted, ...font.body.body, textAlign: 'center' },
  leaveBlock: { marginTop: space.xl, alignItems: 'center' },
  leave: { paddingVertical: space.sm, paddingHorizontal: space.lg },
  leaveLabel: { ...font.body.strong, fontSize: 14, color: ramp.accent[700] },
  leaveLabelBusy: { color: colors.muted },
  pressed: { opacity: 0.85 },
});

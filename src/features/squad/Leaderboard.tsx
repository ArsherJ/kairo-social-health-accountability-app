import { useState } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { LeaderboardRow } from './LeaderboardRow.tsx';
import { LockedSlot } from './LockedSlot.tsx';
import { SlotUnlockReveal, useSlotUnlockReveal } from './SlotUnlockReveal.tsx';
import { resolveSquadStanding, type SquadStanding } from './standing.ts';
import {
  useSquadLeaderboard,
  useSquadMemberCount,
  type LeaderboardMode,
  type Squad,
} from './queries.ts';
import { useLeaveSquad } from './mutations.ts';
import { boostChipLabel, programLabel } from './program-copy.ts';
import { shareInvite } from './share-invite.ts';
import { resolveSlots } from './slots.ts';
import { useSquadRealtime } from './useSquadRealtime.ts';
import { SquadGoalPanel } from '@/features/goals/SquadGoalPanel.tsx';
import { useProfile } from '@/features/profile/queries.ts';
import { useRouter } from 'expo-router';
import { currentLocalDate } from '@kairo/core';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { Button, Numeral, Panel, Screen, Text } from '@/ui/index.ts';

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
 * The hero line, now sitting *beside* the rank rather than under it.
 *
 * Returned in segments so the gap can carry the emphasis the design puts on
 * it without picking the number back out of a finished sentence with a regex.
 * `back === null` means nobody is ahead; `back === 0` means tied with the row
 * directly above — two different facts that must not collapse into one.
 */
type SublinePart = { text: string; emphasis?: boolean };

function standingSubline(standing: SquadStanding): SublinePart[] | null {
  switch (standing.kind) {
    case 'unknown':
      return null;
    case 'unranked':
      return [{ text: `of ${standing.of}` }];
    case 'ranked': {
      const of = `of ${standing.of}`;
      if (standing.back === null) return [{ text: `${of} · leading` }];
      if (standing.back === 0) return [{ text: `${of} · tied with the player above` }];
      return [
        { text: `${of} · ` },
        { text: standing.back.toLocaleString(), emphasis: true },
        { text: ' back' },
      ];
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
function InviteCode({ code, squadName }: { code: string; squadName: string }) {
  return (
    <Panel variant="plain" style={styles.codeCard}>
      <Text style={styles.codeLabel}>INVITE CODE</Text>
      <Text style={styles.code} selectable>
        {code}
      </Text>

      {/* The card used to end here, and that was the whole social loop: six
          characters to read aloud. The code stays `selectable` for anyone who
          wants to long-press it; this is the path for everyone else, and it
          puts Messenger and Viber one tap away rather than a toast. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Share the invite code for ${squadName}`}
        hitSlop={space.sm}
        onPress={() => void shareInvite({ squadName, inviteCode: code })}
        style={({ pressed }) => [styles.shareRow, pressed && styles.pressedRow]}
      >
        <Feather name="share" size={14} color={ramp.sage[700]} />
        <Text style={styles.shareLabel}>Share invite</Text>
      </Pressable>
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
  const router = useRouter();
  const [mode, setMode] = useState<LeaderboardMode>('current');
  const board = useSquadLeaderboard(squad.id, mode);
  const leave = useLeaveSquad(userId);

  const profile = useProfile(userId);

  // This comment used to claim the RPC returns only members who have *scored*,
  // and that deriving slots from `board.data.length` would render an unmoved
  // squadmate as an empty seat. That has never been true: every version of
  // `squad_leaderboard` reaches `daily_scores` by `left join`, so a member who
  // has not moved appears with `total = 0` rather than being absent.
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
        // One baseline, not two lines: "2nd" and what it costs you are a
        // single claim, and stacking them made the subline read as a caption
        // for the ordinal rather than as the other half of the sentence.
        <View style={styles.hero}>
          <Numeral
            value={heroValue}
            size="hero"
            color={ramp.accent[700]}
            style={styles.heroValue}
          />
          {subline != null && (
            <Text style={styles.standing} numberOfLines={1}>
              {subline.map((part, index) => (
                <Text key={index} style={part.emphasis ? styles.standingGap : undefined}>
                  {part.text}
                </Text>
              ))}
            </Text>
          )}
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
          <InviteCode code={squad.invite_code} squadName={squad.name} />
        </View>
      )}

      {rows.map((row) => (
        <LeaderboardRow key={row.user_id} row={row} mode={mode} />
      ))}

      {reveal.visible && <SlotUnlockReveal progress={reveal.progress} />}

      {/* §7: locked slots are visible every day, not only when solo — the
          constant pull to invite the rest of the squad. Ranked after every
          member, scored or not, so the numbering never skips or repeats.
          Gated on `rows.length > 0`: an empty board already showed the code
          above, and showing it twice was the earlier bug here. */}
      {rows.length > 0 && locked > 0 && <InviteCode code={squad.invite_code} squadName={squad.name} />}

      {Array.from({ length: locked }, (_, index) => (
        <LockedSlot
          key={index}
          rank={(memberCount.data ?? 0) + index + 1}
          onPress={() =>
            void shareInvite({
              squadName: squad.name,
              inviteCode: squad.invite_code,
            })
          }
        />
      ))}

      {/* The slot the sabotage feed left, doing the opposite job: the feed was
          what people did *to* each other, this is what they committed to
          together. */}
      <SquadGoalPanel
        squadId={squad.id}
        userId={userId}
        today={
          profile.data?.timezone
            ? currentLocalDate(new Date(), profile.data.timezone)
            : undefined
        }
        onSetGoal={() => router.push(`/goal/new?squadId=${squad.id}`)}
      />

      {/* Deliberately at the foot of the scroll, not in a header: this is rare,
          irreversible, and must not sit next to the invite code someone taps
          every day. Outlined rather than filled so it stays quiet down here —
          the `destructive` variant is exactly this compromise, and abandoning a
          goal now uses the same one so the two cannot drift. */}
      <View style={styles.leaveBlock}>
        {leave.isError && <Text style={styles.error}>{leave.error.message}</Text>}
        <Button
          label={leave.isPending ? 'Leaving…' : 'Leave squad'}
          variant="destructive"
          onPress={confirmLeave}
          disabled={leave.isPending}
          busy={leave.isPending}
        />
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
  hero: {
    marginTop: space.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
  },
  heroValue: { fontSize: 66 },
  // Caprasimo at 66 carries a deep descender box, so a flex-end row would hang
  // the subline below the ordinal's visual baseline without this.
  standing: {
    color: ramp.neutral[700],
    ...font.body.body,
    paddingBottom: 8,
    flexShrink: 1,
  },
  // Family off the token rather than a string literal: weights are chosen by
  // face here, never by `fontWeight`, and `title` is the bold Figtree cut.
  standingGap: {
    ...font.body.body,
    fontFamily: font.body.title.fontFamily,
    color: ramp.accent[700],
  },
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
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.sm,
    paddingVertical: space.xs,
  },
  shareLabel: { ...font.body.strong, color: ramp.sage[700], marginLeft: space.xs },
  pressedRow: { opacity: 0.6 },
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
  leaveBlock: { marginTop: space.xl, gap: space.sm },
  pressed: { opacity: 0.85 },
});

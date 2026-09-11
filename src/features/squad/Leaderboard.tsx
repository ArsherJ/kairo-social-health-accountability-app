import { useState } from 'react';
import { FlockPerch, type PerchMember } from './FlockPerch.tsx';
import { PerchBirdSheet } from './PerchBirdSheet.tsx';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { LeaderboardRow } from './LeaderboardRow.tsx';
import { LockedSlot } from './LockedSlot.tsx';
import { leaderboardGaps } from './row-gap.ts';
import { SlotUnlockReveal, useSlotUnlockReveal } from './SlotUnlockReveal.tsx';
import { resolveSquadStanding, standingHero, standingSubline } from './standing.ts';
import { SOLO_SKY_OBSERVATION } from './sky-reading.ts';
import { FlockStrip } from './FlockStrip.tsx';
import { flockWalk } from './flock-walk.ts';
import {
  type LeaderboardMode,
  type Squad,
  useSquadLeaderboard,
  useSquadMemberCount,
} from './queries.ts';
import { useLeaveSquad } from './mutations.ts';
import { boostChipLabel, programLabel } from './program-copy.ts';
import { shareInvite } from './share-invite.ts';
import { resolveSlots } from './slots.ts';
import { useSquadRealtime } from './useSquadRealtime.ts';
import { font, radius, space, type Theme } from '@/theme.ts';
import { Button, Numeral, Panel, Screen, SegmentedControl, Text, useStyles, useTheme } from '@/ui/index.ts';

const MODES: ReadonlyArray<{ value: LeaderboardMode; label: string }> = [
  { value: 'current', label: 'Today' },
  { value: 'completed', label: 'Yesterday' },
];

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
 * The invite-code block. Exactly one of its two call sites ever renders at
 * once — the point is "put it where the reason to read it actually is", not
 * "put it everywhere": an empty board wants it beside "nobody's here yet",
 * a board with open seats wants it above the seats, and a full, scored
 * squad has no seat left to invite anyone into, so neither fires.
 */
function InviteCode({ code, squadName }: { code: string; squadName: string }) {
  const styles = useStyles(makeStyles);
  const { ramp } = useTheme();
  return (
    <Panel variant='plain' style={styles.codeCard}>
      <Text style={styles.codeLabel}>INVITE CODE</Text>
      {
        /* A code is drawn geometry, not prose. At the largest accessibility
          sizes the default `prose` scale took 38pt to ~68pt, and with the
          letter-spacing below that is wider than a 320pt screen: it broke to a
          second line with a single character orphaned under the tab bar, six
          characters that have to be read aloud in one breath rendered as five
          and one.

          So it takes the `fixed` scale — type locked to geometry the app draws,
          the same reading a rank in a fixed-height row gets — and then shrinks
          to fit rather than reflowing. `numberOfLines={1}` is what makes
          `adjustsFontSizeToFit` a shrink instead of a wrap, and the two are
          only ever correct together. `minimumFontScale` keeps the floor
          legible: without it iOS is free to shrink as far as it likes, and a
          code nobody can read is not better than a wrapped one. */
      }
      <Text
        scale="fixed"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={styles.code}
        selectable
      >
        {code}
      </Text>

      {
        /* The card used to end here, and that was the whole social loop: six
          characters to read aloud. The code stays `selectable` for anyone who
          wants to long-press it; this is the path for everyone else, and it
          puts Messenger and Viber one tap away rather than a toast. */
      }
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={`Share the invite code for ${squadName}`}
        hitSlop={space.sm}
        onPress={() => void shareInvite({ squadName, inviteCode: code })}
        style={(
          { pressed },
        ) => [styles.shareRow, { minHeight: 48, minWidth: 48 }, pressed && styles.pressedRow]}
      >
        <MaterialCommunityIcons name='share-variant' size={14} color={ramp.sage[700]} />
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
}) {
  // The live board is the default: §2's hooks assume a board you check during
  // the day ("1 hour left, you're in Nth place"). Completed-day is secondary.
  // The band bleeds under the status bar, so its content takes the inset —
  // `Screen bleed` hands that back rather than guessing.
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [selectedBird, setSelectedBird] = useState<PerchMember | null>(null);
  const [mode, setMode] = useState<LeaderboardMode>('current');
  const board = useSquadLeaderboard(squad.id, mode);
  const leave = useLeaveSquad(userId);

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

  // One pass over the board, not a scan per row.
  const gaps = leaderboardGaps(rows);

  // The flock's own reading, out of the payload already fetched for the list —
  // no second request, no new RPC. It follows `mode` for the same reason the
  // leader line does: a "today" claim drawn over a yesterday board is a false
  // one. Null means there is nothing cooperative to say (a squad of one, or a
  // viewer whose own consent withholds every row including their own).
  const walk = flockWalk({
    members: rows.map((r) => ({ characterName: r.character_name, steps: r.steps })),
    mode,
  });

  /*
    The day's best.

    `rows[0]` because the RPC has already ordered them. Guarded on **two or
    more** rows: "you are ahead" in a squad of one is not a standing, it is the
    app congratulating somebody for being alone, and a squad of one is exactly
    the state the invite block below exists to fix.
  */
  const [leader] = rows;

  // What the band leads with, and what it says beside it. Both decisions are
  // in `standing.ts` rather than here: the words a squad of one may never read
  // are a rule, and root Vitest cannot load a component file to guard one.
  const standing = resolveSquadStanding({ rows: board.data, memberCount: memberCount.data });
  const heroValue = standingHero(standing);
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
      bleed
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
      <FlockPerch
        title={squad.name}
        members={rows}
        leaderId={rows.length > 1 ? leader?.user_id : undefined}
        topInset={insets.top}
        onBirdPress={setSelectedBird}
        onInvite={memberCount.isSuccess && memberCount.data < squad.max_members
          ? () => void shareInvite({ squadName: squad.name, inviteCode: squad.invite_code })
          : undefined}
      />
      {selectedBird && (
        <PerchBirdSheet
          member={selectedBird}
          mode={mode}
          onClose={() => setSelectedBird(null)}
        />
      )}

      <View style={styles.page}>
        {standing.kind === 'alone' && <Text style={styles.alone}>{SOLO_SKY_OBSERVATION}</Text>}
        {heroValue !== null && (
          <View accessible accessibilityLabel={`${heroValue}${subline ? `, ${subline.map((part) => part.text).join('')}` : ''}`}>
            <View accessibilityElementsHidden importantForAccessibility='no-hide-descendants' style={styles.standingRow}>
              <Numeral value={heroValue} size='major' color={colors.accentInk} />
              {subline && <Text style={styles.standing}>
                {subline.map((part, index) => <Text key={index} style={part.emphasis ? styles.standingGap : undefined}>{part.text}</Text>)}
              </Text>}
            </View>
          </View>
        )}
        {
          /* The program is the board's rule, so it belongs with the board rather
          than in a settings screen nobody opens. Below the band and not on it:
          the band is the squad's identity and this is the squad's *setting*,
          and the two read as one claim when stacked. */
        }
        {walk && (
          <Panel>
            <Text style={{ ...font.body.body, color: colors.text }}>{walk.label}</Text>
            <View accessibilityElementsHidden importantForAccessibility='no-hide-descendants'>
              <FlockStrip marks={walk.marks} label={walk.label} />
            </View>
          </Panel>
        )}
        <View style={styles.programLine}>
          <Text style={styles.program}>{programLabel(squad.program)}</Text>
          {boost && (
            <View style={styles.boostChip}>
              <Text style={styles.boostLabel}>{boost}</Text>
            </View>
          )}
          {headerDate != null && <Text style={styles.date}>{headerDate}</Text>}
        </View>

        <View style={styles.toggle}>
          <SegmentedControl options={MODES} value={mode} onChange={setMode} accessibilityLabel="Which day the board ranks" />
        </View>

        {mixedDates && (
          <Text style={styles.note}>
            Members are on different dates ({dates.join(' and ')}) — each is ranked on their own
            completed day.
          </Text>
        )}

        {board.isPending && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accentDeep} />
          </View>
        )}

        {
          /* A failed fetch must never render as "nobody here". The last phase
          stranded a user by reading an error as absence — this is the same
          shape of bug, so the error state is explicit and offers a retry. */
        }
        {board.isError && (
          <View style={styles.centered}>
            <Text style={styles.error}>{board.error.message}</Text>
            <Button label='Try again' variant='secondary' onPress={() => void board.refetch()} />
          </View>
        )}

        {board.isSuccess && rows.length === 0 && (
          <View style={styles.centered}>
            <Text style={styles.empty}>Nobody on the board yet. Send the code below.</Text>
            <InviteCode code={squad.invite_code} squadName={squad.name} />
          </View>
        )}

        {
          /* `ranked` is the band's rule applied to the rows: a board of one draws
          and speaks "1" for a position nobody is being held against, which is
          the same sentence the standing above it stopped saying. */
        }
        {rows.length > 0 && (
          <Panel style={{ padding: space.sm }}>
            {rows.map((row) => (
              <LeaderboardRow
                key={row.user_id}
                row={row}
                mode={mode}
                gap={gaps.get(row.user_id) ?? null}
                ranked={rows.length > 1}
              />
            ))}
          </Panel>
        )}

        {reveal.visible && <SlotUnlockReveal progress={reveal.progress} />}

        {
          /* §7: locked slots are visible every day, not only when solo — the
          constant pull to invite the rest of the squad. Gated on
          `rows.length > 0`: an empty board already showed the code above, and
          showing it twice was the earlier bug here. */
        }
        {rows.length > 0 && locked > 0 && (
          <InviteCode code={squad.invite_code} squadName={squad.name} />
        )}

        {
          /* One row for every free seat, not one row each — `SkyFlockRail`'s
          trailing-slot rule, which this board needed for the same reason and
          did not have. A squad of one drew five identical dashed rows here. */
        }
        {locked > 0 && (
          <LockedSlot
            remaining={locked}
            onPress={() =>
              void shareInvite({
                squadName: squad.name,
                inviteCode: squad.invite_code,
              })}
          />
        )}

        {
          /* Deliberately at the foot of the scroll, not in a header: this is rare,
          irreversible, and must not sit next to the invite code someone taps
          every day. Outlined rather than filled so it stays quiet down here —
          the `destructive` variant is exactly this compromise. */
        }
        <View style={styles.leaveBlock}>
          {leave.isError && <Text style={styles.error}>{leave.error.message}</Text>}
          <Button
            label={leave.isPending ? 'Leaving…' : 'Leave squad'}
            variant='destructive'
            onPress={confirmLeave}
            disabled={leave.isPending}
            busy={leave.isPending}
          />
        </View>
      </View>
    </Screen>
  );
}

const makeStyles = ({ colors, ramp }: Theme) => StyleSheet.create({
  page: { paddingHorizontal: space.lg },
  standingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.md },
  standing: { ...font.body.body, color: colors.subtle, flexShrink: 1 },
  standingGap: { color: colors.accentDeep },
  alone: { ...font.body.body, color: colors.subtle, marginVertical: space.md },
  date: { ...font.body.label, color: ramp.neutral[600], letterSpacing: 0, marginLeft: 'auto' },
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
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  boostChip: {
    backgroundColor: ramp.accent[200],
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  boostLabel: { ...font.body.label, fontSize: 11.5, letterSpacing: 0, color: ramp.accent[800] },
  codeCard: { alignItems: 'center', backgroundColor: ramp.sage[200] },
  shareRow: {
    minHeight: 44,
    minWidth: 44,
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
  toggle: { marginTop: space.md },
  note: {
    ...font.body.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: space.sm,
    lineHeight: 18,
  },
  centered: { paddingVertical: space.xl, alignItems: 'center' },
  error: { color: colors.damage, ...font.body.body, textAlign: 'center' },
  empty: { color: colors.muted, ...font.body.body, textAlign: 'center' },
  leaveBlock: { marginTop: space.xl, gap: space.sm },
  pressed: { opacity: 0.85 },
});

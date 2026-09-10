import { useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import type { LifetimePoints } from '@/features/character/plumage.ts';
import { LeaderboardRow } from './LeaderboardRow.tsx';
import { LockedSlot } from './LockedSlot.tsx';
import { leaderboardGaps } from './row-gap.ts';
import { SlotUnlockReveal, useSlotUnlockReveal } from './SlotUnlockReveal.tsx';
import { resolveSquadStanding, standingHero, standingSubline } from './standing.ts';
import { SOLO_SKY_OBSERVATION } from './sky-reading.ts';
import { FlockStrip } from './FlockStrip.tsx';
import { flockWalk } from './flock-walk.ts';
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
import { font, radius, space, type Theme } from '@/theme.ts';
import {
  Button,
  Numeral,
  Panel,
  Screen,
  SegmentedControl,
  Text,
  useStyles,
  useTheme,
} from '@/ui/index.ts';

const MODES: ReadonlyArray<{ value: LeaderboardMode; label: string }> = [
  { value: 'current', label: 'Today' },
  { value: 'completed', label: 'Yesterday' },
];

/**
 * 'YYYY-MM-DD' -> 'Aug 4'. Parsed as UTC on purpose: these strings are already
 * the correct local calendar date for the member(s) they describe.
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
 * once: an empty board wants it beside "nobody's here yet", a board with open
 * seats wants it above the seats, and a full squad has no seat to invite
 * anyone into.
 */
function InviteCode({ code, squadName }: { code: string; squadName: string }) {
  const styles = useStyles(makeStyles);
  const { ramp } = useTheme();
  return (
    <Panel variant="plain" style={styles.codeCard}>
      <Text scale="chrome" style={styles.codeLabel}>
        INVITE CODE
      </Text>
      {/* A code is drawn geometry, not prose. It takes the `fixed` scale and
          then shrinks to fit rather than reflowing: `numberOfLines={1}` is
          what makes `adjustsFontSizeToFit` a shrink instead of a wrap, and
          `minimumFontScale` keeps the floor legible. The three are only ever
          correct together, and `invite-code.test.ts` scans this tag. */}
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

      {/* The code stays `selectable` for anyone who wants to long-press it;
          this is the path for everyone else — Messenger and Viber one tap
          away rather than a toast. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Share the invite code for ${squadName}`}
        hitSlop={space.sm}
        onPress={() => void shareInvite({ squadName, inviteCode: code })}
        style={({ pressed }) => [styles.shareRow, pressed && styles.pressedRow]}
      >
        <MaterialCommunityIcons name="share-variant" size={14} color={ramp.sage[700]} />
        <Text style={styles.shareLabel}>Share invite</Text>
      </Pressable>
    </Panel>
  );
}

/**
 * The board (deviation #72 over the 2026-09-06 composition).
 *
 * The violet-into-pink band went. It was the loudest surface in the app and
 * it carried the squad's *identity* as a field of colour, which is the one
 * thing a squad does not need saying — the name says it. What it held is
 * still here, in the order it was: the name and the member count, the
 * program tag, the standing, the flock strip, the day's leader, the mode
 * control, the ranked rows, the invite block, the open seats, and leaving at
 * the foot. Everything sits on the page now, in the page's own inks.
 */
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
  const styles = useStyles(makeStyles);
  const { colors, ramp } = useTheme();
  // The header bleeds under the status bar, so its content takes the inset —
  // `Screen bleed` hands that back rather than guessing.
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<LeaderboardMode>('current');
  const board = useSquadLeaderboard(squad.id, mode);
  const leave = useLeaveSquad(userId);

  // Every version of `squad_leaderboard` reaches `daily_scores` by `left
  // join`, so a member who has not moved appears with `total = 0` rather than
  // being absent; this count is kept for the slot maths and the standing.
  const memberCount = useSquadMemberCount(squad.id);
  const { locked } = resolveSlots({
    memberCount: memberCount.data,
    maxMembers: squad.max_members,
  });
  const reveal = useSlotUnlockReveal(memberCount.data);

  // Subscribed for as long as the board is mounted. Expo Router keeps tab
  // screens mounted, so the channel survives tab switches.
  useSquadRealtime(squad.id);

  const rows = board.data ?? [];
  const boost = boostChipLabel(squad.program);

  // One pass over the board, not a scan per row.
  const gaps = leaderboardGaps(rows);

  // The flock's own reading, out of the payload already fetched for the list.
  // It follows `mode` for the same reason the leader line does: a "today"
  // claim drawn over a yesterday board is a false one.
  const walk = flockWalk({
    members: rows.map((r) => ({ characterName: r.character_name, steps: r.steps })),
    mode,
  });

  // `rows[0]` because the RPC has already ordered them. Guarded on two or
  // more rows: "you are ahead" in a squad of one is the app congratulating
  // somebody for being alone.
  const [leader] = rows;

  // What the standing leads with, and what it says beside it. Both decisions
  // are in `standing.ts` rather than here: the words a squad of one may never
  // read are a rule, and root Vitest cannot load a component file to guard one.
  const standing = resolveSquadStanding({ rows: board.data, memberCount: memberCount.data });
  const heroValue = standingHero(standing);
  const subline = standingSubline(standing);

  // In completed mode every member is ranked on their OWN yesterday, so a
  // squad spanning timezones legitimately compares two calendar dates.
  const dates = [...new Set(rows.map((r) => r.local_date))].sort();
  const mixedDates = mode === 'completed' && dates.length > 1;
  const [onlyDate] = dates;
  const headerDate = dates.length === 1 && onlyDate ? formatLocalDate(onlyDate) : null;

  function confirmLeave() {
    // Say what is lost before it is lost. Leaving is not undoable and the
    // invite code is the only way back.
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
      <View style={[styles.page, { paddingTop: insets.top + space.md }]}>
        {/* The squad's name, and how many are in it. */}
        <View style={styles.header}>
          <Text style={styles.squadName} numberOfLines={1}>
            {squad.name}
          </Text>
          <View
            accessible
            accessibilityLabel={`${memberCount.data ?? 0} members`}
            style={styles.countChip}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              name="account-multiple"
              size={14}
              color={colors.muted}
            />
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              scale="fixed"
              style={styles.countLabel}
            >
              {memberCount.data ?? 0}
            </Text>
          </View>
        </View>

        {/* The program is the board's rule, so it belongs with the board. Two
            tags: sage for the lane the squad is running, orange for the
            multiplier that changes the maths. */}
        <View style={styles.programLine}>
          <Text scale="chrome" style={styles.program}>{programLabel(squad.program)}</Text>
          {boost && (
            <View style={styles.boostChip}>
              <Text scale="chrome" style={styles.boostLabel}>{boost}</Text>
            </View>
          )}
          {headerDate != null && <Text scale="chrome" style={styles.date}>{headerDate}</Text>}
        </View>

        {/* Where you stand. A squad of one reads the Sky's own sentence
            instead — the same string, imported, so the two readings of a day
            alone cannot drift (issue #26). A pending standing renders no
            claim at all. */}
        {standing.kind === 'alone' && (
          <Text style={styles.alone}>{SOLO_SKY_OBSERVATION}</Text>
        )}
        {heroValue != null && (
          <View style={styles.hero}>
            <Numeral value={heroValue} size="hero" color={colors.accentInk} style={styles.heroValue} />
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

        {/* How many of the flock cleared the Daily Walk, one mark per member,
            and who is ahead — the two facts about the whole flock, above the
            rows that rank it. Ordered by the board, not by the race: the
            leader named here is the leader of the rows underneath (#11). */}
        {(walk || (rows.length > 1 && leader)) && (
          <View style={styles.flock}>
            {walk && <FlockStrip marks={walk.marks} label={walk.label} />}
            {rows.length > 1 && leader && (
              <DayLeader
                name={leader.character_name}
                isSelf={leader.is_self}
                mode={mode}
                lifetimePoints={leader.ratings}
              />
            )}
          </View>
        )}

        <View style={styles.toggle}>
          <SegmentedControl
            options={MODES}
            value={mode}
            onChange={setMode}
            accessibilityLabel="Which day the board ranks"
          />
        </View>

        {mixedDates && (
          <Text style={styles.note}>
            Members are on different dates ({dates.join(' and ')}) — each is ranked on
            their own completed day.
          </Text>
        )}

        {board.isPending && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accentDeep} />
          </View>
        )}

        {/* A failed fetch must never render as "nobody here". */}
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

        {/* `ranked` is the standing's rule applied to the rows: a board of one
            draws and speaks no position. */}
        <View style={styles.rows}>
          {rows.map((row) => (
            <LeaderboardRow
              key={row.user_id}
              row={row}
              mode={mode}
              gap={gaps.get(row.user_id) ?? null}
              ranked={rows.length > 1}
            />
          ))}
        </View>

        {reveal.visible && <SlotUnlockReveal progress={reveal.progress} />}

        {/* §7: locked slots are visible every day. Gated on `rows.length > 0`:
            an empty board already showed the code above. */}
        {rows.length > 0 && locked > 0 && (
          <InviteCode code={squad.invite_code} squadName={squad.name} />
        )}

        {/* One row for every free seat, not one row each. */}
        {locked > 0 && (
          <LockedSlot
            remaining={locked}
            onPress={() =>
              void shareInvite({
                squadName: squad.name,
                inviteCode: squad.invite_code,
              })
            }
          />
        )}

        {/* At the foot, outlined rather than filled: rare, irreversible, and
            not next to the invite code someone taps every day. */}
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
      </View>
    </Screen>
  );
}

/**
 * Who is ahead, as one line.
 *
 * One accessibility element: a bird, a crown and a sentence are three stops
 * for a single claim. The wording follows the mode, because "is ahead" is a
 * live claim and "won the day" is a settled one.
 */
function DayLeader({
  name,
  isSelf,
  mode,
  lifetimePoints,
}: {
  name: string;
  isSelf: boolean;
  mode: LeaderboardMode;
  /** The leader's own `ratings`, so their bird here matches their row (issue #33). */
  lifetimePoints: LifetimePoints;
}) {
  const styles = useStyles(makeStyles);
  const { earnedColor } = useTheme();
  const line =
    mode === 'current'
      ? isSelf
        ? 'You are ahead today'
        : `${name} is ahead today`
      : isSelf
        ? 'You won the day'
        : `${name} won the day`;

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View accessible accessibilityLabel={line} style={styles.leader}>
      <View {...hidden} style={styles.leaderBird}>
        <KairoThumbnail pose="race_victory" size={24} decorative lifetimePoints={lifetimePoints} />
      </View>
      <MaterialCommunityIcons {...hidden} name="crown" size={14} color={earnedColor} />
      <Text {...hidden} scale="chrome" numberOfLines={1} style={styles.leaderLabel}>
        {line}
      </Text>
    </View>
  );
}

const makeStyles = ({ colors, ramp, shadow }: Theme) =>
  StyleSheet.create({
    /** The page pads itself: `Screen bleed` hands the insets back. */
    page: { paddingHorizontal: space.lg },
    header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    squadName: { color: colors.text, ...font.display.major, fontSize: 26, flexShrink: 1 },
    countChip: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 6,
      paddingHorizontal: 11,
      borderRadius: radius.pill,
      backgroundColor: ramp.neutral[200],
    },
    countLabel: { ...font.display.label, color: colors.subtle },
    programLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      marginTop: space.sm + 2,
    },
    program: {
      ...font.body.label,
      fontSize: 11,
      letterSpacing: 0.3,
      color: ramp.sage[800],
      backgroundColor: ramp.sage[200],
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
    boostChip: {
      backgroundColor: ramp.accent[200],
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    boostLabel: { ...font.body.label, fontSize: 11, letterSpacing: 0.3, color: ramp.accent[800] },
    date: { ...font.body.label, color: colors.muted, letterSpacing: 0, marginLeft: 'auto' },

    hero: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.md },
    heroValue: { fontSize: 44, lineHeight: 48 },
    // A fat display face carries a deep descender box, so a flex-end row
    // would hang the subline below the ordinal's visual baseline without this.
    standing: { color: colors.subtle, ...font.body.body, paddingBottom: 6, flexShrink: 1 },
    standingGap: { ...font.body.body, fontFamily: font.body.title.fontFamily, color: colors.accentDeep },
    /* The sentence a squad of one reads where the ordinal would be. No
       `numberOfLines`: this is a sentence rather than a figure. */
    alone: { ...font.body.body, color: colors.subtle, marginTop: space.md, lineHeight: 20 },

    flock: { marginTop: space.md, gap: space.sm },
    leader: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 4,
      paddingRight: 12,
      paddingLeft: 4,
      borderRadius: radius.pill,
      backgroundColor: ramp.gold[200],
      maxWidth: '100%',
    },
    leaderBird: {
      width: 26,
      height: 26,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: colors.surface,
    },
    leaderLabel: { ...font.body.strong, color: ramp.gold[800], flexShrink: 1 },

    toggle: { marginTop: space.md },
    note: { ...font.body.body, fontSize: 12, color: colors.muted, marginTop: space.sm, lineHeight: 18 },
    centered: { paddingVertical: space.xl, alignItems: 'center' },
    error: { color: colors.damage, ...font.body.body, textAlign: 'center' },
    empty: { color: colors.muted, ...font.body.body, textAlign: 'center' },
    rows: { marginTop: space.xs },

    codeCard: { alignItems: 'center', backgroundColor: ramp.sage[200], ...shadow.sm },
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
      fontSize: 36,
      letterSpacing: 9,
      color: ramp.sage[900],
      // Trailing letter-spacing is added after the last glyph too, which
      // visually shifts the code left of centre without this.
      marginLeft: 9,
      marginTop: space.xs,
    },
    leaveBlock: { marginTop: space.xl, gap: space.sm },
  });

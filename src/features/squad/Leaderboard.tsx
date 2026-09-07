import { useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
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
import { useRouter } from 'expo-router';
import { colors, font, ramp, radius, space } from '@/theme.ts';
import { Button, Gradient, Numeral, Panel, Screen, Text } from '@/ui/index.ts';
import type { Stop } from '@/ui/gradient.ts';

/**
 * The squad's band: violet into pink.
 *
 * `sage` into `coral` — the squad's warmth and the streak's heat. Deliberately
 * **not** the accent: orange means "you" everywhere else in the app, and a
 * whole field of it at the top of the one tab explicitly about other people
 * would be the palette saying the wrong thing loudest.
 */
const BAND: Stop[] = [
  { color: ramp.sage[600], at: 0 },
  // `damage`, not `coral`. The band carries cream type over its whole height —
  // the squad's name at the top, the standing at the foot — and cream on
  // `colors.coral` is 2.93:1. One step deeper is still unmistakably the same
  // pink and reads at 6.47:1.
  { color: colors.damage, at: 1 },
];

const MODES: ReadonlyArray<{ mode: LeaderboardMode; label: string }> = [
  { mode: 'current', label: 'Today' },
  { mode: 'completed', label: 'Yesterday' },
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
  return (
    <Panel variant="plain" style={styles.codeCard}>
      <Text style={styles.codeLabel}>INVITE CODE</Text>
      {/* A code is drawn geometry, not prose. At the largest accessibility
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
          code nobody can read is not better than a wrapped one. */}
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
        <MaterialCommunityIcons name="share-variant" size={14} color={ramp.sage[700]} />
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
  // The band bleeds under the status bar, so its content takes the inset —
  // `Screen bleed` hands that back rather than guessing.
  const insets = useSafeAreaInsets();
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
      {/* The squad's own band: name, week, standing, on one field.

          Violet into pink, which is `sage` into `coral` — the squad's warmth
          and the streak's heat, and deliberately **not** the accent. Orange
          means "you" everywhere else in the app, and a whole screen of it at
          the top of the one tab that is explicitly about other people would be
          the palette saying the wrong thing loudest. The band bleeds to every
          edge and under the status bar, so its content takes the inset. */}
      <View style={styles.band}>
        <Gradient stops={BAND} steps={24} />

        <View style={[styles.bandBody, { paddingTop: insets.top + space.sm }]}>
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
                size={15}
                color={colors.bg}
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

          {/* How many of the flock cleared the Daily Walk, one mark per
              member, on the band rather than under a `Label`. No eyebrow: the
              strip sits directly under the squad's name on a field of its own,
              and the initials over the marks say what it is. It is still
              spoken — `flockWalk` composes the count once, for the whole
              strip. */}
          {walk && <FlockStrip marks={walk.marks} label={walk.label} />}

          {/* Who is ahead, on the band rather than only in the rows below.

              The Sky tab's flock rail already crowns the leader, and this is
              the same fact on the tab that ranks them — a board you have to
              read down to find the top of is a board that buried its own
              headline. It costs no request: `rows` is the payload already
              fetched for the list, and `rows[0]` is its first row.

              **Ordered by the board, not by the race.** `squad_leaderboard()`
              sorts by the program-weighted total, which is the only way a
              squad's program applies at read time (deviation #11) — so the
              leader named here is the leader of the rows underneath it. The
              Sky corridor re-ranks the same payload by capped steps and can
              legitimately name somebody else; they are two different races and
              each screen names its own.

              It follows `mode`, so the claim always matches the day the board
              is showing. */}
          {rows.length > 1 && leader && (
            <DayLeader name={leader.character_name} isSelf={leader.is_self} mode={mode} />
          )}

          {/* A squad of one gets the Sky's own sentence instead of a standing.
              The tab next door already tells this player the ridge is the
              opponent; this band used to answer "1st · of 1 · leading" — the
              app refusing to flatter them on one screen and doing exactly that
              on the next. The same string, read from the same place, so the
              two readings of a day alone cannot drift. The invite block below
              is the half that offers to change it. */}
          {standing.kind === 'alone' && (
            <Text style={styles.alone}>{SOLO_SKY_OBSERVATION}</Text>
          )}

          {/* A pending standing query must never render a claim: nothing beats
              a placeholder or a dash, both of which would state something
              false. */}
          {heroValue != null && (
            // One baseline, not two lines: "2nd" and what it costs you are a
            // single claim, and stacking them made the subline read as a
            // caption for the ordinal rather than as the other half of it.
            <View style={styles.hero}>
              <Numeral
                value={heroValue}
                size="hero"
                color={colors.bg}
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
        </View>
      </View>

      <View style={styles.page}>
      {/* The program is the board's rule, so it belongs with the board rather
          than in a settings screen nobody opens. Below the band and not on it:
          the band is the squad's identity and this is the squad's *setting*,
          and the two read as one claim when stacked. */}
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
          <ActivityIndicator color={colors.accentDeep} />
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

      {/* `ranked` is the band's rule applied to the rows: a board of one draws
          and speaks "1" for a position nobody is being held against, which is
          the same sentence the standing above it stopped saying. */}
      {rows.map((row) => (
        <LeaderboardRow
          key={row.user_id}
          row={row}
          mode={mode}
          gap={gaps.get(row.user_id) ?? null}
          ranked={rows.length > 1}
        />
      ))}

      {reveal.visible && <SlotUnlockReveal progress={reveal.progress} />}

      {/* §7: locked slots are visible every day, not only when solo — the
          constant pull to invite the rest of the squad. Gated on
          `rows.length > 0`: an empty board already showed the code above, and
          showing it twice was the earlier bug here. */}
      {rows.length > 0 && locked > 0 && <InviteCode code={squad.invite_code} squadName={squad.name} />}

      {/* One row for every free seat, not one row each — `SkyFlockRail`'s
          trailing-slot rule, which this board needed for the same reason and
          did not have. A squad of one drew five identical dashed rows here. */}
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

      {/* Deliberately at the foot of the scroll, not in a header: this is rare,
          irreversible, and must not sit next to the invite code someone taps
          every day. Outlined rather than filled so it stays quiet down here —
          the `destructive` variant is exactly this compromise. */}
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
    </Screen>  );
}

/**
 * Who is ahead, as one line on the band.
 *
 * One accessibility element: a bird, a crown and a sentence are three stops for
 * a single claim. The bird is decorative — the sentence names the person.
 *
 * The wording follows the mode rather than being written once, because "is
 * ahead" is a live claim and "won the day" is a settled one, and saying the
 * live form about a finished day is the same class of error as the streak
 * number the completed board deliberately hides.
 */
function DayLeader({
  name,
  isSelf,
  mode,
}: {
  name: string;
  isSelf: boolean;
  mode: LeaderboardMode;
}) {
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
        <KairoThumbnail pose="race_victory" size={26} decorative />
      </View>
      <MaterialCommunityIcons {...hidden} name="crown" size={15} color={ramp.gold[300]} />
      <Text {...hidden} scale="chrome" numberOfLines={1} style={styles.leaderLabel}>
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * A translucent pill on the band, sized to its content — `alignSelf:
   * 'flex-start'` so it hugs the sentence instead of ruling across the whole
   * width, which would read as a section divider rather than as a remark.
   */
  leader: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 5,
    paddingRight: 14,
    paddingLeft: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.34)',
    // So a long name truncates rather than pushing the pill off the band.
    maxWidth: '100%',
  },
  leaderBird: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  leaderLabel: { ...font.body.body, color: colors.bg, flexShrink: 1 },
  /**
   * The band has no fixed height: it is as tall as the name, the flock strip
   * and the standing make it. A fixed one is what would clip the strip at large
   * Dynamic Type, and the rounded foot is what makes the page below open out of
   * it rather than start under a rectangle.
   */
  band: {
    borderBottomLeftRadius: 44,
    borderBottomRightRadius: 44,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  bandBody: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  /** Everything below the band, which is where the page's own padding lives. */
  page: { paddingHorizontal: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  squadName: { color: colors.bg, ...font.display.major, fontSize: 26, flexShrink: 1 },
  countChip: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  countLabel: { ...font.display.label, color: colors.bg },
  date: { ...font.body.label, color: ramp.neutral[600], letterSpacing: 0, marginLeft: 'auto' },
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  heroValue: { fontSize: 58 },
  // A fat display face at 58 carries a deep descender box, so a flex-end row
  // would hang the subline below the ordinal's visual baseline without this.
  standing: {
    color: 'rgba(255,255,255,0.82)',
    ...font.body.body,
    paddingBottom: 8,
    flexShrink: 1,
  },
  /* The sentence a squad of one reads where the ordinal would be. The same
     near-white the standing beside it uses on this band — and deliberately
     without the `numberOfLines` that standing carries: this is a sentence
     rather than a figure, so clipping it would leave half a claim on screen. */
  alone: {
    ...font.body.body,
    color: 'rgba(255,255,255,0.9)',
    marginTop: space.sm,
  },
  // Family off the token rather than a string literal: weights are chosen by
  // face here, never by `fontWeight`. Gold for the gap, because on this band
  // it is the one figure that has to lift off a saturated ground — and gold on
  // violet is the only pairing in the palette that does at this size.
  standingGap: {
    ...font.body.body,
    fontFamily: font.body.title.fontFamily,
    color: ramp.gold[300],
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
  // Ink on the orange, not cream: `colors.accent` is a fill and cream on it is
  // 2.65:1. The token's own doc comment says so, and this is the site that
  // most looked fine while being wrong.
  toggleLabelActive: { color: colors.text },
  note: { ...font.body.body, fontSize: 12, color: colors.muted, marginTop: space.sm, lineHeight: 18 },
  centered: { paddingVertical: space.xl, alignItems: 'center' },
  error: { color: colors.damage, ...font.body.body, textAlign: 'center' },
  empty: { color: colors.muted, ...font.body.body, textAlign: 'center' },
  leaveBlock: { marginTop: space.xl, gap: space.sm },
  pressed: { opacity: 0.85 },
});

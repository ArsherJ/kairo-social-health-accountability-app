import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { resolveSlots } from './slots.ts';
import { useSquadRealtime } from './useSquadRealtime.ts';
import { colors, font, radius, space } from '@/theme.ts';
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

export function Leaderboard({ squad }: { squad: Squad }) {
  // The live board is the default: §2's hooks assume a board you check during
  // the day ("1 hour left, you're in Nth place"). Completed-day is secondary.
  const [mode, setMode] = useState<LeaderboardMode>('current');
  const board = useSquadLeaderboard(squad.id, mode);

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

      {/* A pending standing query must never render a claim: nothing beats a
          placeholder or a dash, both of which would state something false. */}
      {heroValue != null && (
        <View style={styles.hero}>
          <Numeral value={heroValue} size="hero" color={colors.accent} />
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
        <LeaderboardRow key={row.user_id} row={row} mode={mode} />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  squadName: { color: colors.text, ...font.body.title, flexShrink: 1 },
  date: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  hero: { marginTop: space.lg },
  standing: { color: colors.subtle, ...font.body.body, marginTop: space.xs },
  codeCard: { alignItems: 'center' },
  codeLabel: { color: colors.muted, ...font.body.label },
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
    // ≥44pt touch target: the pill's own vertical padding plus its text line
    // height, with no reliance on hitSlop.
    paddingVertical: space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  toggleActive: { backgroundColor: colors.accent },
  toggleLabel: { color: colors.subtle, fontSize: 14, fontWeight: '700' },
  toggleLabelActive: { color: colors.bg },
  note: { color: colors.muted, fontSize: 12, marginTop: space.sm, lineHeight: 18 },
  centered: { paddingVertical: space.xl, alignItems: 'center' },
  error: { color: colors.danger, ...font.body.body, textAlign: 'center' },
  empty: { color: colors.muted, ...font.body.body, textAlign: 'center' },
});

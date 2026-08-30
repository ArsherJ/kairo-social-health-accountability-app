import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Racer } from '@kairo/core';
import { KairoThumbnail } from '@/features/character/KairoThumbnail.tsx';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { Glass, Text } from '@/ui/index.ts';

/**
 * Who is in the sky today, pinned over the flight.
 *
 * This replaces the Sky tab's header. The header said "Today's sky" and a
 * standing — a title over a picture that was already unmistakably a sky, and a
 * standing the card at the foot repeats. The rail says the one thing the
 * picture cannot at a glance once you have scrolled away from your own bird:
 * **who is up here**, including the people who are not.
 *
 * Three kinds of seat, and the difference between them is the whole point:
 *
 *   - a **flying** member, with their bird and a ring in their standing's
 *     colour — gold for the leader, accent for you, quiet for everyone else;
 *   - a **withheld** member, dimmed under a struck-through eye. They are in the
 *     squad and their totals are not shared (deviation #47's reciprocal gate),
 *     and showing them greyed rather than omitting them is the same call the
 *     screen below already makes: dropping a row looks like the member left;
 *   - the **trailing slot**, which is the invite.
 *
 * **One row, and exactly one trailing slot.** The rail used to draw a seat for
 * every unfilled place in the squad — five dashed circles for a squad of one,
 * which wrapped onto a second row and read as five separate things to do rather
 * than as one invitation. The roster now takes the first four slots and the
 * fifth is either the invite or an overflow count: never both, never none, so
 * the end of the row always means exactly one thing.
 *
 * The numbers are a real width budget rather than a guess. On the narrowest
 * supported screen (320pt) the rail sits at `space.md` either side and carries
 * 14pt of its own padding, leaving **260pt**; five 46pt seats and four 6pt gaps
 * come to 254. `flexWrap` is deliberately absent — this has to fail by
 * clipping, which is visible, rather than by wrapping, which is what it did
 * before and what looked like a design.
 *
 * The trailing slot is the only thing here that is pressable, and it goes to
 * the Flock tab rather than opening an invite sheet of its own — the code and
 * the share button already live there, and a second way to invite is a second
 * thing to keep in step.
 */

/** Slots in the row, including the trailing one. See the width budget above. */
const MAX_SLOTS = 5;

/** Members drawn before the trailing slot takes over. */
const ROSTER_SLOTS = MAX_SLOTS - 1;

/** Seat diameter. Part of the width budget; do not raise without redoing it. */
const SEAT = 46;

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

type WithheldMember = { user_id: string; character_name: string };

export function SkyFlockRail({
  racers,
  withheld,
}: {
  racers: readonly Racer[];
  /** Squadmates whose totals are not shared, so they have no position. */
  withheld: readonly WithheldMember[];
}) {
  const router = useRouter();

  /*
    Four members, then one trailing slot.

    Withheld members come last because a bird with a position is more use to the
    reader than one without — if the row has to drop somebody, it should drop
    the lane that is empty anyway. Within each group the order is the caller's,
    which for racers is rank, so the leader is never the one dropped.
  */
  const roster: ({ kind: 'racer'; racer: Racer } | { kind: 'withheld'; member: WithheldMember })[] =
    [
      ...racers.map((racer) => ({ kind: 'racer' as const, racer })),
      ...withheld.map((member) => ({ kind: 'withheld' as const, member })),
    ];
  const shown = roster.slice(0, ROSTER_SLOTS);
  const overflow = roster.length - shown.length;

  return (
    <Glass tone="light" style={styles.rail}>
      <View style={styles.title}>
        <MaterialCommunityIcons
          {...HIDDEN}
          name="account-multiple"
          size={14}
          color={colors.accent}
        />
        <Text {...HIDDEN} scale="chrome" style={styles.titleText}>
          YOUR FLOCK TODAY
        </Text>
      </View>

      <View style={styles.seats}>
        {shown.map((slot) =>
          slot.kind === 'racer' ? (
            <RacerSeat key={slot.racer.userId} racer={slot.racer} />
          ) : (
            <WithheldSeat key={slot.member.user_id} member={slot.member} />
          ),
        )}

        {overflow > 0 ? (
          <View
            accessible
            accessibilityLabel={`${overflow} more in your flock`}
            style={[styles.seat, styles.seatOverflow]}
          >
            <Text {...HIDDEN} scale="fixed" style={styles.overflowLabel}>
              +{overflow}
            </Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Invite someone to your flock"
            onPress={() => router.push('/flock')}
            style={({ pressed }) => [styles.seat, styles.seatEmpty, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons {...HIDDEN} name="plus" size={22} color={colors.muted} />
          </Pressable>
        )}
      </View>
    </Glass>
  );
}

/**
 * One flying member.
 *
 * Rank and name only. How far along they are is what the picture underneath is
 * for, and repeating it here would make the rail a second leaderboard.
 */
function RacerSeat({ racer }: { racer: Racer }) {
  return (
    <View
      accessible
      accessibilityLabel={
        racer.isSelf
          ? `You, position ${racer.rank}`
          : `${racer.characterName}, position ${racer.rank}`
      }
      style={[
        styles.seat,
        racer.rank === 1 && styles.seatLeader,
        racer.isSelf && styles.seatSelf,
        racer.isGhost === true && styles.seatGhost,
      ]}
    >
      <View {...HIDDEN}>
        <KairoThumbnail pose="run" size={SEAT - 8} decorative />
      </View>
      {racer.rank === 1 && (
        <View {...HIDDEN} style={[styles.badge, styles.badgeLeader]}>
          <MaterialCommunityIcons name="crown" size={11} color={ramp.gold[900]} />
        </View>
      )}
    </View>
  );
}

/** A squadmate whose totals are not shared, so they have no position to draw. */
function WithheldSeat({ member }: { member: WithheldMember }) {
  return (
    <View
      accessible
      accessibilityLabel={`${member.character_name} is not sharing their totals`}
      style={[styles.seat, styles.seatWithheld]}
    >
      <View {...HIDDEN} style={styles.dimmed}>
        <KairoThumbnail pose="walk" size={SEAT - 8} decorative />
      </View>
      <View {...HIDDEN} style={[styles.badge, styles.badgeWithheld]}>
        <MaterialCommunityIcons name="eye-off" size={10} color={colors.muted} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14, borderRadius: radius.xl },
  title: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  titleText: { ...font.body.label, color: colors.accentDeep },
  /**
   * One row. **No `flexWrap`** — see the width budget on the module comment.
   * `center` rather than `space-between` so a squad of two sits together
   * instead of being flung to both edges with a gulf between them.
   */
  seats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  seat: {
    width: SEAT,
    height: SEAT,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.border,
    backgroundColor: ramp.sky[100],
  },
  // A ring in the seat's standing, which is the one thing the rail says beyond
  // "present". Gold is earned, accent is you — the palette's standing rule, and
  // the reason the leader's ring is not simply a brighter accent.
  seatLeader: { borderColor: ramp.gold[400], backgroundColor: ramp.accent[300] },
  seatSelf: { borderColor: colors.accent, backgroundColor: colors.coralTint },
  seatGhost: { opacity: 0.6 },
  seatWithheld: { backgroundColor: ramp.neutral[200] },
  seatEmpty: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  seatOverflow: { backgroundColor: ramp.neutral[200], borderColor: 'transparent' },
  overflowLabel: { ...font.display.label, fontSize: 13, color: colors.subtle },
  pressed: { opacity: 0.6 },
  dimmed: { opacity: 0.4 },
  badge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeLeader: { backgroundColor: ramp.gold[400] },
  badgeWithheld: { backgroundColor: colors.surface, borderColor: ramp.neutral[200] },
});

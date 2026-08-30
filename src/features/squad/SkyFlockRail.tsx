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
 *   - an **empty** seat, dashed, which is the invite affordance.
 *
 * The empty seat is the only thing here that is pressable, and it goes to the
 * Flock tab rather than opening an invite sheet of its own — the code and the
 * share button already live there, and a second way to invite is a second thing
 * to keep in step.
 */

/** Seats drawn, including the empty one. A squad is capped well below this. */
const SEATS = 6;

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

export function SkyFlockRail({
  racers,
  withheld,
}: {
  racers: readonly Racer[];
  /** Squadmates whose totals are not shared, so they have no position. */
  withheld: readonly { user_id: string; character_name: string }[];
}) {
  const router = useRouter();

  const filled = racers.length + withheld.length;
  const empties = Math.max(0, SEATS - filled);

  return (
    <Glass tone="light" style={styles.rail}>
      <View style={styles.title}>
        <MaterialCommunityIcons {...HIDDEN} name="account-multiple" size={14} color={colors.accent} />
        <Text {...HIDDEN} scale="chrome" style={styles.titleText}>
          YOUR FLOCK TODAY
        </Text>
      </View>

      <View style={styles.seats}>
        {racers.map((racer) => (
          <View
            key={racer.userId}
            accessible
            // Rank and name only. How far along they are is what the picture
            // underneath is for, and repeating it here would make the rail a
            // second leaderboard.
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
              <KairoThumbnail pose="run" size={44} decorative />
            </View>
            {racer.rank === 1 && (
              <View {...HIDDEN} style={[styles.badge, styles.badgeLeader]}>
                <MaterialCommunityIcons name="crown" size={11} color={ramp.gold[900]} />
              </View>
            )}
          </View>
        ))}

        {withheld.map((member) => (
          <View
            key={member.user_id}
            accessible
            accessibilityLabel={`${member.character_name} is not sharing their totals`}
            style={[styles.seat, styles.seatWithheld]}
          >
            <View {...HIDDEN} style={styles.dimmed}>
              <KairoThumbnail pose="walk" size={44} decorative />
            </View>
            <View {...HIDDEN} style={[styles.badge, styles.badgeWithheld]}>
              <MaterialCommunityIcons name="eye-off" size={10} color={colors.muted} />
            </View>
          </View>
        ))}

        {Array.from({ length: empties }, (_, i) => (
          <Pressable
            key={`empty-${i}`}
            accessibilityRole="button"
            // One of the empty seats carries the invite; the rest are decoration
            // that would otherwise read as five identical buttons.
            accessibilityLabel={i === 0 ? 'Invite someone to your flock' : undefined}
            accessibilityElementsHidden={i !== 0}
            importantForAccessibility={i === 0 ? 'yes' : 'no-hide-descendants'}
            onPress={() => router.push('/flock')}
            style={({ pressed }) => [styles.seat, styles.seatEmpty, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="plus" size={22} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  rail: { paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14, borderRadius: radius.xl },
  title: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  titleText: { ...font.body.label, color: colors.accentDeep },
  /**
   * `space-between` with wrapping, so a full squad plus an empty seat still fits
   * a 320pt screen — six 52pt seats need 312pt of the 320 less the rail's own
   * padding, which does not fit, and wrapping to a second row is the honest
   * answer rather than shrinking the seats until the birds are unreadable.
   */
  seats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: 10,
  },
  seat: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.border,
    backgroundColor: ramp.sky[100],
  },
  // A ring in the seat's standing, which is the one thing the rail says beyond
  // "present". Gold is earned, accent is you — the palette's standing rule,
  // and the reason the leader's ring is not simply a brighter accent.
  seatLeader: { borderColor: ramp.gold[400], backgroundColor: ramp.accent[300] },
  seatSelf: { borderColor: colors.accent, backgroundColor: colors.coralTint },
  seatGhost: { opacity: 0.6 },
  seatWithheld: { backgroundColor: ramp.neutral[200] },
  seatEmpty: { borderStyle: 'dashed', backgroundColor: 'transparent' },
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

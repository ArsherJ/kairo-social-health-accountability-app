import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { font, ramp, radius, space } from '@/theme.ts';
import { Panel, Text } from '@/ui/index.ts';

/**
 * The free seats in the squad (§7): "locked slots are visible every day —
 * constant pull to invite your squad."
 *
 * Deliberately the same height, padding and rhythm as `LeaderboardRow` so the
 * board reads as one list with a gap at the end of it, not as a list followed
 * by a banner. Dashed sage over nothing rather than a filled plate, and with no
 * tier pills — a seat with pills would read as a person having a bad day rather
 * than as nobody. The `+` disc is the only affordance-shaped thing on the row,
 * because inviting is the only thing it is asking for.
 *
 * The border is the one place the warm system's "a card is a tint, not an
 * outline" rule is deliberately broken: an absence has no tint to be.
 *
 * **One row, however many seats are free.** The board used to draw a numbered
 * seat per unfilled place — five identical dashed rows under a squad of one,
 * filling most of the screen and reading as five separate things to do rather
 * than as one invitation. This is `SkyFlockRail`'s trailing-slot rule in the
 * second place it was needed: the row says how many places are open and asks
 * once. It carries no rank for the same reason — a single row standing for
 * seats 2 through 6 cannot honestly wear one number.
 */
export function LockedSlot({
  remaining,
  onPress,
}: {
  /** How many places are open. One row speaks for all of them. */
  remaining: number;
  /**
   * Opens the share sheet. Optional because the solo board renders this
   * before a squad — and therefore an invite code — exists at all; there the
   * seat is a picture of what a squad looks like, not an action.
   */
  onPress?: () => void;
}) {
  // "1 seat open" rather than "Empty seat": with the count on the row it is the
  // same sentence in both cases, and a form that changes shape at one is a form
  // somebody has to read twice.
  const headline = `${remaining} ${remaining === 1 ? 'seat' : 'seats'} open`;

  // A row that says "Invite your squad" and cannot be tapped is the QA pass's
  // finding in miniature: the affordance was already drawn, down to the `+`
  // disc, and did nothing. Where there is a code to share, the whole row is now
  // the button.
  const Body = (
    <View style={styles.content}>
      <View style={styles.disc}>
        <MaterialCommunityIcons name="plus" size={20} color={ramp.neutral[600]} />
      </View>

      <View style={styles.middle}>
        <Text style={styles.name}>{headline}</Text>
        <Text style={styles.meta}>
          {onPress ? 'Tap to invite' : 'Invite your squad'}
        </Text>
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <Panel variant="plain" style={styles.row}>
        {/* Panel does not forward extra props to its View, so the label lives
            on this inner wrapper instead. */}
        <View accessibilityLabel={`${headline} in your squad`}>{Body}</View>
      </Panel>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Invite someone. ${headline} in your squad.`}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Panel variant="plain" style={styles.row}>
        {Body}
      </Panel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    backgroundColor: 'transparent',
    borderWidth: 2,
    // iOS draws dashed borders only on square corners — with `Panel`'s radius
    // it falls back to solid, which still reads as a seat rather than a
    // person. Declared anyway: it is what the design asks for, it is correct
    // on Android, and leaving it out would make the fallback look deliberate.
    borderStyle: 'dashed',
    borderColor: ramp.sage[300],
  },
  pressed: { opacity: 0.6 },
  content: { flexDirection: 'row', alignItems: 'center' },
  disc: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: ramp.neutral[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1, paddingHorizontal: space.md },
  name: { color: ramp.neutral[600], ...font.display.small, fontSize: 16 },
  meta: { color: ramp.neutral[600], ...font.body.strong, fontSize: 11.5, marginTop: 2 },
});

import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, Text, View } from 'react-native';
import { font, ramp, radius, space } from '@/theme.ts';
import { Panel } from '@/ui/index.ts';

/**
 * An empty seat in the squad (§7): "locked slots are visible every day —
 * constant pull to invite barkada."
 *
 * Deliberately the same height, padding and rhythm as `LeaderboardRow` so the
 * board reads as one list with gaps in it, not as a list followed by a banner.
 * Dashed sage over nothing rather than a filled plate, and with no tier pills —
 * a seat with pills would read as a person having a bad day rather than as
 * nobody. The `+` disc is the only affordance-shaped thing on the row, because
 * inviting is the only thing it is asking for.
 *
 * The border is the one place the warm system's "a card is a tint, not an
 * outline" rule is deliberately broken: an absence has no tint to be.
 */
export function LockedSlot({ rank }: { rank: number }) {
  return (
    <Panel variant="plain" style={styles.row}>
      {/* Panel does not forward extra props to its View, so the label lives
          on this inner wrapper instead. */}
      <View style={styles.content} accessibilityLabel={`Empty squad seat ${rank}`}>
        <Text style={styles.rank}>{rank}</Text>

        <View style={styles.disc}>
          <Feather name="plus" size={20} color={ramp.neutral[600]} />
        </View>

        <View style={styles.middle}>
          <Text style={styles.name}>Empty seat</Text>
          <Text style={styles.meta}>Invite your barkada</Text>
        </View>
      </View>
    </Panel>
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
  content: { flexDirection: 'row', alignItems: 'center' },
  rank: { width: 18, color: ramp.neutral[500], ...font.display.minor },
  disc: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: ramp.neutral[200],
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space.sm,
  },
  middle: { flex: 1, paddingHorizontal: space.md },
  name: { color: ramp.neutral[600], ...font.display.small, fontSize: 16 },
  meta: { color: ramp.neutral[600], ...font.body.strong, fontSize: 11.5, marginTop: 2 },
});

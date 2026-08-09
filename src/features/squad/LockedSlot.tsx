import { StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from '@/theme.ts';
import { Panel } from '@/ui/index.ts';

/**
 * An empty seat in the squad (§7): "locked slots are visible every day —
 * constant pull to invite barkada."
 *
 * Deliberately the same height, padding and rhythm as `LeaderboardRow` so the
 * board reads as one list with gaps in it, not as a list followed by a banner.
 * Dashed and muted rather than filled, and with no tier pills — a slot with
 * pills would read as a person with a bad day rather than as nobody.
 */
export function LockedSlot({ rank }: { rank: number }) {
  return (
    <Panel variant="plain" style={styles.row}>
      {/* Panel does not forward extra props to its View, so the label lives
          on this inner wrapper instead. */}
      <View style={styles.content} accessibilityLabel={`Empty squad slot ${rank}`}>
        <Text style={styles.rank}>{rank}</Text>

        <View style={styles.middle}>
          <Text style={styles.name}>Empty slot</Text>
          <Text style={styles.meta}>Invite your barkada</Text>
        </View>

        <Text style={styles.total}>—</Text>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: {
    // Matches LeaderboardRow's marginTop and horizontal padding, with extra
    // vertical padding standing in for the tier-pill line a filled row has
    // and an empty slot does not — so filled and empty rows land on the same
    // rhythm rather than an empty slot looking shorter than a real one.
    marginTop: space.sm,
    paddingVertical: space.md + space.sm,
    paddingHorizontal: space.md,
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  content: { flexDirection: 'row', alignItems: 'center' },
  rank: { width: 18, color: colors.muted, ...font.display.minor },
  middle: { flex: 1, paddingHorizontal: space.sm },
  name: { color: colors.muted, ...font.display.small, fontSize: 16 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  total: { color: colors.muted, ...font.display.minor },
});

import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '@/theme.ts';

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
    <View style={styles.row} accessibilityLabel={`Empty squad slot ${rank}`}>
      <Text style={styles.rank}>{rank}</Text>

      <View style={styles.middle}>
        <Text style={styles.name}>Empty slot</Text>
        <Text style={styles.meta}>Invite your barkada</Text>
      </View>

      <Text style={styles.total}>—</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // Matches LeaderboardRow's vertical padding plus the height its third line
    // of tier pills adds, so filled and empty slots sit on the same rhythm.
    paddingVertical: space.md + space.sm,
    paddingHorizontal: space.md,
    marginTop: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  rank: { width: 28, color: colors.muted, fontSize: 18, fontWeight: '800' },
  middle: { flex: 1, paddingHorizontal: space.sm },
  name: { color: colors.muted, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  total: { color: colors.muted, fontSize: 20, fontWeight: '800' },
});

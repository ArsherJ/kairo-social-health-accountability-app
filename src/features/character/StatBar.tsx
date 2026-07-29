import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme.ts';

/** Highest points a single stat can contribute in a day, before the featured
 *  multiplier — the Gold tier ceiling from §6. Used only to size the bar. */
const STAT_MAX = 900;

export function StatBar({
  stat,
  label,
  points,
  featured,
}: {
  stat: string;
  label: string;
  points: number;
  featured: boolean;
}) {
  const fill = Math.max(0, Math.min(1, points / STAT_MAX));

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.stat}>
          {stat}
          {featured && <Text style={styles.featured}> ×1.5</Text>}
        </Text>
        <Text style={styles.points}>{points.toLocaleString()}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${fill * 100}%` },
            featured && { backgroundColor: colors.accent },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: space.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  stat: { color: colors.text, fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  featured: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  points: { color: colors.subtle, fontSize: 14, fontWeight: '600' },
  label: { color: colors.muted, fontSize: 12, marginTop: 2 },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    marginTop: space.xs,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.subtle },
});

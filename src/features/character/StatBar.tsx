import { StyleSheet, Text, View } from 'react-native';
import { STAT_POINTS_MAX, STAT_POINTS_MAX_FEATURED } from '@kairo/core';
import { colors, radius, space, tierColor } from '@/theme.ts';

export function StatBar({
  stat,
  label,
  points,
  featured,
  tier,
}: {
  stat: string;
  label: string;
  points: number;
  featured: boolean;
  /** Bronze/silver/gold from `daily_scores.tiers`. Undefined before any sync. */
  tier: string | undefined;
}) {
  // A featured stat scores at 1.5x (§6), so a featured Gold reaches 1,350.
  // Sizing every bar against 900 would peg a featured Gold at 100% and make it
  // indistinguishable from an ordinary Gold — which is exactly the difference
  // the weekly meta exists to create.
  const ceiling = featured ? STAT_POINTS_MAX_FEATURED : STAT_POINTS_MAX;
  const fill = Math.max(0, Math.min(1, points / ceiling));

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
        {/* Colour is the tier, width is the magnitude. The squad screen shows
            squadmates' tiers in these exact colours, so your own stats have to
            use the same vocabulary — a Gold that looks grey here and gold there
            reads as a bug. Featured is carried by the ×1.5 label and the wider
            ceiling, not by recolouring the fill. */}
        <View
          style={[
            styles.fill,
            { width: `${fill * 100}%`, backgroundColor: tierColor(tier) },
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
  // No default background: the tier colour is always supplied inline, and a
  // fallback here would only ever mask a missing tier.
  fill: { height: '100%', borderRadius: radius.pill },
});

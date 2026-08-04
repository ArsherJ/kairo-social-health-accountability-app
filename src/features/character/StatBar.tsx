import { StyleSheet, Text, View } from 'react-native';
import { colors, font, space, tierColor } from '@/theme.ts';
import { Meter } from '@/ui/index.ts';
import { statFraction } from './stat-fraction.ts';

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
  // Ceiling and clamp logic lives in stat-fraction.ts — StatRow's chips use
  // the identical rule, and the reasoning (why the ceiling itself moves with
  // `featured`) is documented there rather than duplicated here.
  const fill = statFraction(points, featured);

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
      {/* Colour is the tier, width is the magnitude. The squad screen shows
          squadmates' tiers in these exact colours, so your own stats have to
          use the same vocabulary — a Gold that looks grey here and gold there
          reads as a bug. Featured is carried by the ×1.5 label and the wider
          ceiling, not by recolouring the fill. */}
      <Meter fraction={fill} color={tierColor(tier)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: space.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  stat: { ...font.display.minor, color: colors.text },
  featured: { ...font.body.label, color: colors.accent, fontSize: 12 },
  points: { ...font.body.body, color: colors.subtle, fontWeight: '600' },
  label: { ...font.body.body, color: colors.muted, fontSize: 13, marginTop: 2 },
});

import { StyleSheet, Text, View } from 'react-native';
import { STAT_POINTS_MAX } from '@kairo/core';
import { colors, font, radius, space, tierColor } from '@/theme.ts';

export function StatBar({
  stat,
  label,
  points,
  tier,
  lane = false,
  laneEmptyCopy = null,
}: {
  stat: string;
  label: string;
  points: number;
  /** Bronze/silver/gold from `daily_scores.tiers`. Undefined before any sync. */
  tier: string | undefined;
  /**
   * This is the user's declared focus stat. Presentation only — the bar is
   * marked, not scaled. Stored points are program-independent, so every bar
   * sizes against the same ceiling and a Gold looks like a Gold everywhere.
   */
  lane?: boolean;
  /** Shown under an empty lane bar, in the focus's own language. */
  laneEmptyCopy?: string | null;
}) {
  const fill = Math.max(0, Math.min(1, points / STAT_POINTS_MAX));
  const showLaneCopy = lane && points === 0 && laneEmptyCopy !== null;

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={[styles.stat, lane && styles.statLane]}>
          {stat}
          {lane && <Text style={styles.laneTag}> YOUR LANE</Text>}
        </Text>
        <Text style={styles.points}>{points.toLocaleString()}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.track, lane && styles.trackLane]}>
        {/* Colour is the tier, width is the magnitude. The squad screen shows
            squadmates' tiers in these exact colours, so your own stats have to
            use the same vocabulary — a Gold that looks grey here and gold there
            reads as a bug. The lane is carried by the tag and the track border,
            never by recolouring the fill or widening the ceiling. */}
        <View
          style={[
            styles.fill,
            { width: `${fill * 100}%`, backgroundColor: tierColor(tier) },
          ]}
        />
      </View>
      {showLaneCopy && <Text style={styles.laneCopy}>{laneEmptyCopy}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: space.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  stat: { color: colors.text, fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  statLane: { color: colors.accent },
  laneTag: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  points: { color: colors.subtle, fontSize: 14, fontWeight: '600' },
  label: { color: colors.muted, fontSize: 12, marginTop: 2 },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    marginTop: space.xs,
    overflow: 'hidden',
  },
  trackLane: { borderWidth: 1, borderColor: colors.accent },
  // No default background: the tier colour is always supplied inline, and a
  // fallback here would only ever mask a missing tier.
  fill: { height: '100%', borderRadius: radius.pill },
  laneCopy: { color: colors.subtle, ...font.body, fontSize: 12, marginTop: space.xs },
});

import { StyleSheet, Text, View } from 'react-native';
import { STAT_POINTS_MAX } from '@kairo/core';
import { colors, font, radius, space, tierColor } from '@/theme.ts';
import { Meter } from '@/ui/index.ts';

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
  // One ceiling for every bar. The redesign arrived from a branch that still
  // had the weekly featured stat and sized bars against a moving ceiling
  // (`statFraction(points, featured)`); deviation #10 retired that rotation
  // from stored scoring, so there is no second ceiling left to size against.
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

      {/* Colour is the tier, width is the magnitude. The squad screen shows
          squadmates' tiers in these exact colours, so your own stats have to
          use the same vocabulary — a Gold that looks grey here and gold there
          reads as a bug. The lane is carried by the tag and the track border,
          never by recolouring the fill or widening the ceiling. */}
      <View style={[styles.meter, lane && styles.meterLane]}>
        <Meter fraction={fill} color={tierColor(tier)} />
      </View>

      {showLaneCopy && <Text style={styles.laneCopy}>{laneEmptyCopy}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: space.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  stat: { ...font.display.minor, color: colors.text },
  statLane: { color: colors.accent },
  laneTag: { ...font.body.label, color: colors.accent, fontSize: 10 },
  points: { ...font.body.body, color: colors.subtle, fontWeight: '600' },
  label: { ...font.body.body, color: colors.muted, fontSize: 13, marginTop: 2 },
  meter: { marginTop: space.xs, borderRadius: radius.pill },
  // The lane ring sits on a wrapper rather than on `Meter` itself: the meter
  // owns fill and track, and giving it a border prop for one caller would put
  // a presentation decision inside a primitive two screens share.
  meterLane: { borderWidth: 1, borderColor: colors.accent },
  laneCopy: { ...font.body.body, color: colors.subtle, fontSize: 12, marginTop: space.xs },
});

import { StyleSheet, Text, View } from 'react-native';
import { ratingForStatPoints, statPointsForRating } from '@kairo/core';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { Meter } from '@/ui/index.ts';

export function StatBar({
  stat,
  label,
  todayPoints,
  lifetimePoints,
  lane = false,
  laneEmptyCopy = null,
}: {
  stat: string;
  label: string;
  /** What this stat scored today. The "+N" beside the rating. */
  todayPoints: number;
  /** Lifetime points in this stat, from the `profiles` rollup. */
  lifetimePoints: number | undefined;
  /**
   * This is the user's lane — the stat they have been grinding. Presentation
   * only — the bar is marked, not scaled. Stored points are program-independent,
   * so every bar sizes against the same curve everywhere.
   */
  lane?: boolean;
  /** Shown under an empty lane bar, in that stat's own language. */
  laneEmptyCopy?: string | null;
}) {
  const points = lifetimePoints ?? 0;
  const rating = ratingForStatPoints(points);

  // Progress from this rating's floor to the next one's — which is why
  // `statPointsForRating` exists as an exact inverse. Computing the next
  // threshold any other way lets the bar sit full at the moment a rating is
  // gained, or overflow just before it.
  //
  // This replaced `points / STAT_POINTS_MAX`, a fixed 900-point ceiling that
  // was a day's Gold. A lifetime total against a daily ceiling would have
  // pinned every established player's bar at 100% forever. It also closes
  // Phase 1 follow-up #2: `STAT_MAX = 900` duplicated `TIER_POINTS.gold` here
  // with nothing to catch the drift.
  const floor = statPointsForRating(rating);
  const ceiling = statPointsForRating(rating + 1);
  const fill = ceiling > floor ? (points - floor) / (ceiling - floor) : 0;

  const showLaneCopy = lane && todayPoints === 0 && laneEmptyCopy !== null;

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={[styles.stat, lane && styles.statLane]}>
          {stat}
          {lane && <Text style={styles.laneTag}> YOUR LANE</Text>}
        </Text>
        <View style={styles.numbers}>
          <Text style={styles.rating}>{rating}</Text>
          {/* Today's contribution, beside the ability it fed. The rating is
              slow by design, so a good day would otherwise move nothing the
              user can see. */}
          {todayPoints > 0 && (
            <Text style={styles.today}>+{todayPoints.toLocaleString()}</Text>
          )}
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>

      {/* One hue, and width is the whole message: how far into this rating you
          are. Colour used to carry the tier, which meant the bar was saying two
          things at once and neither loudly. The lane is carried by the tag and
          the track border, never by recolouring the fill. */}
      <View style={[styles.meter, lane && styles.meterLane]}>
        <Meter fraction={Math.max(0, Math.min(1, fill))} color={colors.accent} />
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
  numbers: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  rating: { ...font.display.minor, color: colors.text },
  today: { ...font.body.body, color: ramp.sage[800], fontFamily: 'Figtree-SemiBold', fontSize: 12 },
  label: { ...font.body.body, color: colors.muted, fontSize: 13, marginTop: 2 },
  meter: { marginTop: space.xs, borderRadius: radius.pill },
  // The lane ring sits on a wrapper rather than on `Meter` itself: the meter
  // owns fill and track, and giving it a border prop for one caller would put
  // a presentation decision inside a primitive two screens share.
  meterLane: { borderWidth: 1, borderColor: colors.accent },
  laneCopy: { ...font.body.body, color: colors.subtle, fontSize: 12, marginTop: space.xs },
});

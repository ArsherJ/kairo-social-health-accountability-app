import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, ramp } from '../theme.ts';
import { useFillIn } from './motion.ts';

export function Meter({
  fraction,
  color,
  height = 6,
  pace,
}: {
  /** 0–1. Clamped inside useFillIn. */
  fraction: number;
  color: string;
  height?: number;
  /**
   * 0–1: where the fill *should* have reached by now. Draws a hairline tick at
   * that position, so the bar answers "am I keeping up?" and not just "how far
   * have I got?".
   *
   * This is the difference between a goal and a tally. Progress alone says
   * 42,300 of 60,000, which is either fine or a disaster depending on whether
   * three days are left or twenty — and the caller already knows which.
   * Omit it wherever there is no deadline to be measured against; a tick at a
   * position that means nothing is worse than no tick.
   */
  pace?: number;
}) {
  const fill = useFillIn(fraction);
  const width = fill.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.track, { height }]}>
      {/* No default background: the colour is always supplied by the caller,
          and a fallback here would only ever mask a missing tier. */}
      <Animated.View style={{ width, height, backgroundColor: color, borderRadius: radius.pill }} />

      {/* Drawn over the fill, so a bar that has passed the marker still shows
          where the marker was — that is the whole point of it. Clamped inside
          the track: at 0% or 100% a centred tick would sit half outside the
          rounded ends and read as a rendering fault. */}
      {pace !== undefined && pace > 0 && pace < 1 && (
        <View
          pointerEvents="none"
          style={[styles.pace, { left: `${Math.round(pace * 100)}%`, height }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.pill,
    // Neutral 300, not `colors.surface`: a meter usually sits *on* a surface
    // card, and a track the same tint as the card behind it shows no track
    // at all — the bar would look like it floats with nothing left to fill.
    backgroundColor: ramp.neutral[300],
    overflow: 'hidden',
    position: 'relative',
  },
  pace: {
    position: 'absolute',
    top: 0,
    width: 2,
    // The page background, not a colour of its own. The tick reads as a gap cut
    // out of the bar rather than as a fourth thing competing with the three
    // colour families — and it stays legible over both the filled and the
    // unfilled side without needing to know which it landed on.
    backgroundColor: colors.bg,
    // Pull back by half its width so the tick is centred on the position,
    // not starting at it.
    marginLeft: -1,
  },
});

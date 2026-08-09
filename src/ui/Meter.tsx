import { Animated, StyleSheet, View } from 'react-native';
import { radius, ramp } from '../theme.ts';
import { useFillIn } from './motion.ts';

export function Meter({
  fraction,
  color,
  height = 6,
}: {
  /** 0–1. Clamped inside useFillIn. */
  fraction: number;
  color: string;
  height?: number;
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
  },
});

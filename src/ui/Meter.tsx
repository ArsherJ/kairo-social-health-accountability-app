import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme.ts';
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
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
});

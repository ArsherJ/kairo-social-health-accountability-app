import { Animated, StyleSheet, View } from 'react-native';
import { radius, type Theme } from '../theme.ts';
import { useFillIn } from './motion.ts';
import { useStyles } from './use-theme.ts';

export function Meter({
  fraction,
  color,
  height = 6,
  pace,
  label,
}: {
  /** 0–1. Clamped inside useFillIn. */
  fraction: number;
  color: string;
  height?: number;
  /**
   * 0–1: where the fill *should* have reached by now. Draws a hairline tick at
   * that position. Omit it wherever there is no deadline to be measured
   * against; a tick at a position that means nothing is worse than no tick.
   */
  pace?: number;
  /**
   * What this bar measures, for screen readers. Omitted by default and the bar
   * is then **hidden** from assistive tech — every current caller draws the
   * numbers as text right beside it.
   */
  label?: string;
}) {
  const styles = useStyles(makeStyles);
  const fill = useFillIn(fraction);
  const width = fill.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);

  return (
    <View
      style={[styles.track, { height }]}
      {...(label
        ? {
            accessible: true,
            accessibilityRole: 'progressbar' as const,
            accessibilityLabel: label,
            accessibilityValue: { now: percent, min: 0, max: 100 },
          }
        : { accessibilityElementsHidden: true, importantForAccessibility: 'no' as const })}
    >
      {/* No default background: the colour is always supplied by the caller. */}
      <Animated.View style={{ width, height, backgroundColor: color, borderRadius: radius.pill }} />

      {pace !== undefined && pace > 0 && pace < 1 && (
        <View
          pointerEvents="none"
          style={[styles.pace, { left: `${Math.round(pace * 100)}%`, height }]}
        />
      )}
    </View>
  );
}

const makeStyles = ({ colors, ramp }: Theme) =>
  StyleSheet.create({
    track: {
      borderRadius: radius.pill,
      // Neutral 300, not `surface`: a meter usually sits *on* a surface card,
      // and a track the same tint as the card behind it shows no track at all.
      backgroundColor: ramp.neutral[300],
      overflow: 'hidden',
      position: 'relative',
    },
    pace: {
      position: 'absolute',
      top: 0,
      width: 2,
      // The page background: the tick reads as a gap cut out of the bar.
      backgroundColor: colors.bg,
      marginLeft: -1,
    },
  });

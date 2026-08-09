import { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { rampColors, type Stop } from './gradient.ts';

/**
 * A gradient painted as a stack of solid bands.
 *
 * No gradient library is installed, and the redesign needs exactly two
 * gradients — the diorama's sage sky and its fade down to cream. A native
 * module (and the prebuild it drags along) is a heavy price for two ramps that
 * a column of `<View>`s renders indistinguishably.
 *
 * The bands flex to fill, so they tile exactly however tall the parent is;
 * sizing them by hand is what would leave hairline seams at fractional
 * heights. `steps` is the honesty dial: 32 is invisible across a phone-height
 * ramp, and short ramps can go lower.
 */
export function Gradient({
  stops,
  steps = 32,
  style,
}: {
  /** Module-level constants, ideally — a fresh array each render re-ramps. */
  stops: Stop[];
  steps?: number;
  style?: ViewStyle;
}) {
  const bands = useMemo(() => rampColors(stops, steps), [stops, steps]);

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {bands.map((color, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}

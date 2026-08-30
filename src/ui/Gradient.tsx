import { useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { rampColors, type Stop } from './gradient.ts';

/**
 * A gradient painted as a stack of solid bands.
 *
 * No gradient library is installed and none is coming: a native module moves
 * the fingerprint, spends one of the month's fifteen EAS builds, and withholds
 * every OTA until that build lands. That was a comfortable trade when the app
 * needed two ramps (the diorama's sky and its fade to cream); Playful needs
 * about twenty — every screen header, every filled nav pill, the flight itself
 * — and it is still the right one, because the cost of this component is a
 * handful of `<View>`s and the cost of the alternative is the release cadence.
 *
 * RN 0.86 does ship `experimental_backgroundImage`, which would draw these in
 * one style prop. It is deliberately not used: it is unverifiable from this
 * machine (no device pairing — see `README.md`), and its failure mode is a
 * *transparent* view rather than an error, which on a filled nav pill means an
 * active tab that is simply invisible. A banded ramp that certainly works beats
 * a real one that probably does.
 *
 * The bands flex to fill, so they tile exactly however wide or tall the parent
 * is; sizing them by hand is what would leave hairline seams at fractional
 * lengths. `steps` is the honesty dial: 32 is invisible across a phone-height
 * ramp, and a 58pt nav pill is indistinguishable at 10.
 */
export function Gradient({
  stops,
  steps = 32,
  direction = 'vertical',
  style,
}: {
  /** Module-level constants, ideally — a fresh array each render re-ramps. */
  stops: Stop[];
  steps?: number;
  /**
   * Which way the ramp runs. Vertical covers every header and fill in the
   * system; horizontal is for a meter, where the ramp tracks progress along
   * the bar. A diagonal is deliberately not offered — the design draws several
   * at `160deg`, and a banded diagonal needs a rotated over-sized parent to
   * avoid corner seams, which is a lot of machinery for a difference nobody
   * can see behind a bird.
   */
  direction?: 'vertical' | 'horizontal';
  style?: ViewStyle;
}) {
  const bands = useMemo(() => rampColors(stops, steps), [stops, steps]);

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        direction === 'horizontal' && styles.horizontal,
        style,
      ]}
      pointerEvents="none"
      // Banded fill, so this is `steps` sibling Views deep. Left visible to
      // assistive tech it is that many empty stops between the header and the
      // character — the accessibility equivalent of the `pointerEvents="none"`
      // already on this line.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {bands.map((color, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  horizontal: { flexDirection: 'row' },
});

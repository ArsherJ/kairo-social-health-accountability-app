import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, glass, radius, shadow } from '../theme.ts';

/**
 * Chrome that floats over content.
 *
 * The tab bar, the flock rail pinned over the flight, the card at the foot of
 * the Sky, the lifted sheet in the permissions beat. Playful puts five of these
 * on screen where Sunlit had one, which is why the treatment is a component
 * rather than a style repeated five times.
 *
 * **It is not a blur, and it must not become one.** `backdrop-filter` has no
 * React Native equivalent, and `expo-blur` is a native module: adding it moves
 * the fingerprint, spends one of the month's fifteen EAS builds, and withholds
 * every OTA update until that build lands — the same trade the Sky corridor
 * already refused for `react-native-svg` (deviation #56), and the reason this
 * whole redesign ships over the air. What is drawn instead is a translucent
 * fill with a hairline top highlight, which over Playful's bright grounds reads
 * as glass at a glance and costs nothing.
 *
 * Two grounds, because one fill cannot serve both. `light` sits over cream,
 * white and the pale end of a sky; `dark` sits over the flight and the night
 * beats of onboarding. Choosing wrong does not look subtly off — it looks like
 * a grey box — so the prop has no default that could be silently wrong in half
 * the app: `tone` is required.
 *
 * The gradient is two stacked fills rather than a real one: the design's
 * `linear-gradient(180deg, .74, .44)` is a vertical fade, and at these heights
 * (74pt of tab bar, 130pt of rail) two bands are indistinguishable from the
 * ramp while costing one view instead of `Gradient`'s thirty-two.
 */
export function Glass({
  tone,
  radius: r = radius.xxl,
  style,
  children,
}: {
  tone: 'light' | 'dark';
  /** Defaults to the chrome step. A pill or a sheet passes its own. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const palette = glass[tone];

  return (
    <View
      style={[
        styles.base,
        {
          borderRadius: r,
          backgroundColor: palette.fill,
          borderColor: palette.edge,
        },
        style,
      ]}
    >
      {/* The lower half of the fade, and the inset highlight along the top —
          the two things that make a flat translucent rectangle read as a lit
          surface rather than as a scrim. Both are decoration and neither may
          intercept a touch, since this component's whole purpose is to sit
          over things that are pressed. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          StyleSheet.absoluteFill,
          styles.fade,
          { borderBottomLeftRadius: r, borderBottomRightRadius: r },
        ]}
      />
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.sheen, { backgroundColor: palette.edge }]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
    ...shadow.lg,
  },
  /**
   * The bottom 55% at a lower opacity, which is the fade.
   *
   * `overflow: 'hidden'` is deliberately *not* set on `base`: it would clip the
   * shadow on Android (elevation is drawn by the platform, outside the bounds),
   * which is the trap `Panel` already documents. So this child carries its own
   * bottom radii instead of relying on the parent to cut it.
   */
  fade: {
    top: '45%',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: radius.lg,
    right: radius.lg,
    height: StyleSheet.hairlineWidth,
  },
});

/**
 * The ink that reads on each glass tone.
 *
 * Exported beside the component because getting this wrong is the commonest
 * way to misuse it — `dark` glass over the flight takes cream text, and the
 * same component over the cream ground takes ink. A caller that reaches for
 * `colors.text` on dark glass renders indigo on indigo.
 */
export const glassInk = {
  light: colors.text,
  dark: colors.bg,
} as const;

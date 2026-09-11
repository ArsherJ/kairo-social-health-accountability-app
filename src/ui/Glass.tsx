import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '../theme.ts';
import { useTheme } from './use-theme.ts';

/**
 * Chrome that floats over content: the tab bar, the flock rail pinned over the
 * flight, the card at the foot of the Sky.
 *
 * **It is not a blur, and it must not become one.** `backdrop-filter` has no
 * React Native equivalent, and `expo-blur` is a native module: adding it moves
 * the fingerprint, spends one of the month's fifteen EAS builds, and withholds
 * every OTA update until that build lands. What is drawn instead is a
 * translucent fill with a hairline top highlight.
 *
 * Two tones, because one fill cannot serve both. `light` sits over the page —
 * cream under the light scheme, indigo under the dark one, and the theme hands
 * back the right fill for each. `dark` sits over the flight, which is drawn on
 * `night` in both schemes. Choosing wrong looks like a grey box, so `tone` is
 * required.
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
  const theme = useTheme();
  const palette = theme.glass[tone];

  return (
    <View
      style={[
        styles.base,
        theme.shadow.lg,
        {
          borderRadius: r,
          backgroundColor: palette.fill,
          borderColor: palette.edge,
        },
        style,
      ]}
    >
      {/* The inset highlight keeps the uniform translucent fill legible as a
          surface without putting a hard band through content below it. */}
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
 * The ink that reads on each glass tone, under the light scheme.
 *
 * Static, for the screens still on the static tokens. A themed screen reads
 * `useGlassInk` instead: `dark` glass over the flight takes `onDeep` in both
 * schemes, and `light` glass takes the page's own text colour.
 */
export const glassInk = {
  light: colors.text,
  dark: colors.bg,
} as const;

export function useGlassInk(tone: 'light' | 'dark'): string {
  const { colors: c } = useTheme();
  return tone === 'dark' ? c.onDeep : c.text;
}

import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme.ts';

/**
 * Route name -> pill label. Text only — no icon library is installed, and
 * that is deliberate (see the redesign spec's §6 note on the dark-fantasy
 * hunter aesthetic staying typographic).
 */
const LABELS: Record<string, string> = {
  index: 'HUNTER',
  squad: 'SQUAD',
  profile: 'YOU',
};

/**
 * Floating tab bar. A `BottomTabBar` replacement passed as the `tabBar` prop
 * on the `Tabs` navigator, so it receives React Navigation's own props
 * unmodified — including `insets`, which is why no `useSafeAreaInsets` call
 * lives in this file.
 *
 * Height is fixed at 72 to agree with `Screen`'s `TAB_PILL_CLEARANCE` (72pt
 * of pill + 24pt of gap). Changing one without the other misaligns content.
 */
export function TabPill({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.pill, { bottom: insets.bottom + space.md }]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = LABELS[route.name] ?? route.name.toUpperCase();

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={() => navigation.navigate(route.name)}
            style={styles.cell}
          >
            <View style={[styles.dot, focused && styles.dotFocused]} />
            <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    height: 72,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginBottom: space.xs,
    backgroundColor: 'transparent',
  },
  dotFocused: {
    backgroundColor: colors.accent,
  },
  label: {
    ...font.body.label,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  labelFocused: {
    color: colors.accent,
  },
});

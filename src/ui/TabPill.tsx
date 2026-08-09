import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, ramp, radius, shadow, space } from '../theme.ts';

/**
 * Route name -> label. Text only — no icon library is installed, and that is
 * deliberate: the app has always been typographic, and Caprasimo in a circle
 * is a stronger read at this size than a 21px stroke icon would be.
 */
const LABELS: Record<string, string> = {
  index: 'Hunter',
  squad: 'Squad',
  profile: 'You',
};

/**
 * The orbit nav. A `BottomTabBar` replacement passed as the `tabBar` prop on
 * the `Tabs` navigator, so it receives React Navigation's own props
 * unmodified — including `insets`, which is why no `useSafeAreaInsets` call
 * lives in this file.
 *
 * Three discs rather than a bar: the Hunter sits centre and larger because it
 * is where the app opens and where it returns, and the other two orbit it.
 * The height is fixed at `NAV_HEIGHT` and `Screen` clears exactly that, so
 * changing one without the other hides content behind the nav.
 */
export const NAV_HEIGHT = 96;

export function TabPill({ state, navigation, insets }: BottomTabBarProps) {
  const order = ['squad', 'index', 'profile'];
  const routes = order
    .map((name) => state.routes.find((r) => r.name === name))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { bottom: insets.bottom + space.sm }]}
    >
      {routes.map((route) => {
        const focused = state.routes[state.index]?.key === route.key;
        const centre = route.name === 'index';
        const label = LABELS[route.name] ?? route.name;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => navigation.navigate(route.name)}
            style={[
              styles.disc,
              centre ? styles.centre : styles.orbit,
              focused ? styles.focused : styles.resting,
            ]}
          >
            <Text
              style={[
                centre ? styles.centreLabel : styles.orbitLabel,
                { color: focused ? colors.bg : colors.subtle },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: NAV_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: space.lg,
  },
  disc: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  orbit: { width: 60, height: 60, marginBottom: space.sm, ...shadow.md },
  centre: { width: 74, height: 74, ...shadow.lg },
  resting: { backgroundColor: ramp.neutral[100] },
  focused: { backgroundColor: colors.accent },
  centreLabel: { ...font.display.small },
  orbitLabel: { ...font.display.label },
});

import Feather from '@expo/vector-icons/Feather';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, ramp, radius, shadow, space } from '../theme.ts';
import { useChromeStore } from './chrome.ts';

/**
 * Route name -> label. The label is no longer painted: three word-discs read
 * as buttons rather than as places, and the design mocks carry lucide icons.
 * It survives as `accessibilityLabel`, which is now the tab's only name — so
 * these strings are load-bearing, not decoration.
 */
const LABELS: Record<string, string> = {
  index: 'Character',
  squad: 'Squad',
  profile: 'You',
};

/**
 * Feather, because lucide is a fork of Feather: the design's `user` and
 * `users` are literally these glyphs at the same 2px stroke.
 *
 * `circle-user-round` has no Feather equivalent, so "You" composes `user`
 * inside a ring. That keeps one family and one stroke weight across the three
 * discs, which a mixed-family substitute would not.
 */
const ICONS: Record<string, 'user' | 'users'> = {
  index: 'user',
  squad: 'users',
  profile: 'user',
};

/**
 * The orbit nav. A `BottomTabBar` replacement passed as the `tabBar` prop on
 * the `Tabs` navigator, so it receives React Navigation's own props
 * unmodified — including `insets`, which is why no `useSafeAreaInsets` call
 * lives in this file.
 *
 * Three discs rather than a bar: the character sits centre and larger because it
 * is where the app opens and where it returns, and the other two orbit it.
 * The height is fixed at `NAV_HEIGHT` and `Screen` clears exactly that, so
 * changing one without the other hides content behind the nav.
 */
export const NAV_HEIGHT = 96;

/** Glyph sizes, tuned to the disc they sit in — 60pt orbit, 74pt centre. */
const ORBIT_ICON = 22;
const CENTRE_ICON = 26;

export function TabPill({ state, navigation, insets }: BottomTabBarProps) {
  // Create and join are full-screen tasks. `Screen` drops its clearance on the
  // same flag, so the two stay in step.
  const navHidden = useChromeStore((s) => s.navHidden);
  if (navHidden) return null;

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
        const ink = focused ? colors.bg : colors.subtle;
        const size = centre ? CENTRE_ICON : ORBIT_ICON;

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
            {route.name === 'profile' ? (
              <View
                style={[
                  styles.ring,
                  { width: size, height: size, borderColor: ink },
                ]}
              >
                {/* Sized so the shoulders reach the ring and crop against it,
                    which is what makes this read as lucide's glyph rather than
                    as a small person standing inside a circle. */}
                <Feather name={ICONS.profile} size={size * 0.68} color={ink} />
              </View>
            ) : (
              <Feather name={ICONS[route.name] ?? 'user'} size={size} color={ink} />
            )}
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
  /** lucide's `circle-user-round`, composed: `user` inscribed in a 2px ring. */
  ring: {
    borderWidth: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

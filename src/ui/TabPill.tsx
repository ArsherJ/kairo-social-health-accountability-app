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
  today: 'Today',
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
const ICONS: Record<string, 'user' | 'users' | 'sun'> = {
  index: 'user',
  // `sun` is Feather's, at the same 2px stroke as `user` and `users` — the
  // family and the weight do not move. The hairline/solid split is total in
  // both directions: chrome is Feather, character data is
  // MaterialCommunityIcons.
  today: 'sun',
  squad: 'users',
  profile: 'user',
};

/**
 * The orbit nav. A `BottomTabBar` replacement passed as the `tabBar` prop on
 * the `Tabs` navigator, so it receives React Navigation's own props
 * unmodified — including `insets`, which is why no `useSafeAreaInsets` call
 * lives in this file.
 *
 * Four discs rather than a bar: the character is raised and larger because it
 * is where the app opens and where it returns, and the other three orbit it.
 * The height is fixed at `NAV_HEIGHT` and `Screen` clears exactly that, so
 * changing one without the other hides content behind the nav.
 *
 * **The character keeps the raised disc and is no longer geometrically
 * centred** (deviation #50). The raised disc means *anchor*, not *middle*: with
 * four items a raised third-of-four would be arbitrary, and two raised discs is
 * no anchor at all. Do not add a second raised disc for Today.
 */
export const NAV_HEIGHT = 96;

/** Glyph sizes, tuned to the disc they sit in — 52pt orbit, 68pt centre. */
const ORBIT_ICON = 20;
const CENTRE_ICON = 24;

export function TabPill({ state, navigation, insets }: BottomTabBarProps) {
  // Create and join are full-screen tasks. `Screen` drops its clearance on the
  // same flag, so the two stay in step.
  const navHidden = useChromeStore((s) => s.navHidden);
  if (navHidden) return null;

  // Squad stays leftmost and You stays rightmost, so no existing thumb target
  // moves to the other end of the bar. Today slots between the character and
  // the profile, which is where a new place belongs: next to the two you
  // already visit, not at an edge.
  const order = ['squad', 'index', 'today', 'profile'];
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
    gap: space.md,
  },
  disc: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  // Four discs, sized against the narrowest supported screen:
  // 3 x 52 + 68 + 3 x 16 = 272 against 320pt. `NAV_HEIGHT` stays 96 and
  // `TAB_PILL_CLEARANCE` therefore stays unchanged — the discs got smaller,
  // not the bar.
  orbit: { width: 52, height: 52, marginBottom: space.sm, ...shadow.md },
  centre: { width: 68, height: 68, ...shadow.lg },
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

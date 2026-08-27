import Feather from '@expo/vector-icons/Feather';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, font, radius, shadow, space } from '../theme.ts';
import { useChromeStore } from './chrome.ts';
import { Text } from './Text.tsx';

/**
 * Route name -> label. **Painted as well as spoken**, since 2026-08-27.
 *
 * It used to be `accessibilityLabel` only, because three word-discs read as
 * buttons rather than as places. A flat four-item bar is not three discs: the
 * label is what makes it a bar, and the design carries one under every glyph.
 * These strings are load-bearing in both jobs now.
 */
const LABELS: Record<string, string> = {
  index: 'Today',
  sky: 'Sky',
  flock: 'Flock',
  profile: 'You',
};

/**
 * Feather, because lucide is a fork of Feather and the design's glyphs are
 * literally these at the same 2px stroke. The hairline/solid split is total in
 * both directions: chrome is Feather, character data is
 * MaterialCommunityIcons. Do not blur it here.
 */
const ICONS: Record<string, 'sun' | 'wind' | 'users' | 'user'> = {
  index: 'sun',
  // The sky corridor, and the nearest Feather has to a bird in flight without
  // reaching into a second family.
  sky: 'wind',
  flock: 'users',
  profile: 'user',
};

/**
 * The tab bar. A `BottomTabBar` replacement passed as the `tabBar` prop on the
 * `Tabs` navigator, so it receives React Navigation's own props unmodified —
 * including `insets`, which is why no `useSafeAreaInsets` call lives here.
 *
 * **Flat, and no raised disc** (2026-08-27, superseding deviation #50). The
 * raised disc meant *anchor*, and the anchor was the character tab. There is no
 * character tab now, and raising an arbitrary one of four is exactly what that
 * deviation forbade. Do not reintroduce one.
 *
 * `NAV_HEIGHT` is unchanged at 96, so `TAB_PILL_CLEARANCE` does not move and no
 * screen's bottom padding changes with this.
 */
export const NAV_HEIGHT = 96;

const ICON_SIZE = 22;

/**
 * The bar's own inset from the screen edge. Named because the width budget
 * below is computed against it: 320 - 2*14 = 292pt of usable bar.
 */
const BAR_INSET = 14;

export function TabPill({ state, navigation, insets }: BottomTabBarProps) {
  // Create and join are full-screen tasks. `Screen` drops its clearance on the
  // same flag, so the two stay in step.
  const navHidden = useChromeStore((s) => s.navHidden);
  if (navHidden) return null;

  // The bar's order, which the navigator's need not match and does not.
  const order = ['index', 'sky', 'flock', 'profile'];
  const routes = order
    .map((name) => state.routes.find((r) => r.name === name))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { bottom: insets.bottom + space.sm, left: BAR_INSET, right: BAR_INSET }]}
    >
      {routes.map((route) => {
        const focused = state.routes[state.index]?.key === route.key;
        const label = LABELS[route.name] ?? route.name;
        const ink = focused ? colors.accentDeep : colors.muted;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => navigation.navigate(route.name)}
            style={styles.item}
          >
            {/*
              Both halves of the grouping fix. The `Pressable` already names
              itself, so the glyph and the painted label must not be reachable
              as their own stops — otherwise a four-tab bar is eight.
            */}
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.itemBody}
            >
              <Feather name={ICONS[route.name] ?? 'user'} size={ICON_SIZE} color={ink} />
              {/*
                `numberOfLines={1}` and no fixed width on the item.

                At the `chrome` scale's 1.4x cap a 10pt label reaches ~14pt and
                "FLOCK" measures about 56pt — four fixed 64pt items still fit
                the 292pt budget, but a fixed width here is the two-column row
                that could not fit past ~1.3x, in a new place. Let the items
                flex and let the word truncate rather than the row break.
              */}
              <Text
                scale="chrome"
                numberOfLines={1}
                style={[styles.label, focused ? styles.labelOn : styles.labelOff]}
              >
                {label.toUpperCase()}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    height: NAV_HEIGHT - space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLift,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    paddingHorizontal: space.sm,
    ...shadow.md,
  },
  // `flex: 1` rather than a width: four equal shares of whatever the screen
  // gives, so the bar is correct at 320pt and at 440pt without a breakpoint.
  item: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  itemBody: { alignItems: 'center', gap: space.xs },
  label: { ...font.body.label },
  labelOn: { color: colors.text },
  labelOff: { color: colors.muted },
});

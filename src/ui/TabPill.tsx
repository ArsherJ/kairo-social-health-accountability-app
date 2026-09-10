import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState } from 'react';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { font, space, type Theme } from '../theme.ts';
import { useChromeStore } from './chrome.ts';
import { Glass } from './Glass.tsx';
import { animationDuration } from './motion-policy.ts';
import { useReduceMotionState } from './motion.ts';
import { tabPillGeometry } from './tab-pill-geometry.ts';
import { Text } from './Text.tsx';
import { useStyles, useTheme } from './use-theme.ts';

/**
 * Route name -> label. **Painted only on the tab you are on.** Every tab still
 * carries its label as an `accessibilityLabel`, so nothing is lost to a screen
 * reader; the filled pill has room for a word and the bare glyphs do not.
 */
const LABELS: Record<string, string> = {
  index: 'Today',
  sky: 'Sky',
  flock: 'Flock',
  profile: 'You',
};

/**
 * MaterialCommunityIcons, for every tab — the app's one icon family.
 * Reintroducing a second family is a design decision, not a convenience.
 */
const ICONS: Record<
  string,
  React.ComponentProps<typeof MaterialCommunityIcons>['name']
> = {
  index: 'white-balance-sunny',
  sky: 'weather-windy',
  flock: 'account-multiple',
  profile: 'account',
};

/**
 * The tab bar. A `BottomTabBar` replacement passed as the `tabBar` prop on the
 * `Tabs` navigator, so it receives React Navigation's own props unmodified —
 * including `insets`, which is why no `useSafeAreaInsets` call lives here.
 *
 * **Flat, and no raised disc** (2026-08-27). The selected pill is a fill
 * inside the bar, and it moves: on a tab switch its left edge and width spring
 * to the new slot's geometry (`tabPillGeometry`, tested). This is the one
 * motion in the bar and it is deliberately short — a tab switch is a
 * hundred-times-a-day gesture, so the move has to read as continuity rather
 * than as a transition. Under Reduce Motion, and until the first placement
 * resolves, the pill cuts rather than travels.
 *
 * **One fill, not four gradients** (deviation #72). The four per-tab ramps
 * were the loudest thing on every screen and the one element that read as a
 * template rather than as this app; the pill is the orange wash now, with the
 * accent's own ink on it, so the bar says *which tab* and nothing else. The
 * wash is a 200 step, which carries body text in both schemes by the ramp's
 * contract.
 *
 * `NAV_HEIGHT` is unchanged at 96, so `TAB_PILL_CLEARANCE` does not move and
 * no screen's bottom padding changes with this.
 */
export const NAV_HEIGHT = 96;

/** The bar itself. The remaining 22pt of `NAV_HEIGHT` is the gap under it. */
const BAR_HEIGHT = 68;

const ICON_SIZE = 22;

/**
 * The bar's own inset from the screen edge. Named because the width budget
 * is computed against it: 320 - 2*16 = 288pt of bar, less 2*8 of padding
 * = 272pt for the items.
 */
const BAR_INSET = 16;

/** Shared between the stylesheet and `tabPillGeometry` so the two cannot drift. */
const GAP = 6;
const FOCUSED_FLEX = 1.5;

/** How long the pill takes to cross to a new tab. See the component note. */
const TRAVEL_MS = 160;
const EASE = Easing.out(Easing.cubic);
const PILL_RADIUS = 22;

export function TabPill({ state, navigation, insets }: BottomTabBarProps) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  // Create and join are full-screen tasks. `Screen` drops its clearance on the
  // same flag, so the two stay in step.
  const navHidden = useChromeStore((s) => s.navHidden);
  const { reduce: reduceMotion, ready: motionReady } = useReduceMotionState();

  // The bar's order, which the navigator's need not match and does not.
  const order = ['index', 'sky', 'flock', 'profile'];
  const routes = order
    .map((name) => state.routes.find((r) => r.name === name))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);

  const activeKey = state.routes[state.index]?.key;
  const focusedIndex = routes.findIndex((r) => r.key === activeKey);
  const focusedName = focusedIndex >= 0 ? routes[focusedIndex]?.name : undefined;

  // The row's measured content box. Until this arrives the pill is not drawn —
  // a pill placed at a guessed width would jump on the first real layout.
  const [row, setRow] = useState({ w: 0, h: 0 });

  const left = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const didPlace = useRef(false);

  useEffect(() => {
    if (row.w <= 0 || focusedIndex < 0 || !focusedName) return;

    const geo = tabPillGeometry(focusedIndex, row.w, routes.length, GAP, FOCUSED_FLEX);

    // No travel before the Reduce Motion state resolves, and none for the first
    // placement — a pill sliding in from the row's left edge on launch is an
    // entrance nobody asked for.
    const instant = !didPlace.current || !motionReady;
    const ms = instant ? 0 : animationDuration(TRAVEL_MS, reduceMotion);

    if (ms === 0) {
      left.setValue(geo.left);
      width.setValue(geo.width);
      if (motionReady) didPlace.current = true;
      return;
    }

    const anim = Animated.parallel([
      Animated.timing(left, {
        toValue: geo.left,
        duration: ms,
        easing: EASE,
        useNativeDriver: false,
      }),
      Animated.timing(width, {
        toValue: geo.width,
        duration: ms,
        easing: EASE,
        useNativeDriver: false,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [focusedIndex, focusedName, row.w, reduceMotion, motionReady, routes.length, left, width]);

  // After every hook, so hiding the bar never changes the hook count.
  if (navHidden) return null;

  const showPill = row.w > 0 && focusedIndex >= 0 && Boolean(focusedName);

  return (
    <Glass
      tone="light"
      style={[
        styles.bar,
        { bottom: insets.bottom + space.sm, left: BAR_INSET, right: BAR_INSET },
      ]}
    >
      <View
        accessibilityRole="tablist"
        style={styles.row}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          setRow((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
        }}
      >
        {routes.map((route) => {
          const focused = route.key === activeKey;
          const label = LABELS[route.name] ?? route.name;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => navigation.navigate(route.name)}
              // The selected item takes half again the width, which is what
              // makes room for its word. `flex` rather than a fixed width: the
              // bar is correct at 320pt and at 440pt with no breakpoint.
              style={[styles.item, focused && styles.itemOn]}
            >
              {/* Just the resting glyph. The selected tab's glyph and label
                  ride the moving pill drawn on top. */}
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.itemBody}
              >
                <MaterialCommunityIcons
                  name={ICONS[route.name] ?? 'account'}
                  size={ICON_SIZE}
                  color={colors.muted}
                />
              </View>
            </Pressable>
          );
        })}

        {/* Drawn last so it paints over the resting glyphs; `pointerEvents`
            off so the taps still land on the Pressables beneath it. */}
        {showPill && focusedName && (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.pill, { left, width, height: row.h }]}
          >
            <View style={styles.pillBody}>
              <MaterialCommunityIcons
                name={ICONS[focusedName] ?? 'account'}
                size={ICON_SIZE}
                color={colors.accentDeep}
              />
              {/* `numberOfLines={1}` and `flexShrink` so that at the 1.4x cap
                  the word truncates rather than pushing the glyph out. */}
              <Text scale="chrome" numberOfLines={1} style={styles.label}>
                {LABELS[focusedName] ?? focusedName}
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
    </Glass>
  );
}

const makeStyles = ({ colors, ramp }: Theme) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      height: BAR_HEIGHT,
      padding: space.sm,
    },
    row: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: GAP,
      // The travelling pill is an absolute child of this row.
      position: 'relative',
    },
    item: {
      flex: 1,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemOn: { flex: FOCUSED_FLEX },
    pill: {
      position: 'absolute',
      top: 0,
      zIndex: 1,
      borderRadius: PILL_RADIUS,
      borderCurve: 'continuous',
      backgroundColor: ramp.accent[200],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemBody: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillBody: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      // So the label yields before the glyph does.
      flexShrink: 1,
      paddingHorizontal: space.xs,
    },
    label: { ...font.display.label, fontSize: 15, color: colors.accentDeep, flexShrink: 1 },
  });

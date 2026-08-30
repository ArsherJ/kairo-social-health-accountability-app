import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { colors, font, ramp, space } from '../theme.ts';
import { useChromeStore } from './chrome.ts';
import { Glass } from './Glass.tsx';
import { Gradient } from './Gradient.tsx';
import type { Stop } from './gradient.ts';
import { animationDuration } from './motion-policy.ts';
import { useReduceMotionState } from './motion.ts';
import { tabPillGeometry } from './tab-pill-geometry.ts';
import { Text } from './Text.tsx';

/**
 * Route name -> label. **Painted only on the tab you are on**, since Playful.
 *
 * Three stages of the same argument: the labels were spoken-only while the bar
 * was three word-discs, then painted under every glyph when the bar went flat
 * (2026-08-27), and now painted on the selected tab alone. That is not a
 * retreat to the first position — every tab still carries its label as an
 * `accessibilityLabel`, so nothing is lost to a screen reader. What changed is
 * that the filled pill has room for a word and the bare glyphs do not: four
 * labels under four glyphs in a 74pt bar left the type at a size that could not
 * survive the `chrome` scale's 1.4x cap without truncating on every tab at once.
 * One label, at a readable size, on the tab whose name you most need confirmed.
 */
const LABELS: Record<string, string> = {
  index: 'Today',
  sky: 'Sky',
  flock: 'Flock',
  profile: 'You',
};

/**
 * MaterialCommunityIcons, for every tab.
 *
 * **This retires the hairline/solid split**, which held from 2026-08-11 to
 * here: Feather for chrome (things you operate), MaterialCommunityIcons for
 * character data (things you are). The split was always a consequence rather
 * than a principle — its stated reason was that a 2px hairline glyph beside a
 * fat display numeral reads as a clerical annotation rather than as part of it.
 * Playful sets *everything* in that register: Fredoka is at least as heavy as
 * the Caprasimo that argument was made about, the chrome is chunky glass, and a
 * hairline glyph inside a filled 58pt pill reads as a mistake. The reason
 * points the same way it always did; the surface it points at has changed.
 *
 * So the rule now is one family, and the six Feather call sites moved with it.
 * Reintroducing a second icon family is a design decision, not a convenience —
 * two families with no rule between them is where this started.
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
 * The fill under the selected tab, one ramp per destination.
 *
 * Four gradients rather than one accent, because the pill is the only painted
 * thing in the bar and a single colour would make the four tabs feel like one
 * control with a moving highlight. Each ramp is the screen it opens: Today is
 * the sun (orange into pink), Sky is the flight (blue into violet), Flock is
 * its own header (violet into pink), You is the profile band (teal into blue).
 *
 * Module-level constants on purpose — `Gradient` re-ramps when the array
 * identity changes, so a literal in the render body would recompute every band
 * on every navigation. All four are mounted inside the moving pill at once and
 * crossfaded by opacity as it travels, so a tab switch is one continuous move
 * and colour change rather than a fill that pops.
 */
const TODAY_FILL: Stop[] = [
  { color: '#ff8a4c', at: 0 },
  { color: colors.coral, at: 1 },
];

const FILLS: Record<string, Stop[]> = {
  index: TODAY_FILL,
  sky: [
    { color: ramp.sky[400], at: 0 },
    // `sage[400]`, not the design's `[500]`. The label on this pill is ink
    // (see below), and ink on `#7c4dff` measures 3.26:1 — under AA at any
    // size. One step lighter keeps the blue-into-violet reading and carries
    // the word. `contrast.test.ts` pins every stop on this bar.
    { color: ramp.sage[400], at: 1 },
  ],
  flock: [
    { color: ramp.sage[400], at: 0 },
    { color: colors.coral, at: 1 },
  ],
  profile: [
    { color: '#2bd9c0', at: 0 },
    { color: ramp.sky[400], at: 1 },
  ],
};

/**
 * The tab bar. A `BottomTabBar` replacement passed as the `tabBar` prop on the
 * `Tabs` navigator, so it receives React Navigation's own props unmodified —
 * including `insets`, which is why no `useSafeAreaInsets` call lives here.
 *
 * **Flat, and no raised disc** (2026-08-27, superseding deviation #50). The
 * raised disc meant *anchor*, and the anchor was the character tab. There is no
 * character tab now, and raising an arbitrary one of four is exactly what that
 * deviation forbade. The selected pill is not a disc and is not raised: it is a
 * fill inside the bar, and it moves.
 *
 * **The pill is one overlay that travels**, not a fill re-drawn under whichever
 * tab is focused. On a tab switch its left edge and width spring to the new
 * slot's geometry (`tabPillGeometry`, tested), the resting glyph it lands on is
 * covered, and the four stacked ramps crossfade to the destination's. This is
 * the one motion in the bar and it is deliberately short: a tab switch is a
 * hundred-times-a-day gesture, so the move has to read as continuity — "the
 * selection went there" — not as a transition to sit through. Under Reduce
 * Motion, and until the first placement resolves, the pill cuts rather than
 * travels — the same gate every hook in `motion.ts` takes.
 *
 * `NAV_HEIGHT` is unchanged at 96, so `TAB_PILL_CLEARANCE` does not move and no
 * screen's bottom padding changes with this. That has now survived three
 * redesigns and is worth keeping true.
 */
export const NAV_HEIGHT = 96;

/** The bar itself. The remaining 22pt of `NAV_HEIGHT` is the gap under it. */
const BAR_HEIGHT = 74;

const ICON_SIZE = 23;

/**
 * The bar's own inset from the screen edge. Named because the width budget
 * below is computed against it: 320 - 2*16 = 288pt of bar, less 2*8 of padding
 * = 272pt for the items.
 */
const BAR_INSET = 16;

/**
 * The row's inter-item gap and the selected item's flex weight. Shared between
 * the stylesheet (the real touch targets) and `tabPillGeometry` (the moving
 * overlay) so the two cannot drift apart.
 */
const GAP = 6;
const FOCUSED_FLEX = 1.5;

/** How long the pill takes to cross to a new tab. See the component note. */
const TRAVEL_MS = 160;
const EASE = Easing.out(Easing.cubic);
const PILL_RADIUS = 26;

export function TabPill({ state, navigation, insets }: BottomTabBarProps) {
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

  // One opacity per destination ramp, rebuilt only if the route set changes.
  const routeKey = routes.map((r) => r.name).join(',');
  const fillOpacity = useMemo(() => {
    const m: Record<string, Animated.Value> = {};
    for (const name of routeKey.split(',')) m[name] = new Animated.Value(0);
    return m;
  }, [routeKey]);

  useEffect(() => {
    if (row.w <= 0 || focusedIndex < 0 || !focusedName) return;

    const geo = tabPillGeometry(focusedIndex, row.w, routes.length, GAP, FOCUSED_FLEX);

    // No travel before the Reduce Motion state resolves, and none for the first
    // placement — a pill sliding in from the row's left edge on launch is an
    // entrance nobody asked for, not continuity.
    const instant = !didPlace.current || !motionReady;
    const ms = instant ? 0 : animationDuration(TRAVEL_MS, reduceMotion);

    if (ms === 0) {
      left.setValue(geo.left);
      width.setValue(geo.width);
      for (const [name, value] of Object.entries(fillOpacity)) {
        value.setValue(name === focusedName ? 1 : 0);
      }
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
      ...Object.entries(fillOpacity).map(([name, value]) =>
        Animated.timing(value, {
          toValue: name === focusedName ? 1 : 0,
          duration: ms,
          easing: EASE,
          useNativeDriver: true,
        }),
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [
    focusedIndex,
    focusedName,
    row.w,
    reduceMotion,
    motionReady,
    fillOpacity,
    routes.length,
    left,
    width,
  ]);

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
              // bar is correct at 320pt and at 440pt with no breakpoint, and a
              // fixed width here is the two-column row that could not fit past
              // ~1.3x Dynamic Type, in a new place.
              style={[styles.item, focused && styles.itemOn]}
            >
              {/* Just the resting glyph. The selected tab's ink glyph and its
                  label ride the moving pill drawn on top, which covers this one
                  when it arrives. Both halves of the grouping fix stay: the
                  Pressable already names itself, so its glyph must not be
                  reachable as its own stop. */}
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.itemBody}
              >
                <MaterialCommunityIcons
                  name={ICONS[route.name] ?? 'account'}
                  size={ICON_SIZE}
                  color={ramp.neutral[600]}
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
            {routes.map((route) => (
              <Animated.View
                key={route.key}
                style={[
                  StyleSheet.absoluteFill,
                  styles.pillFill,
                  { opacity: fillOpacity[route.name] },
                ]}
              >
                <Gradient
                  stops={FILLS[route.name] ?? TODAY_FILL}
                  // 10 bands across ~85pt. The ramp is between two neighbouring
                  // hues and the pill is short; more is invisible and costs a
                  // view per band on a surface that repaints on every tap.
                  steps={10}
                  style={styles.pillFill}
                />
              </Animated.View>
            ))}
            {/* **Ink on the fill, never cream.** Every one of these gradients
                is a bright fill, and cream on the lightest of them measures
                1.67:1 — invisible, while rendering perfectly. That is
                `colors.accent`'s own trap one surface over, and the palette's
                standing answer applies: a bright fill takes ink. The design
                draws these labels white; on these hues that is not a style
                choice this app can make. */}
            <View style={styles.pillBody}>
              <MaterialCommunityIcons
                name={ICONS[focusedName] ?? 'account'}
                size={ICON_SIZE}
                color={colors.text}
              />
              {/* `numberOfLines={1}` and `flexShrink` so that at the 1.4x cap
                  the word truncates rather than pushing the glyph out of its
                  own pill. */}
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

const styles = StyleSheet.create({
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Clips the banded fills to the pill. Safe here where it is not safe on
    // `Panel`: this view carries no shadow of its own, so there is no Android
    // elevation for the clip to eat.
    overflow: 'hidden',
  },
  pillFill: { borderRadius: PILL_RADIUS, borderCurve: 'continuous' },
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
  label: { ...font.display.label, color: colors.text, flexShrink: 1 },
});

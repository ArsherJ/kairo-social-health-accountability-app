import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, font, radius, ramp, space } from '../theme.ts';
import { useChromeStore } from './chrome.ts';
import { Glass } from './Glass.tsx';
import { Gradient } from './Gradient.tsx';
import type { Stop } from './gradient.ts';
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
 * on every navigation.
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
    <Glass
      tone="light"
      style={[
        styles.bar,
        { bottom: insets.bottom + space.sm, left: BAR_INSET, right: BAR_INSET },
      ]}
    >
      <View accessibilityRole="tablist" style={styles.row}>
        {routes.map((route) => {
          const focused = state.routes[state.index]?.key === route.key;
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
              {focused && (
                <Gradient
                  stops={FILLS[route.name] ?? TODAY_FILL}
                  // 10 bands across 58pt. The ramp is between two neighbouring
                  // hues and the pill is short; more is invisible and costs a
                  // view per band on a surface that repaints on every tap.
                  steps={10}
                  style={styles.fill}
                />
              )}
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
                {/* **Ink on the fill, never cream.** Every one of these
                    gradients is a bright fill, and cream on the lightest of
                    them measures 1.67:1 — invisible, while rendering
                    perfectly. That is `colors.accent`'s own trap one surface
                    over, and the palette's standing answer applies: a bright
                    fill takes ink. The design draws these labels white; on
                    these hues that is not a style choice this app can make. */}
                <MaterialCommunityIcons
                  name={ICONS[route.name] ?? 'account'}
                  size={ICON_SIZE}
                  color={focused ? colors.text : ramp.neutral[600]}
                />
                {/*
                  Painted on the selected tab alone. `numberOfLines={1}` and
                  `flexShrink` so that at the 1.4x cap the word truncates rather
                  than pushing the glyph out of its own pill.
                */}
                {focused && (
                  <Text scale="chrome" numberOfLines={1} style={styles.label}>
                    {label}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
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
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  item: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    borderCurve: 'continuous',
    // Clips the banded fill to the pill. Safe here where it is not safe on
    // `Panel`: this view carries no shadow of its own, so there is no Android
    // elevation for the clip to eat.
    overflow: 'hidden',
  },
  itemOn: { flex: 1.5 },
  fill: { borderRadius: 26, borderCurve: 'continuous' },
  itemBody: {
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

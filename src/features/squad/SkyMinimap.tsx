import { useMemo, useRef, type MutableRefObject } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { radius, type Theme } from '@/theme.ts';
import { useStyles } from '@/ui/use-theme.ts';
import {
  MINIMAP_WIDTH,
  mapPoint,
  miniRacers,
  offsetForMapY,
  viewportWindow,
  type MinimapGeometry,
} from './minimap.ts';
import { skyFlightPoint, type SkyFlightPlacement } from './sky-flight.ts';

/**
 * The whole flight, in a strip on the right edge (deviation #72).
 *
 * The corridor is four screens tall and the reader sees one of them. This is
 * the other three: every bird at its straight-flight rest position, the ridge
 * as a tick, and a window over the part of the flight the screen is showing. It is
 * **scrubbable** — a touch or a drag on the strip scrolls the flight to that
 * point — which is what makes it a map rather than a decoration.
 *
 * The window follows the scroll on the UI thread: the screen hands in the
 * `Animated.Value` it drives from `onScroll` and the window's `translateY` is
 * an interpolation of it, so a fast fling never leaves the window behind the
 * corridor. The mapping is `viewportWindow`'s, restated as an interpolation
 * because that function's clamp is exactly what `extrapolate: 'clamp'` does.
 *
 * Every position here comes from `minimap.ts`, which is tested against the
 * same `flightFrame` numbers the corridor is drawn with. This file paints.
 *
 * **One accessibility element**, adjustable: VoiceOver reads how many are on
 * the corridor and swipes scroll the flight by half a screen. The dots say
 * nothing of their own — every bird already names itself on the corridor.
 */
export function SkyMinimap({
  geometry,
  placements,
  selfIndex,
  ghostIndexes,
  selfProgress,
  scrollY,
  offsetRef,
  onScrollTo,
  style,
}: {
  geometry: MinimapGeometry;
  placements: readonly SkyFlightPlacement[];
  /** Which placement is the reader's own bird, or null with none. */
  selfIndex: number | null;
  /** Placements that are ghosts of the reader's own past days. */
  ghostIndexes: readonly number[];
  /** Retained interface input; progress is already represented by the self dot. */
  selfProgress: number | null;
  /** The scroller's live offset, driven natively. */
  scrollY: Animated.Value;
  /** The last offset the scroller reported, for the accessibility actions. */
  offsetRef: MutableRefObject<number>;
  onScrollTo: (offset: number) => void;
  style?: { top: number; right: number };
}) {
  const styles = useStyles(makeStyles);

  const birds = useMemo(() => miniRacers(geometry, placements), [geometry, placements]);
  const windowAtTop = viewportWindow(geometry, 0);
  const furthest = Math.max(0, geometry.contentHeight - geometry.viewportHeight);
  const windowTravel = Math.max(0, geometry.mapHeight - windowAtTop.height);

  // `inputRange` has to increase, so a flight shorter than the screen — where
  // nothing scrolls — maps [0, 1] to a window that does not move.
  const translateY = scrollY.interpolate({
    inputRange: [0, furthest > 0 ? furthest : 1],
    outputRange: [0, furthest > 0 ? windowTravel : 0],
    extrapolate: 'clamp',
  });

  // A touch anywhere on the strip is a scrub. `locationY` is relative to the
  // responder view, which is this strip, for the grant and every move after.
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => onScrollTo(offsetForMapY(geometryRef.current, e.nativeEvent.locationY)),
      onPanResponderMove: (e) => onScrollTo(offsetForMapY(geometryRef.current, e.nativeEvent.locationY)),
    }),
  ).current;

  const ridge = skyFlightPoint(1);
  const ridgeY = mapPoint(geometry, ridge.x, ridge.y).y;

  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Flight map. ${placements.length} on the corridor. Swipe to scroll the flight.`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const step = geometry.viewportHeight / 2;
        const next =
          e.nativeEvent.actionName === 'increment'
            ? offsetRef.current - step
            : offsetRef.current + step;
        onScrollTo(Math.min(furthest, Math.max(0, next)));
      }}
      style={[styles.strip, { height: geometry.mapHeight }, style]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        {/* The ridge, at the top of the climb. */}
        <View style={[styles.ridge, { top: ridgeY - 1 }]} />

        {/* Bird dots report the same straight projection as the full flight. */}
        {birds.map((b, i) => {
          const self = i === selfIndex;
          const ghost = ghostIndexes.includes(i);
          return (
            <View
              key={i}
              style={[
                styles.bird,
                self ? styles.birdSelf : ghost ? styles.birdGhost : null,
                { left: b.x - (self ? 5 : 3.5), top: b.y - (self ? 5 : 3.5) },
              ]}
            />
          );
        })}

        {/* The window — where the screen is looking. */}
        <Animated.View
          style={[
            styles.window,
            { height: windowAtTop.height, transform: [{ translateY }] },
          ]}
        />
      </View>
    </View>
  );
}

const makeStyles = ({ colors, earnedColor, ramp }: Theme) =>
  StyleSheet.create({
    strip: {
      position: 'absolute',
      width: MINIMAP_WIDTH,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      backgroundColor: colors.surfaceLift,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderStrong,
      overflow: 'hidden',
    },
    ridge: {
      position: 'absolute',
      left: 6,
      right: 6,
      height: 2,
      borderRadius: 1,
      borderCurve: 'continuous',
      backgroundColor: earnedColor,
    },
    bird: {
      position: 'absolute',
      width: 7,
      height: 7,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      backgroundColor: colors.subtle,
    },
    birdSelf: {
      width: 10,
      height: 10,
      backgroundColor: colors.accent,
      borderWidth: 2,
      borderColor: colors.ink,
    },
    birdGhost: { opacity: 0.45 },
    window: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1.5,
      borderColor: ramp.sky[800],
    },
  });

import { useMemo, useRef, type MutableRefObject } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import type { Placement } from '@kairo/core';
import { radius, type Theme } from '@/theme.ts';
import { useStyles } from '@/ui/use-theme.ts';
import {
  MINIMAP_WIDTH,
  miniPath,
  miniRacers,
  offsetForMapY,
  viewportWindow,
  type MinimapGeometry,
} from './minimap.ts';

/**
 * The whole flight, in a strip on the right edge (deviation #72).
 *
 * The corridor is four screens tall and the reader sees one of them. This is
 * the other three: the path in miniature, every bird as a dot, the ridge as a
 * tick, and a window over the part of the flight the screen is showing. It is
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
  placements: readonly Placement[];
  /** Which placement is the reader's own bird, or null with none. */
  selfIndex: number | null;
  /** Placements that are ghosts of the reader's own past days. */
  ghostIndexes: readonly number[];
  /** The reader's own progress 0–1, so the trail behind them is painted. */
  selfProgress: number | null;
  /** The scroller's live offset, driven natively. */
  scrollY: Animated.Value;
  /** The last offset the scroller reported, for the accessibility actions. */
  offsetRef: MutableRefObject<number>;
  onScrollTo: (offset: number) => void;
  style?: { top: number; right: number };
}) {
  const styles = useStyles(makeStyles);

  const path = useMemo(() => miniPath(geometry), [geometry]);
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

  const ridgeY = path[path.length - 1]?.y ?? 0;
  const flownCount =
    selfProgress === null ? 0 : Math.round(Math.min(1, Math.max(0, selfProgress)) * (path.length - 1));

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

        {/* The path as a dotted trail. Dots behind the reader's own bird take
            the accent — the same "flown" paint the corridor itself carries. */}
        {path.map((p, i) => (
          <View
            key={i}
            style={[
              styles.pathDot,
              i <= flownCount ? styles.pathDotFlown : null,
              { left: p.x - 1.5, top: p.y - 1.5 },
            ]}
          />
        ))}

        {/* The birds. Drawn after the path so they sit on it. */}
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
    pathDot: {
      position: 'absolute',
      width: 3,
      height: 3,
      borderRadius: 1.5,
      borderCurve: 'continuous',
      backgroundColor: ramp.neutral[400],
    },
    pathDotFlown: { backgroundColor: colors.accent },
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

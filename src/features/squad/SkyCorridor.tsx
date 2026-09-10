import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SKY_PATH_ASPECT, angleAt, pointAt } from '@kairo/core';
import type { Theme } from '@/theme.ts';
import { useStyles } from '@/ui/use-theme.ts';

/**
 * The shared lane everybody flies (roadmap deviation #56).
 *
 * **Drawn without `react-native-svg`, deliberately.** That library would
 * render this path in one element and was rejected on cost, not on taste: it
 * is a native module, so it moves the EAS fingerprint, spends one of the
 * month's fifteen builds and withholds every OTA update until that build
 * lands. So the band is `SEGMENTS` short rounded views, each positioned at a
 * point on the curve and rotated to its tangent, overlapping into a
 * continuous stroke.
 *
 * **The path is painted by the reader's own steps** (deviation #72). The
 * segments behind their bird take the accent — the part of the flight they
 * have flown — and the segments ahead stay a wash of air. That makes the
 * corridor answer "how far have I come" at a glance, which six equal segments
 * of one colour never did, and it is the same fact the Motion tile's meter
 * states on Today: `progress` is `raceProgress(steps)`, capped at the line.
 *
 * The geometry is `@kairo/core`'s and none of it is computed here.
 */

/**
 * How many pieces the band is cut into. Forty-eight, so the curve reads as a
 * curve on every bend across a box four times the screen's height.
 */
const SEGMENTS = 48;

/**
 * The corridor's width, as a fraction of the box's **width** — the design's
 * `stroke-width: 34` in a 393-wide viewBox.
 */
const BAND = 34 / 393;

export function SkyCorridor({
  width,
  progress = null,
  children,
}: {
  width: number;
  /** The reader's own progress along the flight, 0–1, or null with no bird. */
  progress?: number | null;
  children?: ReactNode;
}) {
  const styles = useStyles(makeStyles);
  const height = width / SKY_PATH_ASPECT;
  const band = width * BAND;

  // One extra so the last segment reaches the end rather than stopping a
  // step short of it.
  const steps = Array.from({ length: SEGMENTS + 1 }, (_, i) => i / SEGMENTS);

  // Segment length, plus a little, so consecutive pieces overlap instead of
  // leaving a gap on the outside of a bend. Measured off the path rather than
  // approximated from the box.
  const points = steps.map((t) => pointAt(t));
  const pathLength = points.reduce((total, p, i) => {
    if (i === 0) return 0;
    const prev = points[i - 1] as { x: number; y: number };
    return total + Math.hypot((p.x - prev.x) * width, (p.y - prev.y) * height);
  }, 0);
  const segmentLength = (pathLength / SEGMENTS) * 1.6;

  const flownTo = progress === null ? -1 : Math.min(1, Math.max(0, progress));

  return (
    // The corridor says nothing on its own — the markers inside it carry every
    // word. Hidden rather than labelled.
    <View style={[styles.box, { width, height }]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        {steps.map((t, i) => {
          const p = points[i] as { x: number; y: number };
          return (
            <View
              key={t}
              style={[
                styles.segment,
                t <= flownTo && styles.flown,
                {
                  left: p.x * width - segmentLength / 2,
                  top: p.y * height - band / 2,
                  width: segmentLength,
                  height: band,
                  borderRadius: band / 2,
                  transform: [{ rotate: `${angleAt(t)}deg` }],
                },
              ]}
            />
          );
        })}

        {/* The ridge, at the top of the climb: a rule across the direction of
            travel, in gold because it is earned. It names nothing here; the
            screen's own ridge marker says what the line is, once. */}
        <View
          style={[
            styles.flag,
            {
              left: pointAt(1).x * width - band,
              top: pointAt(1).y * height,
              width: band * 2,
            },
          ]}
        />
      </View>

      {children}
    </View>
  );
}

const makeStyles = ({ colors, earnedColor, scheme }: Theme) =>
  StyleSheet.create({
    box: { alignSelf: 'center' },
    segment: {
      position: 'absolute',
      // A wash rather than a fill: the corridor is air, and the birds have to
      // read against it.
      backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.5)',
    },
    // Flown: the accent, held just off full so the birds still lead.
    flown: { backgroundColor: colors.accent, opacity: 0.85 },
    flag: {
      position: 'absolute',
      height: 3,
      borderRadius: 2,
      backgroundColor: earnedColor,
    },
  });

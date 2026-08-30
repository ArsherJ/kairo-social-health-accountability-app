import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SKY_PATH_ASPECT, angleAt, pointAt } from '@kairo/core';
import { colors } from '@/theme.ts';

/**
 * The shared lane everybody flies (roadmap deviation #56).
 *
 * **Drawn without `react-native-svg`, deliberately.** That library would render
 * this path in one element and was rejected on cost, not on taste: it is a
 * native module, so it moves the EAS fingerprint, spends one of the month's
 * fifteen builds and withholds every OTA update until that build lands. The
 * whole redesign is otherwise shippable over the air and that is worth more
 * than one element.
 *
 * So the band is `SEGMENTS` short rounded views, each positioned at a point on
 * the curve and rotated to its tangent. With a radius of half the band's width
 * they overlap into a continuous stroke — the same trick the finish line used
 * when the race was six lanes, where abutting segments read as one rule.
 *
 * The geometry is `@kairo/core`'s and none of it is computed here. This file
 * owns paint and nothing else.
 */

/**
 * How many pieces the band is cut into.
 *
 * Forty-eight, up from the horizontal corridor's twenty-four. The path is four
 * times as long in points now — the box is taller than the screen and is
 * scrolled — so the old count put ~58pt between joins and the curve read as a
 * polygon on every bend. This is still views-for-a-line and still far cheaper
 * than the native module that would draw it in one.
 */
const SEGMENTS = 48;

/**
 * The corridor's width, as a fraction of the box's **width**.
 *
 * Against width and not height, which is the correction the vertical re-cut
 * forced: the old constant was `0.11` of the *height*, which was the narrow
 * axis while the corridor ran left to right and is the long one now. Left
 * alone it drew a 158pt band down a 361pt-wide screen. The design's own figure
 * is `stroke-width: 34` in a 393-wide viewBox.
 */
const BAND = 34 / 393;

export function SkyCorridor({ width, children }: { width: number; children?: ReactNode }) {
  const height = width / SKY_PATH_ASPECT;
  const band = width * BAND;

  // One extra so the last segment reaches the end rather than stopping a
  // step short of it.
  const steps = Array.from({ length: SEGMENTS + 1 }, (_, i) => i / SEGMENTS);

  // Segment length, plus a little, so consecutive pieces overlap instead of
  // leaving a gap on the outside of a bend.
  //
  // Measured off the path rather than approximated from the box, which is what
  // the horizontal version did (`height / SKY_PATH_ASPECT / SEGMENTS`) and what
  // silently stopped being right when the aspect inverted. Summing the sampled
  // chords costs one pass over `SEGMENTS + 1` points and is correct for any
  // path this module is ever pointed at.
  const points = steps.map((t) => pointAt(t));
  const pathLength = points.reduce((total, p, i) => {
    if (i === 0) return 0;
    const prev = points[i - 1] as { x: number; y: number };
    return total + Math.hypot((p.x - prev.x) * width, (p.y - prev.y) * height);
  }, 0);
  const segmentLength = (pathLength / SEGMENTS) * 1.6;

  return (
    // The corridor says nothing on its own — the markers inside it carry every
    // word. Hidden rather than labelled, the same disposition `StatIcon` takes
    // for a glyph whose meaning is in the text beside it.
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

        {/* The ridge, at the top of the climb. A horizontal rule now rather
            than the vertical post the left-to-right corridor carried — a
            finish line crosses the direction of travel, and the direction of
            travel changed.

            It names nothing here. The screen's own ridge marker says what the
            line is, once, rather than labelling it in the picture where it
            would compete with the birds. */}
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

const styles = StyleSheet.create({
  box: { alignSelf: 'center' },
  segment: {
    position: 'absolute',
    // A wash rather than a fill: the corridor is air, and the birds have to
    // read against it. White at low alpha over the sky field is what the
    // design draws.
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  flag: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
});

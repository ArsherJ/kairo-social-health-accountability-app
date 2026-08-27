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
 * Twenty-four is where the joins stop being visible at phone widths. Fewer and
 * the curve reads as a polygon on the tighter bend near the start; many more
 * and it is views for nothing.
 */
const SEGMENTS = 24;

/** The corridor's width, as a fraction of the box's height. */
const BAND = 0.11;

export function SkyCorridor({ width, children }: { width: number; children?: ReactNode }) {
  const height = width / SKY_PATH_ASPECT;
  const band = height * BAND;

  // One extra so the last segment reaches the end rather than stopping a
  // step short of it.
  const steps = Array.from({ length: SEGMENTS + 1 }, (_, i) => i / SEGMENTS);

  // Segment length, plus a little, so consecutive pieces overlap instead of
  // leaving a gap on the outside of a bend.
  const segmentLength = (height / SKY_PATH_ASPECT / SEGMENTS) * 1.6;

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
        {steps.map((t) => {
          const p = pointAt(t);
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

        {/* The flag, at the end of the corridor. It names nothing here — the
            standing card below the track says what the line is, once, rather
            than labelling it in the picture where it would compete with the
            birds. */}
        <View
          style={[
            styles.flag,
            {
              left: pointAt(1).x * width,
              top: pointAt(1).y * height - band,
              height: band * 2,
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
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.text,
  },
});

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ramp } from '../theme.ts';
import { ringArcs } from './ring.ts';

/**
 * A circular progress arc, built from two rotating half-rings.
 *
 * No SVG library is installed, and this app needs exactly one arc — the XP
 * ring on the You tab. A native module (and the prebuild it drags along) is a
 * heavy price for one ring that clipped views render identically, which is the
 * same trade `Gradient` already made for the diorama's sky.
 *
 * The maths lives in `ring.ts` so it is settled in Node rather than by
 * squinting at a simulator. This file is only the views around it.
 *
 * `children` sit inside the ring, so the avatar it wraps is a child rather
 * than a sibling this has to be positioned against.
 */
export function ProgressRing({
  fraction,
  size,
  thickness = 5,
  color = ramp.accent[500],
  track = ramp.neutral[200],
  children,
}: {
  /** 0–1. Clamped by `ringArcs`, so a bad value reads empty, never backwards. */
  fraction: number;
  size: number;
  thickness?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const arcs = ringArcs(fraction);
  const half = size / 2;

  // Each half-ring is a full-height, half-width view with the border drawn on
  // three sides and the outer corners rounded — a semicircular arc of exactly
  // `thickness`. Its straight edge sits on the ring's centre line, which is
  // also its rotation origin.
  const arc = {
    width: half,
    height: size,
    borderWidth: thickness,
    borderColor: color,
  } as const;

  return (
    <View
      style={[styles.frame, { width: size, height: size }]}
      // The arc restates the figures printed beside it, so a screen reader
      // announcing it too would just read the level twice.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderWidth: thickness, borderColor: track, borderRadius: half },
        ]}
      />

      {/* Right half — the first 180° of sweep, twelve o'clock to six. */}
      <View style={[styles.mask, { width: half, height: size, left: half }]}>
        <View
          style={[
            arc,
            {
              borderLeftWidth: 0,
              borderTopRightRadius: half,
              borderBottomRightRadius: half,
              transformOrigin: 'left center',
              transform: [{ rotate: `${arcs.right}deg` }],
            },
          ]}
        />
      </View>

      {/* Left half — six o'clock back round to twelve. */}
      <View style={[styles.mask, { width: half, height: size, left: 0 }]}>
        <View
          style={[
            arc,
            {
              borderRightWidth: 0,
              borderTopLeftRadius: half,
              borderBottomLeftRadius: half,
              transformOrigin: 'right center',
              transform: [{ rotate: `${arcs.left}deg` }],
            },
          ]}
        />
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
  // The clip is what turns a rotating half-ring into a partial arc: past its
  // own half of the circle, the shape is simply not drawn.
  mask: { position: 'absolute', top: 0, overflow: 'hidden' },
});

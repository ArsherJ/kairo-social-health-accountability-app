import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { ringArcs } from './ring.ts';
import { useTheme } from './use-theme.ts';

/**
 * A circular progress arc, built from two rotating half-rings.
 *
 * No SVG library is installed and none is coming — a native module moves the
 * fingerprint. Two clipped views render this identically. The maths lives in
 * `ring.ts` so it is settled in Node.
 */
export function ProgressRing({
  fraction,
  size,
  thickness = 5,
  color,
  track,
  children,
}: {
  /** 0–1. Clamped by `ringArcs`, so a bad value reads empty, never backwards. */
  fraction: number;
  size: number;
  thickness?: number;
  /** Defaults to the accent fill. */
  color?: string;
  /** Defaults to the quiet neutral wash. */
  track?: string;
  children?: ReactNode;
}) {
  const { colors, ramp } = useTheme();
  const arcColor = color ?? colors.accent;
  const trackColor = track ?? ramp.neutral[200];
  const arcs = ringArcs(fraction);
  const half = size / 2;

  const arc = {
    width: half,
    height: size,
    borderWidth: thickness,
    borderColor: arcColor,
  } as const;

  return (
    <View
      style={[styles.frame, { width: size, height: size }]}
      // The arc restates the figures printed beside it.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { borderWidth: thickness, borderColor: trackColor, borderRadius: half },
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
  mask: { position: 'absolute', top: 0, overflow: 'hidden' },
});

/**
 * The angle maths behind `ProgressRing`, split out the way `gradient.ts` was
 * split from `Gradient.tsx` — so the one part that can be silently wrong is
 * testable in plain Node.
 *
 * There is no SVG in this app (no `react-native-svg`, deliberately), so an arc
 * is built from two half-rings, each inside a half-width `overflow: 'hidden'`
 * mask. Each half-ring in its resting position exactly fills its own mask;
 * rotating it about the ring's centre slides it out of view. Rotate by −180°
 * and it lands entirely inside the *other* half's mask, so nothing shows.
 *
 * Angles are compass-style: 0° at twelve o'clock, increasing clockwise, which
 * is the direction the arc fills. The right mask therefore owns 0°–180° and
 * the left mask owns 180°–360°.
 */

export type RingArcs = {
  /** Degrees to rotate the right half-ring. Always in [-180, 0]. */
  right: number;
  /** Degrees to rotate the left half-ring. Always in [-180, 0]. */
  left: number;
};

/**
 * Where to point each half-ring for a given fill.
 *
 * Both halves rest at −180° (fully clipped) and reach 0° (fully shown), so the
 * right half sweeps across the first 50% and the left half across the second.
 *
 * `total_xp` is a trigger-maintained rollup and should never produce a
 * fraction outside [0, 1], but a ring that renders backwards is a worse
 * failure than one that reads empty — so nonsense clamps rather than throws,
 * matching `xpProgress`.
 */
export function ringArcs(fraction: number): RingArcs {
  const safe = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const swept = safe * 360;

  return {
    right: Math.min(swept, 180) - 180,
    left: Math.min(Math.max(swept - 180, 0), 180) - 180,
  };
}

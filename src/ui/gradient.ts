/**
 * Colour ramps for `<Gradient>`, which paints a gradient as a stack of solid
 * bands because no gradient library is installed and the redesign needs
 * exactly two of them (the diorama's sage sky, and its fade down to cream).
 *
 * Pure and clock-free like everything worth testing in this app: it takes
 * stops and a band count and returns the band colours, so the awkward cases —
 * an alpha ramp, an out-of-order stop, a single band — are settled in Node
 * rather than by squinting at a simulator.
 *
 * sRGB interpolation, deliberately. OKLCH would be more correct for wide
 * hue sweeps, but every ramp here runs between two neighbouring steps of one
 * family, where the two are indistinguishable — and the ramps in `theme.ts`
 * were already generated in OKLCH, so the endpoints carry that work.
 */

export interface Stop {
  /** `#rgb`, `#rrggbb`, or `#rrggbbaa`. */
  color: string;
  /** Position along the ramp, 0–1. Clamped, and sorted on the way in. */
  at: number;
}

type Rgba = [number, number, number, number];

function parse(color: string): Rgba {
  const hex = color.replace('#', '');

  if (hex.length === 3) {
    const digit = (i: number) => parseInt(hex.charAt(i) + hex.charAt(i), 16);
    return [digit(0), digit(1), digit(2), 255];
  }
  if (hex.length === 6 || hex.length === 8) {
    const pair = (i: number) => parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return [pair(0), pair(1), pair(2), hex.length === 8 ? pair(3) : 255];
  }

  throw new Error(`Not a hex colour: ${color}`);
}

function format([r, g, b, a]: Rgba): string {
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  // Always eight digits. A six-digit result would be indistinguishable from an
  // opaque band when the ramp is mid-fade, and RN treats both as valid, so the
  // bug would only show up on screen.
  return `#${hex(r)}${hex(g)}${hex(b)}${hex(a)}`;
}

function lerp(a: Rgba, b: Rgba, t: number): Rgba {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

/**
 * The colour of each band, from the first stop to the last.
 *
 * Bands are sampled at their *centre*, not their leading edge: sampling at the
 * edge would render the final stop's colour nowhere, so a fade to cream would
 * stop one band short of the background and leave a visible seam.
 */
export function rampColors(stops: Stop[], steps: number): string[] {
  if (stops.length === 0) throw new Error('A ramp needs at least one stop.');
  if (steps < 1) return [];

  const sorted = [...stops]
    .map((s) => ({ rgba: parse(s.color), at: Math.min(1, Math.max(0, s.at)) }))
    .sort((a, b) => a.at - b.at);

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  if (sorted.length === 1 || steps === 1) {
    return Array.from({ length: steps }, () => format(first.rgba));
  }

  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 0.5) / steps;

    // Before the first stop and after the last one, the ramp holds rather
    // than extrapolating — a stop set that does not span 0–1 is a designer
    // saying "flat here", not an invitation to invent colours past the ends.
    const next = sorted.findIndex((s) => s.at >= t);
    if (next === -1) return format(last.rgba);
    if (next === 0) return format(first.rgba);

    const lo = sorted[next - 1]!;
    const hi = sorted[next]!;
    // Two stops at the same position are a hard edge, not a division by zero.
    const span = hi.at - lo.at;
    return format(lerp(lo.rgba, hi.rgba, span === 0 ? 1 : (t - lo.at) / span));
  });
}

/**
 * The sky corridor's geometry (roadmap deviation #56; re-cut vertical by #58).
 *
 * The daily race is drawn as one shared lane everybody flies rather than as six
 * parallel bars. The path is the design's own, transcribed from
 * `Kairo Playful.dc.html` screen 4a:
 *
 *     viewBox="0 0 393 1560"
 *     d="M196 1420 C 120 1250, 268 1120, 188 960 S 118 700, 210 560 S 246 300, 196 150"
 *
 * **The corridor climbs now, where it used to run left to right.** That is the
 * substantive change in this re-cut, and it is why the box went from 402x520 to
 * 393x1560: the race is no longer a strip you take in at a glance but a flight
 * you *scroll*, from the ground at midnight to the ridge at the top. Nothing
 * about the race's mechanics moved with it — same payload, same client-side
 * re-rank by capped steps, same derived finish line, same reciprocal consent
 * gate. Only the shape of the drawing did.
 *
 * Three cubic segments. Each `S` command's first control point is the
 * reflection of the previous segment's second control point about the join —
 * `(108, 800)` and `(302, 420)` — and getting a reflection wrong produces a
 * visible kink that nothing else catches, which is why a test asserts
 * continuity at both joins.
 *
 * **Why this is in the keystone rather than in the component.** Two renderings
 * read it (the band and the markers), a third will if the race ever appears in
 * a digest image, and the thing two renderings must agree about does not live
 * inside one of them — the same call `pooledDays()` records. It is also the
 * only way this arithmetic gets tested: a component reaching React Native
 * cannot be loaded by root Vitest at all.
 *
 * Pure, zero-dependency, no clock reads, no randomness, like everything else in
 * this package. All coordinates are **normalised 0–1** in both axes, with `y`
 * growing downward as it does in the SVG this came from and in React Native's
 * layout. The component multiplies by its own measured box.
 *
 * **No step count appears here and none may.** The corridor knows about
 * progress, never about `RACE_FINISH_LINE` — the race is clear of the
 * `AGI`/`AGI_base` trap because it reads raw steps and never a tier, and this
 * module is one layer further removed than that.
 */

const VIEW_W = 393;
const VIEW_H = 1560;

/** Width ÷ height of the drawing box, so a component can size itself. */
export const SKY_PATH_ASPECT = VIEW_W / VIEW_H;

interface Point {
  x: number;
  y: number;
}

/** One cubic segment: start, two controls, end. Normalised at module load. */
type Cubic = readonly [Point, Point, Point, Point];

function n(x: number, y: number): Point {
  return { x: x / VIEW_W, y: y / VIEW_H };
}

const CURVES: readonly Cubic[] = [
  [n(196, 1420), n(120, 1250), n(268, 1120), n(188, 960)],
  // (108, 800) is the reflection of (268, 1120) about the join at (188, 960),
  // which is what the `S` command means. Written out rather than computed so
  // the constant is greppable against the design's path string.
  [n(188, 960), n(108, 800), n(118, 700), n(210, 560)],
  // (302, 420) is the reflection of (118, 700) about the join at (210, 560).
  [n(210, 560), n(302, 420), n(246, 300), n(196, 150)],
];

function cubicAt(c: Cubic, u: number): Point {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const d = 3 * v * u * u;
  const e = u * u * u;
  return {
    x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
  };
}

/**
 * The arc-length table, built once at module load.
 *
 * `t` has to mean *distance along the path*, not "which Bézier parameter" —
 * otherwise the second curve runs visibly faster than the first, and two
 * racers a thousand steps apart appear a different distance apart depending on
 * where they are. A race picture that does that is worse than no picture.
 *
 * 512 samples across all three curves puts the interpolation error well under
 * a pixel at any phone width, and the table is 512 floats built once.
 */
const SAMPLES = 512;

interface Sample {
  point: Point;
  /** Cumulative distance from the start, normalised units. */
  length: number;
}

const TABLE: readonly Sample[] = (() => {
  const out: Sample[] = [];
  let total = 0;
  let prev: Point | null = null;

  for (let i = 0; i <= SAMPLES; i++) {
    const global = i / SAMPLES;
    // Each curve takes an equal share of the parameter space before arc-length
    // correction. `Math.min` keeps the last sample on the final curve rather
    // than indexing past the end.
    const which = Math.min(CURVES.length - 1, Math.floor(global * CURVES.length));
    const local = global * CURVES.length - which;
    const point = cubicAt(CURVES[which] as Cubic, Math.min(1, local));

    if (prev !== null) total += Math.hypot(point.x - prev.x, point.y - prev.y);
    out.push({ point, length: total });
    prev = point;
  }

  return out;
})();

const TOTAL_LENGTH = TABLE[TABLE.length - 1]?.length ?? 0;

function clamp01(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(1, Math.max(0, t));
}

/**
 * The point a fraction `t` **along the path**, normalised 0–1 in both axes.
 *
 * Clamped rather than extrapolated: a Bézier evaluated outside 0–1 puts a bird
 * off the picture, which reads as a rendering fault rather than as a very good
 * day.
 */
export function pointAt(t: number): Point {
  const target = clamp01(t) * TOTAL_LENGTH;

  // Linear scan rather than a binary search: 512 entries, called a handful of
  // times per render, and a scan is the version that is obviously correct.
  for (let i = 1; i < TABLE.length; i++) {
    const a = TABLE[i - 1] as Sample;
    const b = TABLE[i] as Sample;
    if (b.length < target) continue;

    const span = b.length - a.length;
    const u = span === 0 ? 0 : (target - a.length) / span;
    return {
      x: a.point.x + (b.point.x - a.point.x) * u,
      y: a.point.y + (b.point.y - a.point.y) * u,
    };
  }

  return { ...(TABLE[TABLE.length - 1] as Sample).point };
}

/** How far apart to sample when taking a numeric derivative. */
const EPSILON = 1 / 512;

/**
 * The unit tangent at `t` — which way the corridor is heading.
 *
 * Numeric rather than analytic, because `pointAt` is arc-length reparameterised
 * and the analytic derivative of the underlying Bézier is with respect to a
 * different parameter. Sampling the function that is actually drawn is both
 * simpler and correct by construction.
 */
export function tangentAt(t: number): { dx: number; dy: number } {
  const c = clamp01(t);
  const a = pointAt(Math.max(0, c - EPSILON));
  const b = pointAt(Math.min(1, c + EPSILON));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  // A degenerate sample would divide by zero; the path has no such point, and
  // pointing right is the harmless answer if one is ever introduced.
  if (length === 0) return { dx: 1, dy: 0 };
  return { dx: dx / length, dy: dy / length };
}

/**
 * The tangent as a rotation in **degrees**.
 *
 * Roughly -90 all the way along, because the corridor climbs and screen `y`
 * grows downward. It swings either side of vertical as the path weaves, which
 * is the whole visual character of the flight — but it never points *down*, and
 * a test asserts that: getting the sign wrong mirrors every segment of the band
 * and still renders.
 */
export function angleAt(t: number): number {
  const { dx, dy } = tangentAt(t);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export interface Placement {
  /** Normalised 0–1 across the drawing box, offset already applied. */
  x: number;
  y: number;
  /** Degrees. What to rotate a marker by to sit along the corridor. */
  angle: number;
  /**
   * The perpendicular displacement applied to separate a cluster, in
   * normalised units. Zero for the first racer at any position.
   *
   * Exposed rather than folded silently into `x`/`y` so a caller can draw a
   * leader line, and so the de-overlap is visible in a test.
   */
  offset: number;
}

/**
 * How close two racers must be, along the path, to count as overlapping.
 * Roughly the width of a marker.
 */
const MIN_SEPARATION = 0.06;

/** How far to push each successive member of a cluster off the line. */
const OFFSET_STEP = 0.055;

/**
 * Where each racer sits on the corridor, with ties pulled apart.
 *
 * **Ties are the common case, not an edge case.** `cappedSteps` stops at the
 * finish line, so two active people are tied on the primary key by
 * construction — CLAUDE.md says so, and the `user_id` tie-break in
 * `rankRacers` exists for the same reason. On six separate lanes that was
 * invisible. On one shared corridor it is two birds drawn on the same pixel.
 *
 * Pass progresses **in rank order**. The rule walks the list once and offsets
 * each racer by how many earlier racers are already within `MIN_SEPARATION`,
 * alternating sides so a cluster stays centred on the path rather than queueing
 * to one side of it. That makes it a pure function of the ranked input and
 * therefore stable across refetches: anything non-deterministic here makes the
 * picture twitch on every realtime broadcast.
 */
export function placeRacers(progress: readonly number[]): Placement[] {
  const ts = progress.map(clamp01);

  return ts.map((t, i) => {
    const cluster = ts.slice(0, i).filter((other) => Math.abs(other - t) < MIN_SEPARATION).length;

    // 0, then -1, +1, -2, +2, ... so the cluster stays centred on the line.
    const rank = Math.ceil(cluster / 2);
    const side = cluster === 0 ? 0 : cluster % 2 === 1 ? -1 : 1;
    const offset = side * rank * OFFSET_STEP;

    const base = pointAt(t);
    const { dx, dy } = tangentAt(t);
    // The normal is the tangent turned a quarter turn.
    return {
      x: base.x + -dy * offset,
      y: base.y + dx * offset,
      angle: angleAt(t),
      offset,
    };
  });
}

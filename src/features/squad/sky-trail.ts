/**
 * Project a normalized path angle into the corridor's physical drawing box.
 *
 * `angleAt` describes x and y in equal normalized units. The corridor renders
 * x at `width` and y at `width / aspect`, so its tangent's y component grows
 * by the same `1 / aspect` factor before a capsule is rotated.
 */
export function trailAngle(angle: number, aspect: number): number {
  const radians = (angle * Math.PI) / 180;
  return (Math.atan2(Math.sin(radians) / aspect, Math.cos(radians)) * 180) / Math.PI;
}

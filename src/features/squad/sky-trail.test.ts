import { describe, expect, it } from 'vitest';
import { SKY_PATH_ASPECT, angleAt, pointAt } from '@kairo/core';
import { trailAngle } from './sky-trail.ts';

const EPSILON = 1 / 512;

function renderedTangentAngle(t: number): number {
  const before = pointAt(Math.max(0, t - EPSILON));
  const after = pointAt(Math.min(1, t + EPSILON));
  const dx = after.x - before.x;
  const dy = (after.y - before.y) / SKY_PATH_ASPECT;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

describe('trailAngle', () => {
  it.each([0, 0.15, 1 / 3, 0.35, 0.65, 2 / 3, 0.85, 1])(
    'matches the rendered path tangent at t=%s',
    (t) => {
      expect(trailAngle(angleAt(t), SKY_PATH_ASPECT)).toBeCloseTo(renderedTangentAngle(t), 8);
    },
  );

  it.each([-90, 90])('leaves a vertical tangent at %s degrees vertical', (angle) => {
    expect(trailAngle(angle, SKY_PATH_ASPECT)).toBeCloseTo(angle, 10);
  });
});

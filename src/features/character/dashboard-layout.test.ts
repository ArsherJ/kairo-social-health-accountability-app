import { describe, expect, it } from 'vitest';
import { stackDashboard } from './dashboard-layout.ts';

describe('dashboard layout', () => {
  it.each([
    [320, 1, true],
    [369, 1, true],
    [370, 1, false],
    [393, 1.25, false],
    [393, 1.26, true],
    [440, 2, true],
  ] as const)('width %i at scale %f stacks: %s', (width, scale, expected) => {
    expect(stackDashboard(width, scale)).toBe(expected);
  });
});

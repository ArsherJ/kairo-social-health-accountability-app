import { describe, expect, it } from 'vitest';
import { shouldUpdateTimezone } from './timezone-rule.ts';

describe('shouldUpdateTimezone', () => {
  it('does nothing when the zone matches', () => {
    expect(shouldUpdateTimezone('Asia/Manila', 'Asia/Manila')).toBe(false);
  });

  it('updates when the user has travelled', () => {
    expect(shouldUpdateTimezone('Asia/Manila', 'Asia/Dubai')).toBe(true);
  });

  it('waits until the profile has loaded', () => {
    expect(shouldUpdateTimezone(undefined, 'Asia/Dubai')).toBe(false);
  });

  it('never overwrites a stored zone with an empty one', () => {
    // Intl can return an empty string on a misconfigured device. Writing that
    // would fail the profiles timezone trigger and, worse, is not information.
    expect(shouldUpdateTimezone('Asia/Manila', '')).toBe(false);
  });
});

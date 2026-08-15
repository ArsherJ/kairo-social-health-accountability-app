import { describe, expect, it } from 'vitest';
import { shouldFire, type Milestone } from './milestones.ts';

describe('shouldFire', () => {
  it('fires a milestone that has not been reached', () => {
    expect(shouldFire([], 'first_sync_seen')).toBe(true);
  });

  it('does not fire one already reached', () => {
    expect(shouldFire(['first_sync_seen'], 'first_sync_seen')).toBe(false);
  });

  it('treats milestones independently', () => {
    const reached: Milestone[] = ['first_sync_seen'];

    expect(shouldFire(reached, 'first_score_seen')).toBe(true);
  });
});

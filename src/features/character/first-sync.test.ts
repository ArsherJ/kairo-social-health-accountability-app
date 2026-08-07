import { describe, expect, it } from 'vitest';
import { firstSyncHeadline } from './first-sync.ts';

describe('firstSyncHeadline', () => {
  it('leads with steps and the stat they earned', () => {
    expect(
      firstSyncHeadline({
        steps: 4_300,
        points: { AGI: 500, STR: 0, END: 0, VIT: 200 },
        tiers: { AGI: 'silver', VIT: 'bronze' },
      }),
    ).toBe('Today already counted: 4,300 steps → AGI Silver.');
  });

  it('names the strongest stat, not the first one', () => {
    expect(
      firstSyncHeadline({
        steps: 900,
        points: { AGI: 200, STR: 900, END: 0, VIT: 0 },
        tiers: { AGI: 'bronze', STR: 'gold' },
      }),
    ).toBe('Today already counted: 900 steps → STR Gold.');
  });

  it('groups thousands, because 4300 does not read as a day’s walking', () => {
    expect(
      firstSyncHeadline({
        steps: 12_500,
        points: { AGI: 900, STR: 0, END: 0, VIT: 0 },
        tiers: { AGI: 'gold' },
      }),
    ).toContain('12,500 steps');
  });

  it('still says something when steps landed but no stat reached a tier', () => {
    // 120 steps is real data and a real moment — "we are receiving your
    // activity" — even though it earned nothing yet.
    expect(
      firstSyncHeadline({
        steps: 120,
        points: { AGI: 0, STR: 0, END: 0, VIT: 0 },
        tiers: {},
      }),
    ).toBe('Today already counted: 120 steps. Keep moving to earn your first tier.');
  });

  it('says nothing at all when the sync carried nothing', () => {
    // A callout celebrating zero would be the opposite of the moment.
    expect(
      firstSyncHeadline({
        steps: 0,
        points: { AGI: 0, STR: 0, END: 0, VIT: 0 },
        tiers: {},
      }),
    ).toBeNull();
  });

  it('celebrates a stat earned with no steps at all', () => {
    // A gym session is active calories, not steps. Leading with "0 steps"
    // would tell a lifter their workout did not count.
    expect(
      firstSyncHeadline({
        steps: 0,
        points: { AGI: 0, STR: 900, END: 0, VIT: 0 },
        tiers: { STR: 'gold' },
      }),
    ).toBe('Today already counted: STR Gold.');
  });

  it('ignores a stat with points but no tier recorded', () => {
    // tiers and points come from the same row, so a mismatch means the row is
    // malformed — better to fall back than to print "AGI undefined".
    expect(
      firstSyncHeadline({
        steps: 500,
        points: { AGI: 500, STR: 0, END: 0, VIT: 0 },
        tiers: {},
      }),
    ).toBe('Today already counted: 500 steps. Keep moving to earn your first tier.');
  });
});

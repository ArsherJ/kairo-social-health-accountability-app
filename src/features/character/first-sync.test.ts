import { describe, expect, it } from 'vitest';
import { firstSyncHeadline } from './first-sync.ts';

const statNames = {
  AGI: 'Agility',
  STR: 'Strength',
  MND: 'Mind',
};

describe('firstSyncHeadline', () => {
  it('leads with steps and names the stat they moved', () => {
    expect(
      firstSyncHeadline({
        steps: 4_300,
        points: { AGI: 500, STR: 0, MND: 0 },
        statNames,
      }),
    ).toBe('Today already counted: 4,300 steps, and your Agility went up.');
  });

  it('names the strongest stat, not the first one', () => {
    expect(
      firstSyncHeadline({
        steps: 900,
        points: { AGI: 200, STR: 900, MND: 0 },
        statNames,
      }),
    ).toBe('Today already counted: 900 steps, and your Strength went up.');
  });

  it('never speaks the point figure that decided the stat', () => {
    // Points still pick the winner internally — deviation #30 removed the
    // rendering, not the engine — and this is the one surface where a leak
    // would reach a reader who has never seen the app before.
    const headline = firstSyncHeadline({
      steps: 8_412,
      points: { AGI: 900, STR: 0, MND: 0 },
      statNames,
    });
    expect(headline).not.toContain('900');
    expect(headline).not.toContain('+');
    expect(headline).not.toContain('AGI');
  });

  it('groups thousands, because 4300 does not read as a day’s walking', () => {
    expect(
      firstSyncHeadline({
        steps: 12_500,
        points: { AGI: 900, STR: 0, MND: 0 },
        statNames,
      }),
    ).toContain('12,500 steps');
  });

  it('still says something when steps landed but nothing scored', () => {
    // 120 steps is real data and a real moment — "we are receiving your
    // activity" — even though it earned nothing yet.
    expect(
      firstSyncHeadline({
        steps: 120,
        points: { AGI: 0, STR: 0, MND: 0 },
        statNames,
      }),
    ).toBe('Today already counted: 120 steps. Keep moving to start scoring.');
  });

  it('says nothing at all when the sync carried nothing', () => {
    // A callout celebrating zero would be the opposite of the moment.
    expect(
      firstSyncHeadline({
        steps: 0,
        points: { AGI: 0, STR: 0, MND: 0 },
        statNames,
      }),
    ).toBeNull();
  });

  it('celebrates a stat earned with no steps at all', () => {
    // A gym session is active calories, not steps. Leading with "0 steps"
    // would tell a lifter their workout did not count.
    expect(
      firstSyncHeadline({
        steps: 0,
        points: { AGI: 0, STR: 900, MND: 0 },
        statNames,
      }),
    ).toBe('Today already counted: your Strength went up.');
  });

  it('never names a stat that scored nothing', () => {
    // The old version read points and tiers from the same row and had to guard
    // against them disagreeing. Points alone decide it now, so a zero simply
    // is not a candidate — there is no second source to fall out of step with.
    expect(
      firstSyncHeadline({
        steps: 500,
        points: { AGI: 0, STR: 0, MND: 0 },
        statNames,
      }),
    ).toBe('Today already counted: 500 steps. Keep moving to start scoring.');
  });
});

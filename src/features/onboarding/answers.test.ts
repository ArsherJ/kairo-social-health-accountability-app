import { beforeEach, describe, expect, it } from 'vitest';
import { useOnboardingAnswers } from './answers.ts';

const store = () => useOnboardingAnswers.getState();

beforeEach(() => {
  store().reset();
});

describe('the onboarding answers store', () => {
  it('starts on Automatic with no reading', () => {
    expect(store().questTier).toBeNull();
    expect(store().calibration).toBeNull();
    expect(store().questTierChosen).toBe(false);
  });

  it('pre-selects what a reading proposes', () => {
    store().setCalibration({ outcome: 'proposed', tier: 'steady', medianSteps: 7_400 });

    expect(store().questTier).toBe('steady');
    expect(store().calibration).toEqual({
      outcome: 'proposed',
      tier: 'steady',
      medianSteps: 7_400,
    });
    // Still not the player's answer — the difficulty beat has not been reached.
    expect(store().questTierChosen).toBe(false);
  });

  it('leaves a thin fortnight on Automatic', () => {
    store().setCalibration({ outcome: 'no-history' });

    expect(store().questTier).toBeNull();
    expect(store().calibration).toEqual({ outcome: 'no-history' });
  });

  /*
    The precedence the whole feature turns on. A proposal is a default; an
    answer is an answer. Re-entering `/connect` and granting again re-runs the
    reading, and it must not reach two screens forward and undo a choice.
  */
  it('lets a later reading never overwrite the player, in either direction', () => {
    store().setCalibration({ outcome: 'proposed', tier: 'strong', medianSteps: 14_000 });
    store().setQuestTier('starter');
    expect(store().questTier).toBe('starter');

    store().setCalibration({ outcome: 'proposed', tier: 'strong', medianSteps: 14_000 });
    expect(store().questTier).toBe('starter');
  });

  it('keeps a deliberate return to Automatic', () => {
    store().setCalibration({ outcome: 'proposed', tier: 'steady', medianSteps: 7_400 });
    store().setQuestTier(null);
    expect(store().questTier).toBeNull();

    store().setCalibration({ outcome: 'proposed', tier: 'steady', medianSteps: 7_400 });
    expect(store().questTier).toBeNull();
  });

  it('forgets the reading on commit, so a second account inherits nothing', () => {
    store().setCalibration({ outcome: 'proposed', tier: 'strong', medianSteps: 14_000 });
    store().setShareTotals(false);
    store().reset();

    expect(store().calibration).toBeNull();
    expect(store().questTier).toBeNull();
    expect(store().questTierChosen).toBe(false);
    expect(store().shareTotals).toBe(true);
  });
});

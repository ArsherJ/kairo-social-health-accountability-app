import { describe, expect, it } from 'vitest';
import { nextPermissionAsk, type PermissionAskInput } from './ask-order.ts';

const base: PermissionAskInput = {
  health: 'should-ask',
  healthDismissed: false,
  notification: 'undetermined',
  notificationDismissed: false,
  hasSquad: true,
  hasBeenSabotaged: false,
  answeredAnAskThisSession: false,
};

describe('which permission Kairo asks for', () => {
  it('never returns both, when both are eligible', () => {
    // The bug this function exists to make impossible. Two `<Modal>`s presenting
    // on the same root view controller means UIKit refuses the second
    // ("already presenting"), and the losing sheet is silently suppressed —
    // observed on a fresh install where the user already had a squad.
    expect(nextPermissionAsk(base)).toBe('health');
  });

  it('asks for Health first, because it is the data source', () => {
    // Notifications with no health data would announce a day of zeroes. The
    // ask that unblocks every other feature goes first.
    expect(nextPermissionAsk({ ...base, hasBeenSabotaged: true })).toBe('health');
  });

  it('asks for notifications once Health has been answered', () => {
    expect(nextPermissionAsk({ ...base, health: 'asked' })).toBe('notifications');
  });

  it('asks for notifications when HealthKit is unavailable entirely', () => {
    // No device HealthKit means the health sheet can never show; the
    // notification ask must not be stranded behind it forever.
    expect(nextPermissionAsk({ ...base, health: 'unavailable' })).toBe('notifications');
  });

  it('falls through to notifications when the health sheet is dismissed', () => {
    // Dismissal is per-session for both sheets, so "not now" on Health should
    // not also cost the user the notification ask for that session.
    expect(nextPermissionAsk({ ...base, healthDismissed: true })).toBe('notifications');
  });

  it('asks for nothing when Health is answered and the user has no why yet', () => {
    // §5: every ask has a visible why. No squad, never hit — nothing to ask.
    expect(
      nextPermissionAsk({
        ...base,
        health: 'asked',
        hasSquad: false,
        hasBeenSabotaged: false,
      }),
    ).toBe(null);
  });

  it('asks for nothing once iOS has answered both', () => {
    expect(
      nextPermissionAsk({ ...base, health: 'asked', notification: 'denied' }),
    ).toBe(null);
  });

  it('asks for nothing when both sheets are dismissed for the session', () => {
    expect(
      nextPermissionAsk({ ...base, healthDismissed: true, notificationDismissed: true }),
    ).toBe(null);
  });

  it('does not chain a second ask onto the one just answered', () => {
    // Answering Health makes the notification ask eligible in the same frame.
    // Ordering the asks is pointless if the second one arrives as the first
    // slides away — that reads as a permission gauntlet, which is how an install
    // earns a "Don't Allow" on an ask the user would otherwise have taken.
    expect(
      nextPermissionAsk({ ...base, health: 'asked', answeredAnAskThisSession: true }),
    ).toBe(null);
  });

  it('still asks when nothing has been answered yet this session', () => {
    expect(
      nextPermissionAsk({ ...base, answeredAnAskThisSession: false }),
    ).toBe('health');
  });
});

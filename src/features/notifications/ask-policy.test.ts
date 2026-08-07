import { describe, expect, it } from 'vitest';
import { shouldAskForNotifications, type NotificationPermission } from './ask-policy.ts';

const base = {
  permission: 'undetermined' as NotificationPermission,
  hasSquad: true,
  hasBeenSabotaged: false,
  dismissedThisSession: false,
};

describe('when Kairo asks for notification permission', () => {
  it('asks once the user has a squad', () => {
    expect(shouldAskForNotifications(base)).toBe(true);
  });

  it('asks once the user has been hit, squad or not', () => {
    // Being sabotaged is the strongest possible "visible why" §5 asks for: the
    // user has just experienced the thing the notification is about.
    expect(
      shouldAskForNotifications({ ...base, hasSquad: false, hasBeenSabotaged: true }),
    ).toBe(true);
  });

  it('does not ask a user who has neither — which is the whole onboarding flow', () => {
    // §5: every ask has a visible why. During onboarding there is no why yet,
    // and a permission denied there is denied for the life of the install.
    expect(
      shouldAskForNotifications({ ...base, hasSquad: false, hasBeenSabotaged: false }),
    ).toBe(false);
  });

  it('does not ask again once iOS has an answer', () => {
    // The OS dialog only ever appears once. Re-showing our sheet after that
    // would be a button that does nothing.
    for (const permission of ['granted', 'denied'] as NotificationPermission[]) {
      expect(shouldAskForNotifications({ ...base, permission })).toBe(false);
    }
  });

  it('respects a dismissal for the rest of the session', () => {
    expect(shouldAskForNotifications({ ...base, dismissedThisSession: true })).toBe(false);
  });
});

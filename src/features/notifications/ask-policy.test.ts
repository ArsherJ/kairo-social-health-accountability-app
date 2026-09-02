import { describe, expect, it } from 'vitest';
import { shouldAskForNotifications, type NotificationPermission } from './ask-policy.ts';

const base = {
  permission: 'undetermined' as NotificationPermission,
  hasSquad: true,
  hasEvent: false,
  hasScoredDay: false,
  dismissedThisSession: false,
};

describe('when Kairo asks for notification permission', () => {
  it('asks once the user has a squad', () => {
    expect(shouldAskForNotifications(base)).toBe(true);
  });

  it('asks anyone with a battle running, squad flag or not', () => {
    // **Currently subsumed by `hasSquad`, and kept deliberately.** A Goal could
    // be personal, so this was once the only ask a solo user could earn; an
    // Event cannot be (`events_need_squad`, deviation #45), so today nobody
    // reaches this branch without the first one already being true. It stays
    // because the policy states two independent reasons a user has earned the
    // ask, and collapsing them would silently re-couple the ask to squad
    // membership the moment an Event no longer needs a squad.
    expect(
      shouldAskForNotifications({ ...base, hasSquad: false, hasEvent: true }),
    ).toBe(true);
  });

  it('asks a solo player once their first day has scored', () => {
    // The third reason, added 2026-09-02. Kairo is solo-first and the Digest is
    // the only scheduled push there is, so an ask gated on a squad or a Battle
    // never reached the players the loop was rebuilt for — the server's solo
    // digest branch was written with care and nobody could receive it.
    //
    // The first scored day is the earliest moment the Digest has anything true
    // to report, and a why the player can see rather than one borrowed from a
    // squad.
    expect(
      shouldAskForNotifications({
        ...base,
        hasSquad: false,
        hasEvent: false,
        hasScoredDay: true,
      }),
    ).toBe(true);
  });

  it('does not ask a user with none of the three — which is the whole onboarding flow', () => {
    // §5: every ask has a visible why. During onboarding there is no why yet,
    // and a permission denied there is denied for the life of the install.
    // Nothing has scored on the account's first launch, so the third reason is
    // false there by construction and onboarding stays free of this dialog.
    expect(
      shouldAskForNotifications({
        ...base,
        hasSquad: false,
        hasEvent: false,
        hasScoredDay: false,
      }),
    ).toBe(false);
  });

  it('does not ask again once iOS has an answer', () => {
    // The OS dialog only ever appears once. Re-showing our sheet after that
    // would be a button that does nothing.
    for (const permission of ['granted', 'denied'] as NotificationPermission[]) {
      expect(shouldAskForNotifications({ ...base, permission })).toBe(false);
      // Including on the reason that arrives last: a solo player who declined
      // before joining a squad is not re-asked when their first day scores.
      expect(
        shouldAskForNotifications({
          ...base,
          permission,
          hasSquad: false,
          hasScoredDay: true,
        }),
      ).toBe(false);
    }
  });

  it('respects a dismissal for the rest of the session', () => {
    expect(shouldAskForNotifications({ ...base, dismissedThisSession: true })).toBe(false);
    expect(
      shouldAskForNotifications({
        ...base,
        hasSquad: false,
        hasScoredDay: true,
        dismissedThisSession: true,
      }),
    ).toBe(false);
  });
});

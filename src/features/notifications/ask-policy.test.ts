import { describe, expect, it } from 'vitest';
import {
  askAnswerFor,
  shouldAskForNotifications,
  type NotificationPermission,
} from './ask-policy.ts';

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

  it('asks a solo player once a day has actually scored', () => {
    // The widening (2026-09-04). A scored day is the moment there is genuinely
    // something to say at 8am tomorrow, so the solo cohort — which is every
    // account Kairo is solo-first for — stops being structurally excluded from
    // the one push the app still sends.
    expect(
      shouldAskForNotifications({
        ...base,
        hasSquad: false,
        hasEvent: false,
        hasScoredDay: true,
      }),
    ).toBe(true);
  });

  it('does not ask a solo player who has never scored a day', () => {
    // §5: every ask has a visible why. A digest with nothing to report is not
    // one, and this is still the whole onboarding flow: no squad, no battle,
    // and nothing yet from Apple Health.
    expect(
      shouldAskForNotifications({
        ...base,
        hasSquad: false,
        hasEvent: false,
        hasScoredDay: false,
      }),
    ).toBe(false);
  });

  it('does not ask again once iOS has an answer, however many whys there are', () => {
    // The OS dialog only ever appears once. Re-showing our sheet after that
    // would be a button that does nothing.
    for (const permission of ['granted', 'denied'] as NotificationPermission[]) {
      expect(shouldAskForNotifications({ ...base, permission })).toBe(false);
      expect(
        shouldAskForNotifications({ ...base, permission, hasScoredDay: true }),
      ).toBe(false);
    }
  });

  it('respects a dismissal for the rest of the session', () => {
    expect(shouldAskForNotifications({ ...base, dismissedThisSession: true })).toBe(false);
    // Including the widened why: "Not now" is a soft decline that must silence
    // every reason for the session, or a solo player who deferred is asked
    // again by another door in the same launch.
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

describe('how the ask was answered', () => {
  it('calls a grant granted and everything else a decline', () => {
    expect(askAnswerFor('granted')).toBe('granted');
    expect(askAnswerFor('denied')).toBe('declined');
  });

  it('has no answer named undetermined', () => {
    // `requestNotificationPermission` cannot return it, but the callback that
    // feeds this carries the wider read-side type. A dialog that came back
    // without a grant is a decline; a third bucket nobody can produce would
    // only ever be empty in the analysis.
    expect(askAnswerFor('undetermined')).toBe('declined');
  });
});

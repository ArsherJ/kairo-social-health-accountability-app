import { describe, expect, it } from 'vitest';
import { DIGEST_LOCAL_HOUR, RETIRED_PUSH_PHRASES } from './ask-copy.ts';
import { deliveryStatus, notificationStatus } from './status-copy.ts';

describe('notificationStatus', () => {
  it('offers a route to Settings only when iOS will not let Kairo ask again', () => {
    // The whole point of the row. A denial is permanent from the app's side,
    // so this is the only way back.
    expect(notificationStatus('denied').action).toBe('Open Settings');
    expect(notificationStatus('granted').action).toBeNull();
    expect(notificationStatus('undetermined').action).toBeNull();
  });

  it('says what is lost, not just that something is off', () => {
    const help = notificationStatus('denied').help;
    expect(help).toMatch(/digest|battle alerts/i);
    expect(help).toMatch(/settings/i);
  });

  it('does not pre-empt the contextual ask when nothing has been decided', () => {
    // `shouldAskForNotifications` raises this after squad or battle activity.
    // A button here would be the onboarding ambush that policy avoids.
    const status = notificationStatus('undetermined');
    expect(status.action).toBeNull();
    expect(status.value).toBe('Not set');
  });

  it('names the limits rather than selling the feature', () => {
    expect(notificationStatus('granted').help).toMatch(/never overnight/i);
  });

  it('describes no push the app retired', () => {
    // The same correction the ask sheet needed, against the same list — two
    // guards enforcing one rule is how they drift apart. This row called the
    // remaining push a "day-end reminder", which is the one thing it is not,
    // and printed a cap of three a day that `BUDGET_EXEMPT` sends can exceed.
    for (const permission of ['granted', 'denied', 'undetermined'] as const) {
      for (const phrase of RETIRED_PUSH_PHRASES) {
        expect(notificationStatus(permission).help).not.toMatch(phrase);
      }
    }
  });

  it('names the hour the digest actually arrives', () => {
    expect(notificationStatus('granted').help).toMatch(new RegExp(`${DIGEST_LOCAL_HOUR}am`));
  });

  it('never apologises or pleads', () => {
    for (const permission of ['granted', 'denied', 'undetermined'] as const) {
      expect(notificationStatus(permission).help).not.toMatch(/sorry|oops|please/i);
    }
  });
});

describe('deliveryStatus', () => {
  const onDevice = {
    permission: 'granted' as const,
    isSimulator: false,
    environment: null as null | 'development' | 'production',
  };

  it('says nothing when the permission has not been granted', () => {
    // There is no registration to report on, and the row above already
    // explains the state. A second line would just repeat it.
    for (const permission of ['denied', 'undetermined'] as const) {
      expect(
        deliveryStatus({ ...onDevice, permission, registered: false }),
      ).toBeNull();
    }
  });

  it('decides simulator from the release type, never from a missing environment', () => {
    // The regression this test exists for. `expo-application` reads
    // aps-environment out of embedded.mobileprovision, and TestFlight strips
    // that file — so a perfectly healthy TestFlight device reports a null
    // environment. The first version of this called that "simulator" and told
    // a phone it could not receive push while it was receiving push.
    expect(
      deliveryStatus({ ...onDevice, environment: null, registered: true }),
    ).not.toMatch(/simulator/i);

    expect(
      deliveryStatus({ ...onDevice, isSimulator: true, registered: false }),
    ).toMatch(/simulator/i);
  });

  it('names the state that is otherwise invisible: permission on, no token', () => {
    // The server addresses device_tokens. Permission granted with no row there
    // means every push reaches nobody, and nothing anywhere says so.
    expect(deliveryStatus({ ...onDevice, registered: false })).toMatch(/not registered/i);
  });

  it('reports registration alone where the environment cannot be read', () => {
    // TestFlight. "Registered" is the whole of the answer there, and it is a
    // strong one: getExpoPushTokenAsync fails outright when the entitlement is
    // wrong, so a token existing is evidence the entitlement is right.
    const copy = deliveryStatus({ ...onDevice, environment: null, registered: true });
    expect(copy).toMatch(/registered/i);
    expect(copy).not.toMatch(/null|undefined|unknown/i);
  });

  it('appends the environment where the provisioning profile is present to read it', () => {
    for (const environment of ['development', 'production'] as const) {
      expect(deliveryStatus({ ...onDevice, environment, registered: true })).toMatch(
        environment,
      );
    }
  });
});

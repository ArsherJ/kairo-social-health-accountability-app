import { describe, expect, it } from 'vitest';
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
    expect(help).toMatch(/day-end|goal alerts/i);
    expect(help).toMatch(/settings/i);
  });

  it('does not pre-empt the contextual ask when nothing has been decided', () => {
    // `shouldAskForNotifications` raises this after squad or goal activity.
    // A button here would be the onboarding ambush that policy avoids.
    const status = notificationStatus('undetermined');
    expect(status.action).toBeNull();
    expect(status.value).toBe('Not set');
  });

  it('names the limits rather than selling the feature', () => {
    expect(notificationStatus('granted').help).toMatch(/three a day|never overnight/i);
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

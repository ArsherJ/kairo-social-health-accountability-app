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
  const granted = { permission: 'granted' as const, environment: 'production' as const };

  it('says nothing when the permission has not been granted', () => {
    // There is no registration to report on, and the row above already
    // explains the state. A second line would just repeat it.
    for (const permission of ['denied', 'undetermined'] as const) {
      expect(
        deliveryStatus({ permission, environment: null, registered: false }),
      ).toBeNull();
    }
  });

  it('distinguishes a simulator from a failure', () => {
    // A simulator cannot register with APNs at all — expo-application returns
    // null there. Reporting that as "not registered" would send someone
    // debugging a problem that does not exist, on the device where most hand
    // verification happens.
    const copy = deliveryStatus({ ...granted, environment: null, registered: false });
    expect(copy).toMatch(/simulator/i);
    expect(copy).not.toMatch(/not registered/i);
  });

  it('names the state that is otherwise invisible: permission on, no token', () => {
    // The server addresses device_tokens. Permission granted with no row there
    // means every push reaches nobody, and nothing anywhere says so.
    expect(deliveryStatus({ ...granted, registered: false })).toMatch(/not registered/i);
  });

  it('reports the APNs environment either way, since that is the whole question', () => {
    // The build ships whatever `aps-environment` the committed ios/ carries
    // (deviation #28). This line is how that value is read back off a real
    // device instead of inferred from the archive.
    expect(deliveryStatus({ ...granted, registered: true })).toMatch(/production/);
    expect(
      deliveryStatus({ ...granted, environment: 'development', registered: true }),
    ).toMatch(/development/);
  });
});

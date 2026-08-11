import { describe, expect, it } from 'vitest';
import { notificationStatus } from './status-copy.ts';

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

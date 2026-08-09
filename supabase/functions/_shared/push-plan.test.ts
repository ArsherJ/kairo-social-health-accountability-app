import { describe, expect, it } from 'vitest';
import {
  classifyTicket,
  expoMessagesFor,
  isExpoPushToken,
} from './push-plan.ts';

const APNS_TOKEN =
  '803aa327bb4f996f96043b235e038f8b2eb803e12d37954ed8eac3d4fb5857e14c54c712f6e9dc650d72aa213e6b69a7';

describe('isExpoPushToken', () => {
  it('accepts both spellings Expo issues', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
  });

  it('rejects a raw APNs device token', () => {
    // The whole reason this predicate exists. `device_tokens` held APNs tokens
    // before the transport changed, and Expo would reject them one slow round
    // trip at a time rather than saying anything useful.
    expect(isExpoPushToken(APNS_TOKEN)).toBe(false);
  });

  it('rejects empty and malformed values', () => {
    expect(isExpoPushToken('')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken')).toBe(false);
  });
});

describe('expoMessagesFor', () => {
  const message = { title: '1 hour left.', body: "You're in 2nd place. Push." };

  it('builds one message per token, carrying the deep-link data', () => {
    const messages = expoMessagesFor(
      ['ExponentPushToken[aaa]', 'ExponentPushToken[bbb]'],
      message,
      { trigger: 'day_ending_soon', screen: 'squad' },
    );

    expect(messages).toEqual([
      {
        to: 'ExponentPushToken[aaa]',
        title: message.title,
        body: message.body,
        data: { trigger: 'day_ending_soon', screen: 'squad' },
        sound: 'default',
      },
      {
        to: 'ExponentPushToken[bbb]',
        title: message.title,
        body: message.body,
        data: { trigger: 'day_ending_soon', screen: 'squad' },
        sound: 'default',
      },
    ]);
  });

  it('drops tokens Expo cannot address rather than sending them', () => {
    const messages = expoMessagesFor([APNS_TOKEN, 'ExponentPushToken[aaa]'], message, {});
    expect(messages.map((m) => m.to)).toEqual(['ExponentPushToken[aaa]']);
  });

  it('returns nothing when no token is addressable', () => {
    expect(expoMessagesFor([APNS_TOKEN], message, {})).toEqual([]);
  });
});

describe('classifyTicket', () => {
  it('reads a successful ticket', () => {
    expect(classifyTicket({ status: 'ok', id: 'abc' })).toEqual({ outcome: 'ok' });
  });

  it('reads DeviceNotRegistered as a dead token, not a retryable failure', () => {
    // Expo's name for what FCM calls UNREGISTERED. Retrying it forever is how a
    // token table fills with the dead.
    expect(
      classifyTicket({
        status: 'error',
        message: '"ExponentPushToken[x]" is not a registered push notification recipient',
        details: { error: 'DeviceNotRegistered' },
      }),
    ).toEqual({ outcome: 'unregistered' });
  });

  it('surfaces every other error with its message', () => {
    expect(
      classifyTicket({
        status: 'error',
        message: 'Invalid credentials',
        details: { error: 'InvalidCredentials' },
      }),
    ).toEqual({ outcome: 'error', message: 'InvalidCredentials: Invalid credentials' });
  });

  it('does not crash on an error ticket with no details', () => {
    expect(classifyTicket({ status: 'error', message: 'something broke' })).toEqual({
      outcome: 'error',
      message: 'something broke',
    });
  });
});

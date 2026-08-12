import { describe, expect, it } from 'vitest';
import { appleErrorMessage, isAppleCancellation } from './apple-error.ts';

describe('appleErrorMessage', () => {
  it('says nothing when the user cancels', () => {
    expect(appleErrorMessage({ code: 'ERR_REQUEST_CANCELED' })).toBeNull();
    expect(isAppleCancellation({ code: 'ERR_REQUEST_CANCELED' })).toBe(true);
  });

  it('points at the Apple ID for the codes a simulator produces', () => {
    // ERR_REQUEST_UNKNOWN is what a simulator with no Apple ID throws, and it
    // is the single most likely thing to be seen during development.
    for (const code of [
      'ERR_REQUEST_UNKNOWN',
      'ERR_REQUEST_NOT_HANDLED',
      'ERR_REQUEST_NOT_INTERACTIVE',
    ]) {
      expect(appleErrorMessage({ code })).toMatch(/signed into an Apple ID/);
    }
  });

  it('offers a retry for transient failures', () => {
    expect(appleErrorMessage({ code: 'ERR_REQUEST_FAILED' })).toMatch(/Try again/);
    expect(appleErrorMessage({ code: 'ERR_INVALID_RESPONSE' })).toMatch(/Try again/);
  });

  it('falls back to the thrown message for a code it does not know', () => {
    expect(appleErrorMessage({ code: 'ERR_SOMETHING_NEW', message: 'Nope' })).toBe('Nope');
  });

  it('still says something useful when there is nothing to read', () => {
    for (const failure of [null, undefined, 'a string', {}, { code: 7 }]) {
      expect(appleErrorMessage(failure)).toMatch(/Apple sign-in failed/);
      expect(isAppleCancellation(failure)).toBe(false);
    }
  });

  it('never returns an empty message, which would render as a blank line', () => {
    expect(appleErrorMessage({ code: 'ERR_WHATEVER', message: '   ' })).toMatch(/\S/);
  });
});

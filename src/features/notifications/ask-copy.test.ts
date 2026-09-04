import { describe, expect, it } from 'vitest';
import { DIGEST_HOUR } from '../../../supabase/functions/_shared/notification-plan.ts';
import {
  DIGEST_LOCAL_HOUR,
  NOTIFICATION_ASK_COPY,
  RETIRED_PUSH_PHRASES,
} from './ask-copy.ts';

const everySentence = Object.values(NOTIFICATION_ASK_COPY).join(' ');

describe('DIGEST_LOCAL_HOUR', () => {
  it('is the hour the server actually dispatches on', () => {
    // The sheet promises a time. The dispatcher decides it. A drift between
    // the two is a promise the app breaks every morning, with nothing on
    // either side to notice — so the client's copy is pinned to the server's
    // schedule here rather than trusted to stay in step by hand.
    expect(DIGEST_LOCAL_HOUR).toBe(DIGEST_HOUR);
  });

  it('is a morning hour, because the copy writes it as one', () => {
    // `${hour}am` is only honest before noon. A digest moved to the afternoon
    // needs a real formatter, and this is what says so before the sheet starts
    // offering to wake somebody at "14am".
    expect(DIGEST_LOCAL_HOUR).toBeGreaterThan(0);
    expect(DIGEST_LOCAL_HOUR).toBeLessThan(12);
  });
});

describe('NOTIFICATION_ASK_COPY', () => {
  it('promises the one scheduled message and names its hour', () => {
    expect(NOTIFICATION_ASK_COPY.title).toMatch(/one message a day/i);
    expect(NOTIFICATION_ASK_COPY.title).toMatch(new RegExp(`${DIGEST_LOCAL_HOUR}am`));
  });

  it('says what the message carries', () => {
    // The digest is yesterday's result and today's standing (`digestCopy`).
    expect(NOTIFICATION_ASK_COPY.body).toMatch(/yesterday/i);
    expect(NOTIFICATION_ASK_COPY.body).toMatch(/today/i);
  });

  it('offers no push the app retired', () => {
    // Deviation #52 retired the evening loop — 23:00, 00:00 and the
    // mid-morning nudge — and this sheet went on offering all three, plus a
    // cap of three a day with exceptions at 11 PM and midnight. Every phrase
    // on that list was on the screen where somebody decides whether to trust
    // the app with a permission iOS grants exactly once.
    for (const phrase of RETIRED_PUSH_PHRASES) {
      expect(everySentence).not.toMatch(phrase);
    }
  });

  it('mentions 11pm only to rule it out', () => {
    // The one time of day worth naming, because it is what people expect from
    // a streak app and what Kairo deliberately does not do. It has to read as
    // an absence, never as a schedule.
    for (const match of everySentence.matchAll(/11 ?pm/gi)) {
      const clause = everySentence.slice(Math.max(0, match.index - 40), match.index);
      expect(clause).toMatch(/no|never|nothing/i);
    }
  });

  it('does not promise silence it cannot keep', () => {
    // `event_completed` and `challenge_cleared` still push, from something the
    // user did. Quiet hours cover them (neither is exempt), so "never
    // overnight" is true and "that is all" would not be.
    expect(NOTIFICATION_ASK_COPY.fine).toMatch(/never overnight/i);
  });

  it('keeps a decline that is not a system dialog', () => {
    // "Not now" must stay a soft decline: `requestNotificationPermission` is
    // unrecoverable in-app once iOS records a denial.
    expect(NOTIFICATION_ASK_COPY.dismiss).toMatch(/not now/i);
  });
});

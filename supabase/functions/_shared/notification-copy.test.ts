import { describe, expect, it } from 'vitest';
import { notificationCopy, ordinal, sabotageCopy } from './notification-copy.ts';

describe('ordinal', () => {
  it('uses the ordinary suffixes', () => {
    expect([1, 2, 3, 4, 21, 22, 23].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '21st',
      '22nd',
      '23rd',
    ]);
  });

  it('gets the teens right', () => {
    // 11th, not 11st. The suffix rule that reads the last digit alone is wrong
    // for exactly three numbers, and a squad cap of 6 hides it — until the
    // referral leaderboard, which does not.
    expect([11, 12, 13].map(ordinal)).toEqual(['11th', '12th', '13th']);
  });
});

describe('sabotage copy', () => {
  it('is §14\'s sentence, split at the full stop', () => {
    expect(sabotageCopy({ actorName: 'Jomar', scoreDelta: -500 })).toEqual({
      title: 'Jomar hit you with a banana! 🍌',
      body: "You're down 500 points.",
    });
  });
});

describe('day-boundary copy', () => {
  it('names the rank when the user is in a squad', () => {
    expect(notificationCopy('day_ending_soon', { rank: 3, total: 2410, inSquad: true })).toEqual({
      title: '1 hour left.',
      body: "You're in 3rd place. Push.",
    });
    expect(notificationCopy('day_ends', { rank: 2, total: 2410, inSquad: true })).toEqual({
      title: 'Provisional: you finished 2nd.',
      body: 'Finalizes in ~2h.',
    });
  });

  it('falls back to the score for a solo user rather than saying nothing', () => {
    // "You're in 1st place" in a squad of one is absurd, but suppressing the
    // evening loop for solo users would gut it for exactly the population §7's
    // churn argument is about.
    expect(notificationCopy('day_ending_soon', { rank: null, total: 2410, inSquad: false })).toEqual({
      title: '1 hour left.',
      body: '2,410 points today. Push.',
    });
    expect(notificationCopy('day_ends', { rank: null, total: 2410, inSquad: false })).toEqual({
      title: 'Provisional: 2,410 points today.',
      body: 'Finalizes in ~2h.',
    });
  });

  it('says a new day has begun, with a squad-less variant', () => {
    expect(notificationCopy('day_starts', { rank: null, total: 0, inSquad: true })).toEqual({
      title: 'A new day begins.',
      body: 'Your squad is already moving. 👊',
    });
    expect(notificationCopy('day_starts', { rank: null, total: 0, inSquad: false })).toEqual({
      title: 'A new day begins.',
      body: 'Your Hunter is waiting. 👊',
    });
  });

  it('refuses to build sabotage copy without the actor', () => {
    // Sabotage copy needs a name this signature does not carry, and a push
    // reading "undefined hit you with a banana" is worse than no push.
    expect(() => notificationCopy('sabotaged', { rank: 1, total: 0, inSquad: true })).toThrow(
      /sabotageCopy/,
    );
  });
});

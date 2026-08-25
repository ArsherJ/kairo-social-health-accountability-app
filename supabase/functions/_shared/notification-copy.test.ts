import { describe, expect, it } from 'vitest';
import {
  challengeClearedCopy,
  eventCompletedCopy,
  notificationCopy,
  ordinal,
} from './notification-copy.ts';

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
      body: 'Your character is waiting. 👊',
    });
  });
});

describe('challengeClearedCopy', () => {
  it('names the pace and distance actually beaten', () => {
    const message = challengeClearedCopy({
      area: 'run',
      kind: 'target',
      minDistanceM: 5_000,
      paceSecPerKm: 291,
    });
    expect(message.title).toContain('Run challenge cleared');
    expect(message.body).toContain('5 km');
    expect(message.body).toContain('4:51/km');
  });

  it('names the calories on a strength clear', () => {
    const message = challengeClearedCopy({ area: 'strength', kind: 'target', activeKcal: 1_410 });
    expect(message.body).toContain('1,410 kcal');
  });

  it('says a baseline was set, not a bar beaten, on the first clear', () => {
    // The establish challenge cannot be failed on fitness, so congratulating
    // someone for beating a target that did not exist would be a lie.
    const run = challengeClearedCopy({ area: 'run', kind: 'establish', minDistanceM: 1_000 });
    const lift = challengeClearedCopy({ area: 'strength', kind: 'establish' });
    expect(run.title).toContain('Baseline set');
    expect(lift.title).toContain('Baseline set');
    for (const message of [run, lift]) {
      expect(message.body).not.toContain('cleared');
      expect(message.body).not.toContain('under');
    }
  });

  it('never states a point total', () => {
    // Points are spoken only inside Goals (deviation #30), and a challenge
    // target is a pace or a calorie count in the first place.
    const messages = [
      challengeClearedCopy({ area: 'run', kind: 'target', minDistanceM: 5_000, paceSecPerKm: 291 }),
      challengeClearedCopy({ area: 'strength', kind: 'target', activeKcal: 410 }),
      challengeClearedCopy({ area: 'strength', kind: 'establish' }),
    ];
    for (const message of messages) {
      expect(`${message.title} ${message.body}`).not.toMatch(/\bpoints?\b/i);
    }
  });
});

describe('eventCompletedCopy', () => {
  it('says a Battle was beaten, not that an event completed', () => {
    // Nobody set out to complete an event; they set out to beat the Carabao.
    const message = eventCompletedCopy({
      title: 'The Carabao',
      kind: 'battle',
      xpAwarded: 79,
    });
    expect(message.title).toBe('Boss down. ⚔️');
    expect(message.body).toContain('The Carabao');
    expect(message.body).toContain('+79 XP');
  });

  it('speaks to the squad, because an Event is pooled', () => {
    // Every member on the frozen roster is paid, contributor or not
    // (deviation #48) — "you hit it" would be a lie to the member the mechanic
    // exists for.
    expect(
      eventCompletedCopy({ title: 'The Carabao', kind: 'battle', xpAwarded: 30 }).body,
    ).toContain('your squad');
  });

  it('has its own sentence for an Adventure rather than a generic default', () => {
    const message = eventCompletedCopy({ title: 'To Baguio', kind: 'adventure', xpAwarded: 164 });
    expect(message.title).toBe('You made it. 🏕');
    expect(message.body).toContain('reached the end');
  });

  it('separates thousands, matching the rest of the push copy', () => {
    expect(
      eventCompletedCopy({ title: 'Big', kind: 'battle', xpAwarded: 1_200 }).body,
    ).toContain('+1,200 XP');
  });
});

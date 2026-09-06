import { describe, expect, it } from 'vitest';
import {
  challengeClearedCopy,
  digestCopy,
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

describe('digestCopy (deviation #52)', () => {
  it('congratulates a win without naming a number', () => {
    expect(digestCopy({ inSquad: true, result: { rank: 1, racers: 4 } })).toEqual({
      title: 'You won yesterday. 🏁',
      body: 'The flag resets this morning. Line up again.',
    });
  });

  it('names the place, and says the day resets, for anyone else', () => {
    expect(digestCopy({ inSquad: true, result: { rank: 3, racers: 6 } })).toEqual({
      title: '3rd yesterday.',
      body: 'Everyone starts level this morning.',
    });
  });

  it('falls back to today’s standing when yesterday has no result yet', () => {
    // Ordinary, not exceptional: the squad's race for yesterday is not final
    // until every member's yesterday is, and a member further west is still
    // living in it.
    expect(digestCopy({ inSquad: true, result: null, standing: { rank: 2, racers: 5 } })).toEqual({
      title: 'The race is on. 🏁',
      body: 'You are 2nd of 5 so far today.',
    });
  });

  it('says the squad is lining up when there is neither', () => {
    expect(digestCopy({ inSquad: true, result: null, standing: null })).toEqual({
      title: 'A new day. 🌤',
      body: 'Your squad is lining up.',
    });
  });

  it('never mentions rank to a solo player', () => {
    // They are racing their own past days. "1st of 4" against three ghosts
    // would be a claim about other people that is not true.
    const message = digestCopy({ inSquad: false, result: { rank: 1, racers: 4 } });
    expect(message).toEqual({
      title: 'A new day. 🌤',
      body: 'Your track is clear. Beat yesterday.',
    });
    expect(message.body).not.toMatch(/1st|of 4/);
  });

  it('speaks no points total anywhere (deviation #30)', () => {
    const messages = [
      digestCopy({ inSquad: false }),
      digestCopy({ inSquad: true, result: { rank: 1, racers: 4 } }),
      digestCopy({ inSquad: true, result: { rank: 4, racers: 4 } }),
      digestCopy({ inSquad: true, standing: { rank: 2, racers: 4 } }),
      digestCopy({ inSquad: true }),
    ];
    for (const message of messages) {
      expect(`${message.title} ${message.body}`).not.toMatch(/points/i);
    }
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

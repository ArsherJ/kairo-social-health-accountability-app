import { describe, expect, it } from 'vitest';
import { feedLine, feedTime } from './feed-copy.ts';

function line(overrides: Partial<Parameters<typeof feedLine>[0]> = {}) {
  return feedLine({
    actorName: 'Jomar',
    targetName: 'Ali',
    actorIsSelf: false,
    targetIsSelf: false,
    item: 'banana',
    ...overrides,
  });
}

describe('feedLine', () => {
  it('names both people when neither is you', () => {
    expect(line()).toBe('Jomar hit Ali with a banana 🍌');
  });

  it('says "You" when you threw it', () => {
    expect(line({ actorIsSelf: true })).toBe('You hit Ali with a banana 🍌');
  });

  it('says "you" when you were hit', () => {
    // §14's voice. Lowercase mid-sentence, and the target position — the line
    // has to read as something that happened *to* you.
    expect(line({ targetIsSelf: true })).toBe('Jomar hit you with a banana 🍌');
  });

  it('refuses a self-hit rather than inventing a fourth case', () => {
    // validateDeploy rejects self_target, so this row cannot exist. Rendering
    // "You hit you" would be the feed lying about an impossible event.
    expect(() => line({ actorIsSelf: true, targetIsSelf: true })).toThrow();
  });
});

describe('feedTime', () => {
  const NOW = new Date('2026-08-07T12:00:00Z');

  it('says "just now" under a minute', () => {
    expect(feedTime('2026-08-07T11:59:30Z', NOW)).toBe('just now');
  });

  it('counts whole minutes under an hour', () => {
    expect(feedTime('2026-08-07T11:48:00Z', NOW)).toBe('12m');
    expect(feedTime('2026-08-07T11:01:00Z', NOW)).toBe('59m');
  });

  it('counts whole hours under a day', () => {
    expect(feedTime('2026-08-07T09:00:00Z', NOW)).toBe('3h');
    expect(feedTime('2026-08-06T13:00:00Z', NOW)).toBe('23h');
  });

  it('falls back to a date past 24 hours', () => {
    expect(feedTime('2026-08-05T12:00:00Z', NOW)).toBe('Aug 5');
  });

  it('never renders a negative age from a clock that disagrees', () => {
    // The server stamps created_at; the device supplies `now`. A phone a few
    // seconds behind must not produce "-1m".
    expect(feedTime('2026-08-07T12:00:05Z', NOW)).toBe('just now');
  });
});

import { describe, expect, it } from 'vitest';
import { recordDate, recordValue } from './record-copy.ts';

describe('recordValue', () => {
  it('speaks each stat in its own unit', () => {
    expect(recordValue('AGI', 18420)).toBe('18,420 steps');
    expect(recordValue('STR', 812)).toBe('812 cal');
    expect(recordValue('MND', 440)).toBe('7h 20m');
  });

  it('drops the minutes on a whole hour', () => {
    expect(recordValue('MND', 480)).toBe('8h');
  });

  it('never prints a score or an engine key', () => {
    for (const stat of ['AGI', 'STR', 'MND'] as const) {
      expect(recordValue(stat, 500)).not.toMatch(/\b(AGI|STR|MND)\b/);
      expect(recordValue(stat, 500)).not.toMatch(/points?|score/i);
    }
  });
});

describe('recordDate', () => {
  it('omits the year within the current one', () => {
    expect(recordDate('2026-08-14', '2026-08-29')).toBe('14 Aug');
  });

  it('keeps the year on an older record', () => {
    expect(recordDate('2025-12-02', '2026-08-29')).toBe('2 Dec 2025');
  });

  // A `YYYY-MM-DD` handed to `new Date()` is parsed as UTC and renders as the
  // day before for every player west of Greenwich. Kairo's day model is local
  // throughout, and a record dated one day early reads as a broken memory.
  it('does not shift the date across a timezone', () => {
    expect(recordDate('2026-01-01', '2026-08-29')).toBe('1 Jan');
  });

  it('returns nothing rather than guessing at a malformed date', () => {
    expect(recordDate('', '2026-08-29')).toBe('');
    expect(recordDate('not-a-date', '2026-08-29')).toBe('');
  });
});

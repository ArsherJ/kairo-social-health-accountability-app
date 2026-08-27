import { describe, expect, it } from 'vitest';
import { ghostDayLabel } from './ghost-day-label.ts';

// 2026-08-25 is a Tuesday.
const TODAY = '2026-08-25';

describe('ghostDayLabel', () => {
  it('names yesterday by its weekday', () => {
    expect(ghostDayLabel('2026-08-24', TODAY)).toBe('Monday');
  });

  it('names the far edge of the week by its weekday', () => {
    expect(ghostDayLabel('2026-08-19', TODAY)).toBe('Wednesday');
  });

  it('falls back to a date once a weekday would be ambiguous', () => {
    // Seven days back is the *same* weekday as yesterday-plus-six would soon
    // collide with, and ghostRivals can return both when the days between
    // scored nothing. Two lanes reading "your Tuesday" describe one day twice.
    expect(ghostDayLabel('2026-08-18', TODAY)).toBe('Aug 18');
    expect(ghostDayLabel('2026-08-11', TODAY)).toBe('Aug 11');
  });

  it('returns the raw string rather than guessing at unparseable input', () => {
    expect(ghostDayLabel('not-a-date', TODAY)).toBe('not-a-date');
    expect(ghostDayLabel('2026-08-24', 'not-a-date')).toBe('2026-08-24');
  });

  it('does not name today or a future date as a weekday', () => {
    // A ghost is always a past day — the query excludes today — but a label
    // that read "your Tuesday" for today would be the two-figures-on-top-of-
    // each-other bug wearing a name.
    expect(ghostDayLabel(TODAY, TODAY)).toBe('Aug 25');
  });
});

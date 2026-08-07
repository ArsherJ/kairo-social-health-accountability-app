import { describe, expect, it } from 'vitest';
import { USER_FOCUSES } from '@kairo/core';
import {
  FOCUS_OPTIONS,
  FOCUS_OPTION_VALUES,
  FOCUS_RULE_COPY,
  focusLabel,
} from './focus-options.ts';

describe('FOCUS_OPTIONS', () => {
  it('offers every focus the core declares', () => {
    // A focus added to @kairo/core with no copy here would be storable and
    // unpickable — and unlabelled on the Profile screen.
    expect([...FOCUS_OPTION_VALUES].sort()).toEqual([...USER_FOCUSES].sort());
  });

  it('offers nothing the database would reject', () => {
    for (const option of FOCUS_OPTIONS) {
      expect(USER_FOCUSES).toContain(option.value);
    }
  });

  it('leads with the specific answers, not "a bit of everything"', () => {
    // A question whose first option is "no preference" is a question most
    // people answer with "no preference".
    expect(FOCUS_OPTIONS[FOCUS_OPTIONS.length - 1]!.value).toBe('general');
  });

  it('gives every option a label and a blurb', () => {
    for (const option of FOCUS_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.blurb.length).toBeGreaterThan(0);
    }
  });

  it('states the rule that focus does not change the score', () => {
    expect(FOCUS_RULE_COPY).toMatch(/not the score/);
  });
});

describe('focusLabel', () => {
  it('labels each focus', () => {
    expect(focusLabel('running')).toBe('Running');
    expect(focusLabel('general')).toBe('A bit of everything');
  });

  it('reads as unset for a skipped focus', () => {
    // Null is a normal value, not an error state.
    expect(focusLabel(null)).toBe('Not set');
  });
});

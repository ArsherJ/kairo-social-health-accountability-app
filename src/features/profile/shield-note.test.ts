import { describe, expect, it } from 'vitest';
import { SHIELD_MINIMUM_STREAK } from '@kairo/core';
import { shieldNote } from './shield-note.ts';

const streak = (current: number, shieldAvailableOn: string | null = null) => ({
  current_streak: current,
  shield_available_on: shieldAvailableOn,
});

describe('what the You tab says about the Streak Shield', () => {
  it('asks a player with no streak row to score once', () => {
    // The row is written on the first scoring day, so this is a brand-new
    // account rather than an error. Unchanged.
    expect(shieldNote(null).text).toBe('Score once to start a streak');
    expect(shieldNote(undefined).text).toBe('Score once to start a streak');
    expect(shieldNote(null).banked).toBe(false);
  });

  it('promises nothing below the minimum, and names the bar instead', () => {
    // The false promise this module exists to remove. `shield_available_on`
    // is null from the first scored day — the column means "one is banked
    // now" — so the card told every account for its first four days that a
    // missed day was safe, when `advanceStreak` would have caught nothing.
    for (let current = 1; current < SHIELD_MINIMUM_STREAK; current += 1) {
      const note = shieldNote(streak(current));
      expect(note.text).toBe(`Shield unlocks at a ${SHIELD_MINIMUM_STREAK}-day streak`);
      expect(note.banked).toBe(false);
    }
  });

  it('holds the promise from the minimum upward, unchanged', () => {
    for (const current of [SHIELD_MINIMUM_STREAK, SHIELD_MINIMUM_STREAK + 20]) {
      const note = shieldNote(streak(current));
      expect(note.text).toBe('Shield banked — one missed day is safe');
      expect(note.banked).toBe(true);
    }
  });

  it('names the recharge date whenever one is pending, at any streak length', () => {
    // The recharge is the binding constraint and was never the false half:
    // a spent shield catches nothing however long the streak gets, and a
    // streak that then breaks reaches five days again long before the charge
    // comes back. Naming only the streak bar there would understate it.
    expect(shieldNote(streak(9, '2026-10-06')).text).toBe('Shield recharges 2026-10-06');
    expect(shieldNote(streak(0, '2026-10-06')).text).toBe('Shield recharges 2026-10-06');
    expect(shieldNote(streak(9, '2026-10-06')).banked).toBe(false);
  });

  it('states no promise it cannot keep, in either branch', () => {
    // "safe" is the word the card spends on the shield actually catching a
    // miss. Below the minimum nothing is safe, so nothing may say so.
    for (const current of [0, 1, 4]) {
      expect(shieldNote(streak(current)).text).not.toMatch(/\bsafe\b|\bbanked\b/i);
    }
  });
});

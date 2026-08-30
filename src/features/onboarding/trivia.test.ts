import { describe, expect, it } from 'vitest';
import { DAILY_STEP_BASELINE, RACE_FINISH_LINE } from '@kairo/core';
import { TRIVIA, pickTrivia } from './trivia.ts';

describe('TRIVIA', () => {
  it('teaches the finish line from the constant, never a literal', () => {
    // `RACE_FINISH_LINE` *is* `DAILY_STEP_BASELINE`, which *is* the Daily Walk
    // — one number with three readings. A literal in the copy would be a
    // fourth, free to drift the day Gold moves.
    expect(RACE_FINISH_LINE).toBe(DAILY_STEP_BASELINE);
    const ridge = TRIVIA.find((t) => t.tail.includes('ridge'));
    expect(ridge?.figure).toBe(RACE_FINISH_LINE.toLocaleString());
  });

  it('has no bare four-or-five-digit step count written into any clause', () => {
    // The guard behind the rule above: the only place a step count may appear
    // is `figure`, built from the constant. A number typed into `lead`, `tail`
    // or `note` is a copy that cannot follow the engine.
    for (const t of TRIVIA) {
      for (const clause of [t.lead, t.tail, t.note]) {
        expect(clause, `"${clause}"`).not.toMatch(/\b\d{1,3},\d{3}\b|\b\d{4,5}\b/);
      }
    }
  });

  it('names no engine key (deviation #51)', () => {
    // Case-sensitive and word-bounded, exactly as `stat-names.ts` learned to
    // be: a loose /agi/i matches "Dagit", a perfectly good name for a
    // Philippine eagle.
    for (const t of TRIVIA) {
      const all = `${t.lead} ${t.figure} ${t.tail} ${t.note}`;
      expect(all).not.toMatch(/\b(AGI|STR|MND)\b/);
    }
  });

  it('speaks the retired vocabulary nowhere', () => {
    // "Hunter" and "barkada" went at deviation #26, and the design this copy
    // came from predates that.
    for (const t of TRIVIA) {
      const all = `${t.lead} ${t.figure} ${t.tail} ${t.note}`.toLowerCase();
      expect(all).not.toContain('hunter');
      expect(all).not.toContain('barkada');
    }
  });

  it('makes no claim about an effect size', () => {
    /*
      The line this file draws. Every number in the copy is either the app's own
      or the size of an *action* — a walk's length, a count of stats. A screen
      that tells somebody a habit will move a number in their blood by a given
      percentage is the app making a medical claim, on the third screen of
      onboarding, before it has measured anything about them.

      A bare `%` is the signature of exactly that claim, so it is banned
      outright rather than reviewed case by case.
    */
    for (const t of TRIVIA) {
      const all = `${t.lead} ${t.figure} ${t.tail} ${t.note}`;
      expect(all, `"${all}"`).not.toMatch(/%|per ?cent/i);
    }
  });

  it('is a non-empty set with every clause filled but the optional tail', () => {
    expect(TRIVIA.length).toBeGreaterThan(0);
    for (const t of TRIVIA) {
      expect(t.lead.length).toBeGreaterThan(0);
      expect(t.figure.length).toBeGreaterThan(0);
      expect(t.note.length).toBeGreaterThan(0);
    }
  });
});

describe('pickTrivia', () => {
  it('is deterministic — the same account always reads the same fact', () => {
    // Not a nicety: `Math.random()` in a render body is a side effect, React
    // may render twice, and the card would visibly swap its own text while
    // being read. Same reasoning `pickQuests` is a pure hash rather than a draw.
    const once = pickTrivia('user-abc');
    for (let i = 0; i < 50; i++) expect(pickTrivia('user-abc')).toEqual(once);
  });

  it('falls back to the fact that teaches the rule when there is no account yet', () => {
    expect(pickTrivia(undefined)).toEqual(TRIVIA[0]);
    expect(pickTrivia('')).toEqual(TRIVIA[0]);
  });

  it('always returns a real fact, whatever the seed', () => {
    for (const seed of ['a', 'ππ', '👋', 'x'.repeat(500), '0', '-1']) {
      expect(TRIVIA).toContain(pickTrivia(seed));
    }
  });

  it('spreads across the set rather than parking on one entry', () => {
    // A hash that collapsed — a bad multiply, an overflow to a float — would
    // still return a valid fact and would give every account the same one.
    const seen = new Set(
      Array.from({ length: 400 }, (_, i) => TRIVIA.indexOf(pickTrivia(`user-${i}`))),
    );
    expect(seen.size).toBe(TRIVIA.length);
  });
});

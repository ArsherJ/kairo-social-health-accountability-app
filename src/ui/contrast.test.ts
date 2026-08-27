import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.ts';
import { colors, ramp } from '../theme.ts';

/**
 * The palette's accessibility claims, as assertions.
 *
 * This file exists because `colors.accent` changed hue on 2026-08-27 and the
 * new amber measures 1.9:1 as text on cream, where the terracotta it replaced
 * measured 4.7:1. Every rule below is a rule the redesign can silently undo by
 * moving one hex value, and none of them fails visibly — low-contrast text
 * renders perfectly, it is just unreadable for some people.
 *
 * WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px
 * bold) and for meaningful non-text such as a hairline rule.
 */

const AA_BODY = 4.5;
const AA_LARGE = 3;

describe('contrastRatio', () => {
  it('is 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#c9721c', '#c9721c')).toBeCloseTo(1, 5);
  });

  it('is symmetric — the order of the arguments does not matter', () => {
    expect(contrastRatio('#3e2e22', '#fff6e8')).toBeCloseTo(
      contrastRatio('#fff6e8', '#3e2e22'),
      5,
    );
  });

  it('accepts three-digit hex and is case-insensitive', () => {
    expect(contrastRatio('#FFF', '#000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#AbCdEf', '#000000')).toBeCloseTo(
      contrastRatio('#abcdef', '#000000'),
      5,
    );
  });
});

describe('body text is readable on every ground it is set on', () => {
  it.each([
    ['text on the page', colors.text, colors.bg],
    ['text on a card', colors.text, colors.surface],
    ['text on the amber tint', colors.text, ramp.accent[200]],
    ['text on the sky field', colors.text, colors.sky],
    ['subtle on the page', colors.subtle, colors.bg],
    ['subtle on a card', colors.subtle, colors.surface],
  ])('%s', (_name, fg, bg) => {
    expect(contrastRatio(fg as string, bg as string)).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe('the three accent roles, each on the ground it is allowed on', () => {
  it('accent is a FILL — ink sits on it, and it is never text', () => {
    // The rule the whole split exists for. If someone re-points a text style
    // at `colors.accent`, this is the number they are choosing.
    expect(contrastRatio(colors.text, colors.accent)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(colors.accent, colors.bg)).toBeLessThan(AA_LARGE);
  });

  it('accentInk is large display type on the page, and nothing smaller', () => {
    expect(contrastRatio(colors.accentInk, colors.bg)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('accentDeep is body-size accent text, on the page and on the tint', () => {
    expect(contrastRatio(colors.accentDeep, colors.bg)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(colors.accentDeep, ramp.accent[200])).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe('the ramp keeps its ink-strength contract', () => {
  // This is what lets 37 `ramp.accent[N]` call sites migrate without being
  // edited. Break it and they all quietly go wrong at once.
  it('accent 700 carries body text on the page — Label sets a 10pt eyebrow in it', () => {
    expect(contrastRatio(ramp.accent[700], colors.bg)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('accent 800 and 900 carry body text on the 200 wash', () => {
    expect(contrastRatio(ramp.accent[800], ramp.accent[200])).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(ramp.accent[900], ramp.accent[200])).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('sage 700 and 800 carry body text on the page and on the sage wash', () => {
    expect(contrastRatio(ramp.sage[700], colors.bg)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(ramp.sage[800], ramp.sage[200])).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('neutral 600 is the lightest step that may carry body text', () => {
    expect(contrastRatio(ramp.neutral[600], colors.bg)).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe('the supporting families', () => {
  it('teal is a fill that carries a cream label at body size', () => {
    // The secondary button. `font.display.action` is 18pt Caprasimo, which is
    // NOT "large" under WCAG — large needs 24pt, or 18.66pt *bold*, and
    // Caprasimo ships in one weight so there is no bold to reach for. So this
    // is the body threshold, and it is why `colors.teal` is a darker step than
    // the design's bright `#35a99b`: that one measures 2.7:1 against cream.
    expect(contrastRatio(colors.bg, colors.teal)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('tealInk is text on the teal wash', () => {
    expect(contrastRatio(colors.tealInk, colors.tealTint)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('the decorative teal is never asked to carry a label', () => {
    // `ramp.teal[500]` is the design's bright teal and exists for dots and
    // washes. Asserting it fails as a label ground is what stops it being
    // reached for as a button fill later.
    expect(contrastRatio(colors.bg, ramp.teal[500])).toBeLessThan(AA_BODY);
  });

  it('damage carries body text on the page', () => {
    expect(contrastRatio(colors.damage, colors.bg)).toBeGreaterThanOrEqual(AA_BODY);
  });
});

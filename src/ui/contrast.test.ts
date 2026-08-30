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

  /**
   * The coral split, which is Playful's version of the amber one.
   *
   * The design sets "behind pace" in `#d62e6b`, which measures 4.40:1 on cream
   * — near enough to pass a glance and not near enough to pass AA. So the two
   * roles are separated the same way `accent` was: `coralEdge` is the fill and
   * the 3px lip under a coral button, `damage` is the ink. They sit side by
   * side on the Flock tab, so the pair has to be deliberate rather than a
   * rounding of one value.
   */
  it('coral is a FILL — ink sits on it, and it is never body text', () => {
    expect(contrastRatio(colors.text, colors.coral)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(colors.coral, colors.bg)).toBeLessThan(AA_BODY);
  });

  it('coralEdge is a fill too — it is the lip, not the label', () => {
    expect(contrastRatio(colors.coralEdge, colors.bg)).toBeLessThan(AA_BODY);
  });

  it('damage carries body text on the coral wash as well as the page', () => {
    expect(contrastRatio(colors.damage, colors.coralTint)).toBeGreaterThanOrEqual(AA_BODY);
  });
});

/**
 * The two families Playful added.
 *
 * Both exist to say something the four inherited families had no word for, and
 * both are mostly *fills* — which is exactly why each needs an ink pinned here.
 * A new family with no tested ink is one where the first person to need text on
 * it picks the 500 step and it looks fine to them.
 */
describe('gold — earned, and only earned', () => {
  it('gold 400 is a fill that ink sits on: a crown, a flag, a cleared day', () => {
    // `earnedColor` is this step. The numeral on a cleared calendar cell and
    // the crown on the leader's row are both ink on gold.
    expect(contrastRatio(colors.text, ramp.gold[400])).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('gold 400 is NOT text on the page — it disappears on cream', () => {
    // The same trap as `colors.accent`, one family over. Gold on cream is the
    // most tempting wrong choice in this palette, because it looks like a
    // highlight and reads like nothing.
    expect(contrastRatio(ramp.gold[400], colors.bg)).toBeLessThan(AA_LARGE);
  });

  it('gold 700 is the ink when a gold thing has to be named in words', () => {
    expect(contrastRatio(ramp.gold[700], colors.bg)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(ramp.gold[800], ramp.gold[200])).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe('sky — the flight, and the blue beat of onboarding', () => {
  it('sky 900 is the ground the flight is drawn on, and cream reads on it', () => {
    // `colors.night`. Every label over the corridor is cream on this.
    expect(contrastRatio(colors.bg, colors.night)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio('#ffffff', colors.midnight)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('sky 700 carries a cream label — the blue CTA in the onboarding run', () => {
    expect(contrastRatio(colors.bg, ramp.sky[700])).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('sky 400 is decorative and never a label ground', () => {
    // The bright `#5cc6ff` the flight ramps through. Asserting it fails is
    // what stops it being reached for as a button fill later — the same guard
    // `ramp.teal[500]` gets above.
    expect(contrastRatio(colors.bg, ramp.sky[400])).toBeLessThan(AA_BODY);
  });

  it('sky 700 is the ink when blue has to be read on the page', () => {
    expect(contrastRatio(ramp.sky[700], colors.bg)).toBeGreaterThanOrEqual(AA_BODY);
  });
});

/**
 * Every painted fill in the app, and what may be set on it.
 *
 * This block exists because the Playful swap broke four call sites at once and
 * none of them looked broken. Sunlit's accent was amber, and cream-on-amber was
 * already impossible, so nobody had written cream on it; Playful's is orange,
 * and orange *looks* dark enough to take a cream label. It is not — 2.65:1 —
 * and neither is coral (2.93) nor gold (1.52). The tab bar's active pill, the
 * board's day toggle, and the streak chip all shipped that pairing in the first
 * pass of this redesign.
 *
 * So the rule is stated once here rather than trusted to each surface: **a
 * bright fill takes ink.** The design's own mockups draw these labels white,
 * and on these hues that is not a choice this app can make.
 */
describe('a bright fill takes ink, never cream', () => {
  const brightFills: [string, string][] = [
    ['accent — the primary fill', colors.accent],
    ['coral — the streak pill', colors.coral],
    ['gold — earned', ramp.gold[400]],
    ['the light violet on the nav', ramp.sage[400]],
    ['the bright blue on the nav', ramp.sky[400]],
    ['the bright teal', ramp.teal[400]],
  ];

  it.each(brightFills)('ink reads on %s', (_name, fill) => {
    expect(contrastRatio(colors.text, fill)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each(brightFills)('cream does NOT read on %s — so nobody reaches for it', (_name, fill) => {
    // Asserting the *failure* is the point. A future palette shift that made
    // one of these dark enough for cream would be a real change worth noticing,
    // and this is what notices it.
    expect(contrastRatio(colors.bg, fill)).toBeLessThan(AA_BODY);
  });

  /**
   * `coralEdge` is the exception, and the exception is the useful part.
   *
   * It is a mid-tone: 3.33:1 under ink and 4.40:1 under cream, so it carries
   * **neither** at body size. That is not a value to fix — it is exactly what a
   * 3px lip under a coral button should be, sitting between the fill above it
   * and the ground below. What it must never become is a surface somebody sets
   * a word on, and the only way to say so is to assert both failures.
   */
  it('coralEdge carries no label at all — it is a lip, and only a lip', () => {
    expect(contrastRatio(colors.text, colors.coralEdge)).toBeLessThan(AA_BODY);
    expect(contrastRatio(colors.bg, colors.coralEdge)).toBeLessThan(AA_BODY);
  });
});

/**
 * The deep fills, which are the other half of the same rule.
 *
 * These carry cream because they are dark, and each is the deeper sibling of a
 * bright fill above — reached for exactly when a surface has to carry cream
 * type over its whole height. The Flock band is the case that forced the
 * distinction: it runs violet into pink behind a cream squad name and a cream
 * standing, so its pink end is `damage` and not `coral`.
 */
describe('a deep fill takes cream', () => {
  it.each([
    ['sage 600 — the top of the Flock band', ramp.sage[600]],
    ['damage — the foot of the Flock band', colors.damage],
    ['teal — the secondary action', colors.teal],
    ['sky 700 — the blue CTA', ramp.sky[700]],
    ['night — the flight', colors.night],
  ])('cream reads on %s', (_name, fill) => {
    expect(contrastRatio(colors.bg, fill as string)).toBeGreaterThanOrEqual(AA_BODY);
  });
});

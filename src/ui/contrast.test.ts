import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.ts';
import { STAT_COLORS } from './stat-colors.ts';
import { colors, dark, ramp } from '../theme.ts';

/**
 * The palette's accessibility claims, as assertions.
 *
 * Every rule below is a rule a palette change can silently undo by moving one
 * hex value. Low-contrast text still renders perfectly; it is just unreadable
 * for some people.
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
    ['text on the apricot tint', colors.text, ramp.accent[200]],
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
    // The secondary button. `font.display.action` is 19pt Fredoka, which is
    // not large under WCAG, so the deep mint keeps the body threshold.
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
   * The soft coral fill and its readable damage ink are separate roles.
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
 * This block exists because an earlier palette swap broke four call sites at
 * once and none of them looked broken. Soft fills can look dark enough to take
 * a cream label while still missing body contrast.
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
   * It is a mid-tone that carries **neither** ink at body size. That is not a
   * value to fix: it is decoration rather than a surface for words.
   */
  it('coralEdge carries no label at all — it is a lip, and only a lip', () => {
    expect(contrastRatio(colors.text, colors.coralEdge)).toBeLessThan(AA_BODY);
    expect(contrastRatio(colors.bg, colors.coralEdge)).toBeLessThan(AA_BODY);
  });
});

/**
 * The stat hues — the third table this file reaches, and the reason
 * `STAT_COLORS` moved out of `StatIcon.tsx` on 2026-09-07.
 *
 * That file reaches `@expo/vector-icons`, so root Vitest could not load it and
 * these three values had no assertion of any kind.
 *
 * **What is asserted here is separation, not contrast, and that is deliberate.**
 * Measured on the cream ground these are 1.75:1, 1.84:1 and 2.68:1. They sit
 * under WCAG 1.4.11's 3:1 for meaningful non-text, but they are not
 * meaningful non-text: a stat glyph never carries a fact by itself — the rating
 * is printed beside it, and a Flock row is one accessibility element whose label
 * (`row-label.ts`) speaks every stat by name. The hues make a dense row
 * *scannable* for somebody who can already read it. Raising them is a palette
 * decision with ~37 call sites behind it, not a change to smuggle in under a
 * crest.
 *
 * So the rule that binds this table is that its three values stay apart, which
 * is the whole reason it exists — three glyphs at 11pt with no words beside
 * them, and since issue #33 three crests at 44pt in a flock row. The ratios are
 * pinned alongside, so a palette shift that moved one is visible here rather
 * than only on a device.
 *
 * A caller wanting to *write* a stat's name still needs the matching ink —
 * `accentDeep`, `damage`, `ramp.sage[700]` — never this table. No single rule
 * covers it: `ramp.sage[500]` is a mid-tone that takes cream where
 * `colors.accent` takes ink, which is precisely why the inks are named
 * individually.
 */
describe('the stat hues stay apart, and stay off words', () => {
  const statHues = Object.entries(STAT_COLORS);

  it('keeps the three visibly apart, which is the whole reason they exist', () => {
    expect(new Set(Object.values(STAT_COLORS)).size).toBe(statHues.length);
  });

  it.each(statHues)('%s sits where it sat when this was written', (_stat, hue) => {
    // A characterization pin, not a bar: it notices a hue moving, and says
    // nothing about which way is better.
    const measured: Record<string, number> = { AGI: 1.75, STR: 1.84, MND: 2.68 };
    expect(contrastRatio(hue, colors.bg)).toBeCloseTo(measured[_stat] as number, 1);
  });

  it.each(statHues)('%s carries no word on cream at body size', (_stat, hue) => {
    // The claim the table's own doc makes. The matching ink roles carry words;
    // these decorative family fills do not.
    expect(contrastRatio(hue, colors.bg)).toBeLessThan(AA_BODY * 1.01);
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

/**
 * The dark palette, held to the same claims (deviation #72).
 *
 * Every rule above reads the static exports, which are the light scheme. The
 * dark scheme keeps the token names and the ramp's ink-strength contract, and
 * that contract is what these assert: a wash you set text on, a fill ink sits
 * on, an ink that reads on the page. Two tokens do not flip — `ink` stays dark
 * and `onDeep` stays light — because a bright apricot takes dark ink whatever
 * the page behind it is, and those two are what the bright and deep fills
 * carry in both schemes.
 */
describe('the dark scheme keeps every claim the light one makes', () => {
  const { colors: c, ramp: r } = dark;

  it.each([
    ['text on the page', c.text, c.bg],
    ['text on a card', c.text, c.surface],
    ['text on the lifted card', c.text, c.surfaceLift],
    ['text on the apricot wash', c.text, r.accent[200]],
    ['text on the sky field', c.text, c.sky],
    ['subtle on the page', c.subtle, c.bg],
    ['subtle on a card', c.subtle, c.surface],
    ['muted on the page', c.muted, c.bg],
    ['muted on a card', c.muted, c.surface],
  ])('%s', (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('accentDeep is body-size apricot ink on the page and on the wash', () => {
    expect(contrastRatio(c.accentDeep, c.bg)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(c.accentDeep, r.accent[200])).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('accentInk is large display type on the page', () => {
    expect(contrastRatio(c.accentInk, c.bg)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('the 700 step of every family is an ink on the page', () => {
    for (const family of ['accent', 'sage', 'teal', 'gold', 'neutral'] as const) {
      expect(contrastRatio(r[family][700], c.bg), family).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('the 800 step of every family is an ink on its own 200 wash', () => {
    for (const family of ['accent', 'sage', 'teal', 'gold', 'neutral'] as const) {
      expect(contrastRatio(r[family][800], r[family][200]), family).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('neutral 600 is the lightest step that may carry body text', () => {
    expect(contrastRatio(r.neutral[600], c.bg)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('damage carries body text on the page and on the coral wash', () => {
    expect(contrastRatio(c.damage, c.bg)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(c.damage, c.coralTint)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('tealInk is text on the teal wash', () => {
    expect(contrastRatio(c.tealInk, c.tealTint)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each([
    ['accent', c.accent],
    ['coral', c.coral],
    ['gold 400', r.gold[400]],
    ['sage 400', r.sage[400]],
    ['sky 400', r.sky[400]],
    ['teal 400', r.teal[400]],
  ])('ink reads on the bright fill %s', (_name, fill) => {
    expect(contrastRatio(c.ink, fill)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each([
    ['sage 600', r.sage[600]],
    ['teal', c.teal],
    ['night', c.night],
  ])('onDeep reads on the deep fill %s', (_name, fill) => {
    expect(contrastRatio(c.onDeep, fill)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('ink and onDeep are the same in both schemes — they answer to the fill, not the page', () => {
    expect(c.ink).toBe(colors.ink);
    expect(c.onDeep).toBe(colors.onDeep);
    expect(colors.ink).toBe(colors.text);
    expect(colors.onDeep).toBe(colors.bg);
  });

  it('keeps the middle of every ramp — the fills — the same hue in both schemes', () => {
    // A fill is a fill: the primary button is the same apricot at night. Only
    // the ends of a ramp move, and they move because they are inks and washes.
    for (const family of ['accent', 'sage', 'teal', 'gold', 'sky'] as const) {
      expect(r[family][500], family).toBe(ramp[family][500]);
    }
  });
});

/**
 * Design tokens — the **Sunlit** system (2026-08-27, deviation #53).
 *
 * Kairo used to be near-black with a violet accent, then warm-light with a
 * terracotta one. It is Sunlit now: a brighter cream ground, amber for you,
 * sage for your lane and your squad, teal for rest, deep coral for damage.
 * Depth comes from shadow rather than from a border, so anything reaching for
 * `borderColor` to build a card is working against the system — and on Sunlit
 * `surface` and `bg` differ by a hair, so reaching for a darker surface is
 * working against it twice.
 *
 * **Every token kept its name through that shift**, which is what let around
 * ninety call sites re-skin without being edited. The one exception is
 * `colors.accent`, which used to be both a fill and a text colour and can only
 * be a fill at amber: it split into `accent` (fill), `accentInk` (large display
 * type) and `accentDeep` (body-size text). `src/ui/contrast.test.ts` holds
 * every accessibility claim these comments make.
 *
 * Four colour families, one job each. Keeping them apart is what lets a
 * screenshot be read at a glance:
 *
 * - **amber** (`accent`) — you, your score, the primary action. A fill.
 * - **sage** (`sage`) — your lane, and squad warmth. Never a call to action.
 * - **teal** (`teal`) — rest, and the second action on a screen.
 * - **coral** (`damage`) — a battle slipping away, and only that.
 */

import type { TextStyle } from 'react-native';

/**
 * The tonal ramps, generated in OKLCH on one shared lightness scale — the same
 * step of any role matches the others in visual value, which is what makes a
 * sage 200 and an accent 200 sit together without one shouting.
 *
 * Read them as *ink strength*, not as brightness: on a cream ground, 200 is a
 * quiet wash and 900 is nearly black. That is the opposite of the old dark
 * palette, where a high number meant a brighter glow.
 *
 * **The step contract is ink strength, and it is load-bearing.** 200 is a wash
 * you set text on; 500 is a fill; 700 and 800 are inks. Thirty-seven call sites
 * read `ramp.accent[N]` directly and none of them was edited when the palette
 * changed hue on 2026-08-27 — they are correct by construction *because* the
 * contract held. `contrast.test.ts` pins the three steps that carry text.
 * Moving a step's strength silently breaks every site that reads it.
 */
export const ramp = {
  neutral: {
    100: '#fff9ef',
    200: '#f3e7d6',
    300: '#e3d5c0',
    400: '#c9bba8',
    500: '#a3927e',
    600: '#7d6c59',
    700: '#635341',
    800: '#4a3a2c',
    900: '#3e2e22',
  },
  accent: {
    100: '#fff4e0',
    200: '#fcebcb',
    300: '#fbdca6',
    400: '#f7c56a',
    500: '#f5a623',
    600: '#d1860f',
    700: '#a35f0e',
    800: '#7a4409',
    900: '#4a2907',
  },
  sage: {
    100: '#f4f8e6',
    200: '#eef3dc',
    300: '#d7e3bd',
    400: '#b3c894',
    500: '#8fae6a',
    600: '#6f8f4c',
    700: '#566f39',
    800: '#3f5228',
    900: '#2a3719',
  },
  teal: {
    100: '#f0f8f5',
    200: '#e4f2ec',
    300: '#cbe6dc',
    400: '#7fc9bb',
    500: '#35a99b',
    600: '#237f72',
    700: '#1a5f55',
    800: '#2f5c50',
    900: '#173a33',
  },
} as const;

export const colors = {
  bg: '#fff6e8',
  /**
   * A card. On Sunlit a card is separated from the ground by **shadow**, not
   * by tint — the two differ by a hair on purpose, which is why `Panel.plain`
   * gained an elevation when this landed. Reaching for a darker surface to
   * make a card legible is working against the system.
   */
  surface: ramp.neutral[100],
  /** Raised surface. White, for chrome that floats over content — the tab bar. */
  surfaceLift: '#ffffff',
  /**
   * The warm field the character occupies. **A place, not a card**: no radius
   * of its own, no shadow, and nothing that is not the character's own sky may
   * use it.
   */
  sky: '#ffe7bc',
  // An 8-digit hex is a real colour to RN — the system's divider at 16% alpha.
  // Not measurable by `contrastRatio`, which is why it is excluded there.
  border: '#3e2e2229',
  borderStrong: ramp.neutral[400],
  text: '#3e2e22',
  subtle: ramp.neutral[700],
  muted: ramp.neutral[600],
  /**
   * Amber. **A fill and never text** — 1.9:1 on `bg`, which is invisible.
   *
   * This token was terracotta until 2026-08-27 and could be used for both. It
   * cannot now, and that is the single easiest thing in this redesign to undo
   * by accident: pointing a `color:` at it renders perfectly and is unreadable.
   * `contrast.test.ts` asserts it fails as text, so the test goes red if the
   * value ever drifts back into a range that would tempt someone.
   *
   * Ink on it is `colors.text` at 6.4:1.
   */
  accent: ramp.accent[500],
  /**
   * Accent as **large display type only** — 24pt and up, or 18.66pt bold.
   * 3.3:1 on `bg`. The day's step count at 56pt is what this exists for.
   *
   * Deliberately *not* a ramp step: `ramp.accent[700]` has to carry `Label`'s
   * 10pt eyebrow, and this is too light for that.
   */
  accentInk: '#c9721c',
  /**
   * Accent as **body-size text**, on the page or on the `ramp.accent[200]` wash.
   *
   * `ramp.accent[800]` and not 700, which was the obvious choice and is wrong:
   * 700 measures 4.71:1 on `bg` but only **4.30:1** on the amber wash, and
   * accent text on the amber wash is the commonest thing this token does. One
   * value that passes on both grounds beats two that each pass on one.
   */
  accentDeep: ramp.accent[800],
  /** The hard 3px lip under a primary button. Never a text colour. */
  accentEdge: ramp.accent[600],
  /** Sage. Your lane, squad warmth, and the design's "moss". Never a call to action. */
  sage: ramp.sage[600],
  /**
   * Teal. **Rest, and the secondary action** — the sleep card, the invite
   * block, "Cheer the flock".
   *
   * The fourth family, added 2026-08-27. It earns a place beside sage because
   * the two say different things: sage is *your lane*, teal is *recovery* and
   * the second button on a screen that already spent its amber.
   *
   * `ramp.teal[600]` and not the design's bright `[500]`: a cream label on
   * `#35a99b` is 2.7:1, and `font.display.action` is 18pt Caprasimo, which is
   * not "large" under WCAG — Caprasimo has one weight, so there is no bold cut
   * to qualify it. The bright step stays available for dots and washes.
   */
  teal: ramp.teal[600],
  tealEdge: ramp.teal[700],
  tealTint: ramp.teal[200],
  tealInk: ramp.teal[800],
  /**
   * The streak. One job, one place — the pill on the character's HUD.
   * A fill; `damage` is the readable ink in this hue.
   */
  coral: '#ff7a5c',
  /**
   * A battle slipping away, and only that.
   *
   * Retargeted from sabotage on 2026-08-09 and re-hued on 2026-08-27: it used
   * to be `ramp.accent[800]`, which is now an amber and would have made every
   * "behind pace" line read as an accent. It is a deep coral instead — the same
   * family as `coral`, dark enough to set body text in.
   */
  damage: '#b04530',
  /** @deprecated Kept so older call sites still compile. Use `damage`. */
  danger: '#b04530',
} as const;

/**
 * The "earned" step on the terracotta ramp.
 *
 * This is what survives of the tier ladder. Bronze/Silver/Gold stopped being
 * shown on 2026-08-10 — the character sheet reads mastery now, and the
 * bands live entirely inside scoring — but two things still need the colour the
 * old `tierColors.gold` carried, and neither is about a tier:
 *
 *   - the squad leader's row and a banked Streak Shield (`Panel`'s `earned` edge)
 *   - the All-Rounder's presence ring (`CharacterFigure`)
 *
 * Both mean "earned", and neither means "you" — which is the distinction that
 * kept them off `colors.accent` in the first place. Naming it for the job rather
 * than for a rank it no longer refers to is the whole of this rename.
 *
 * Unchanged by the Sunlit shift: it is `ramp.accent[600]` before and after, so
 * it moved hue with the ramp and kept its strength. It is a fill and an edge —
 * `colors.accentEdge` is the same value under the name the button uses.
 */
export const earnedColor = ramp.accent[600];

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 28,
  /** Cards and sheets — the system's "rounded frame" step. */
  xl: 32,
  pill: 999,
} as const;

/**
 * Elevation, derived from the ground: soft ink-tinted shadows.
 *
 * This is what replaced the old palette's 1px borders. RN's `shadowRadius` is
 * roughly half a CSS blur, which is why these numbers look smaller than the
 * design's `0 3px 10px`. `elevation` keeps Android in step; the app is iOS
 * first (§15) but the tokens should not be the reason that stops being true.
 */
export const shadow = {
  sm: {
    shadowColor: ramp.neutral[900],
    shadowOpacity: 0.14,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: ramp.neutral[900],
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  lg: {
    shadowColor: ramp.neutral[900],
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

/**
 * Two type roles with a hard boundary.
 *
 * `display` is **Caprasimo**, and it replaced Chakra Petch as the display
 * voice. It carries every number and every name — the focal point of each
 * screen in Kairo is a number, and Caprasimo's weight is what stops those
 * reading as system-font bold. It ships in one weight, so there is no bold
 * to reach for: size and colour do that work instead.
 *
 * `body` is **Figtree** and owns all prose, every eyebrow, and every button.
 *
 * Weights are selected by *family name*, never by `fontWeight`. Setting both
 * asks iOS to synthesise a weight on top of an already-weighted face, which
 * renders as a smeared approximation of the real cut.
 *
 * Everything numeric is tabular: boards refetch on realtime broadcasts, and
 * proportional digits make a live number visibly jitter.
 */
const DISPLAY = 'Caprasimo-Regular';
const BODY = 'Figtree-Regular';
const BODY_SEMI = 'Figtree-SemiBold';
const BODY_BOLD = 'Figtree-Bold';
// Typed, not `as const`: `as const` would make this a readonly tuple, which is
// not assignable to TextStyle['fontVariant'].
const NUM: Pick<TextStyle, 'fontVariant'> = { fontVariant: ['tabular-nums'] };

export const font = {
  display: {
    hero: { fontFamily: DISPLAY, fontSize: 64, letterSpacing: -1.3, ...NUM },
    major: { fontFamily: DISPLAY, fontSize: 34, letterSpacing: -0.5, ...NUM },
    minor: { fontFamily: DISPLAY, fontSize: 20, ...NUM },
    /** Row names and anything else Caprasimo says at reading size. */
    small: { fontFamily: DISPLAY, fontSize: 15, ...NUM },
    /** Buttons. Caprasimo, not Figtree — the system sets `.btn` in the display face. */
    action: { fontFamily: DISPLAY, fontSize: 18, ...NUM },
    /** The three letters on a stat coin. */
    label: { fontFamily: DISPLAY, fontSize: 13, ...NUM },
    // No `...NUM`: the wordmark is not a numeral, so tabular figures do not apply.
    brand: { fontFamily: DISPLAY, fontSize: 34, letterSpacing: 4 },
  },
  body: {
    title: { fontFamily: BODY_BOLD, fontSize: 24 },
    body: { fontFamily: BODY, fontSize: 15 },
    /** Meta lines — "Lv 15 · 12-day streak", "14 minutes ago". */
    strong: { fontFamily: BODY_SEMI, fontSize: 12.5 },
    /** The eyebrow. Always paired with `textTransform: 'uppercase'`. */
    label: { fontFamily: BODY_BOLD, fontSize: 10, letterSpacing: 1 },
    button: { fontFamily: BODY_BOLD, fontSize: 16 },
  },
} as const;

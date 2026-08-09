/**
 * Design tokens — the "Organic" warm system from the redesign.
 *
 * Kairo used to be near-black with a violet accent. It is now a *warm light*
 * app: cream ground, terracotta for you, sage for your lane and your squad,
 * deep burnt for damage. The change is not a reskin — it inverts which way
 * elevation goes (raised is now *lighter*, and depth comes from shadow rather
 * than from a border), so anything reaching for `borderColor` to build a card
 * is now working against the system.
 *
 * Three colour families, one job each. Keeping them apart is what lets a
 * screenshot be read at a glance:
 *
 * - **terracotta** (`accent`) — you, your score, the primary action.
 * - **sage** (`sage`) — your lane, and squad warmth. Never a call to action.
 * - **burnt** (`damage`) — sabotage, and only sabotage.
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
 */
export const ramp = {
  neutral: {
    100: '#f9f4ed',
    200: '#eee7db',
    300: '#dcd3c4',
    400: '#c0b6a5',
    500: '#a19786',
    600: '#82796a',
    700: '#645c50',
    800: '#474238',
    900: '#2e2b25',
  },
  accent: {
    100: '#fff2eb',
    200: '#ffe1d0',
    300: '#ffc6a5',
    400: '#f6a06b',
    500: '#d67f48',
    600: '#b2622d',
    700: '#8c491a',
    800: '#643312',
    900: '#402310',
  },
  sage: {
    100: '#f0fae1',
    200: '#e1eecc',
    300: '#ccdbb2',
    400: '#aebf92',
    500: '#8fa073',
    600: '#728157',
    700: '#56633f',
    800: '#3d472b',
    900: '#272e1b',
  },
} as const;

export const colors = {
  bg: '#f5ead8',
  surface: '#ebddc5',
  /** Raised surface. On a light ground raised means *lighter*, not darker. */
  surfaceLift: ramp.neutral[100],
  // An 8-digit hex is a real colour to RN — #201e1d at 16% alpha, the
  // system's divider. Kept for rules and hairlines; it is no longer what
  // makes a card a card. Use `shadow` for that.
  border: '#201e1d29',
  borderStrong: ramp.neutral[400],
  text: '#201e1d',
  subtle: ramp.neutral[700],
  muted: ramp.neutral[600],
  /** Terracotta. "You" — your score, your level, the primary action. */
  accent: '#c67139',
  /** Sage. Your lane, and squad warmth. Never a call to action. */
  sage: '#7a8a5e',
  /**
   * Sabotage, and only sabotage. Deep burnt rather than a red: a true red
   * would be the only hue in the app outside the terracotta/sage families and
   * would read as a system error rather than as a squadmate getting you.
   */
  damage: ramp.accent[800],
  /** @deprecated Kept so older call sites still compile. Use `damage`. */
  danger: ramp.accent[800],
} as const;

/**
 * Tier colours (§6) — now one terracotta ladder rather than three metals.
 *
 * Metallic gold/silver/bronze cannot all stay legible on cream, and three
 * unrelated hues fought the two-family rule above. Climbing the same ramp
 * says "further along" with no extra vocabulary, and Gold earns a ring on
 * top of its step (see `TierCoin`) so the ceiling still looks like a ceiling.
 *
 * These are **fills and rings, not text**. On cream, Bronze is lighter than
 * the background it would sit on — for a label, ask `tierInk`.
 */
export const tierColors = {
  gold: ramp.accent[600],
  silver: ramp.accent[400],
  bronze: ramp.accent[300],
  none: ramp.neutral[300],
} as const;

export function tierColor(tier: string | undefined): string {
  return tierColors[(tier ?? 'none') as keyof typeof tierColors] ?? tierColors.none;
}

/**
 * The readable ink for a tier's *name*.
 *
 * Only Gold gets terracotta ink. Silver and Bronze are real achievements but
 * they are not the ceiling, and colouring all three would spend the palette's
 * one loud move three times.
 */
export function tierInk(tier: string | undefined): string {
  if (tier === 'gold') return ramp.accent[700];
  if (tier === undefined || tier === 'none') return ramp.neutral[500];
  return ramp.neutral[700];
}

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

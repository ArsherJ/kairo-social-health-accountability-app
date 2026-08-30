/**
 * Design tokens — the **Playful** system (2026-08-30, deviation #58).
 *
 * Kairo used to be near-black with a violet accent, then warm-light with a
 * terracotta one, then Sunlit — a cream ground with amber for you and sage for
 * your lane. It is Playful now: the same cream ground under a candy palette,
 * chunky rounded cards, and a display face with real personality. Depth comes
 * from a soft drop shadow and, on chrome that floats over content, from a
 * frosted translucent fill.
 *
 * **Every token kept its name through that shift**, exactly as through Sunlit's
 * — which is what lets ~90 call sites re-skin without being edited. A token
 * names a *role*, never a hue, and the roles did not move:
 *
 * - **`accent`** — you, your day, the primary action. Orange. A fill.
 * - **`sage`** — your lane, squad warmth, and Mind. Violet. Never a CTA.
 * - **`teal`** — rest, and the second action on a screen.
 * - **`coral` / `damage`** — the streak, and a battle slipping away. Pink.
 *
 * So `ramp.sage[500]` is a violet now and still means what it meant. Reading a
 * token's *name* for its hue is the one way to be wrong about this file.
 *
 * Two families are new, because Playful says two things Sunlit had no word
 * for: **`gold`** (earned — a crown, the ridge flag, a banked shield) and
 * **`sky`** (the flight, and the blue half of the onboarding run).
 *
 * `src/ui/contrast.test.ts` holds every accessibility claim these comments
 * make, and is the reason each value below is the one it is.
 */

import type { TextStyle } from 'react-native';

/**
 * The tonal ramps, on one shared lightness scale — the same step of any family
 * matches the others in visual value, which is what lets a sage 200 and an
 * accent 200 sit side by side without one shouting.
 *
 * Read them as *ink strength*, not as brightness: on a cream ground, 200 is a
 * quiet wash and 900 is nearly black.
 *
 * **The step contract is ink strength, and it is load-bearing.** 200 is a wash
 * you set text on; 500 is a fill; 700 and 800 are inks. Thirty-seven call sites
 * read `ramp.<family>[N]` directly and none was edited when the palette changed
 * hue on 2026-08-27, nor again here — they are correct by construction
 * *because* the contract held. `contrast.test.ts` pins the steps that carry
 * text. Moving a step's strength silently breaks every site that reads it.
 *
 * Where the design named a value it is used verbatim (`#FFF0E3`, `#EFE9FF`,
 * `#E6FAF6`, `#8A3410`, `#3B2680`); the rest fill the ramp around them.
 */
export const ramp = {
  /**
   * Warm grey drifting to indigo at the dark end, so `neutral[900]` *is*
   * `colors.text` — a muted line and the ink it supports are the same hue
   * family, which is what stops secondary copy reading as a different colour
   * rather than as a quieter one.
   */
  neutral: {
    100: '#fffbf4',
    200: '#f1ece4',
    300: '#e2dbd0',
    400: '#c2bab0',
    500: '#918a99',
    600: '#6b6394',
    700: '#4e477a',
    800: '#38315f',
    900: '#241b4d',
  },
  /** Orange. You, your day, the primary action. */
  accent: {
    100: '#fff7f0',
    200: '#fff0e3',
    300: '#ffe7d8',
    400: '#ffa877',
    500: '#ff6b35',
    600: '#e0521f',
    700: '#b24314',
    800: '#8a3410',
    900: '#5c220a',
  },
  /** Violet. Your lane, squad warmth, and Mind. */
  sage: {
    100: '#f7f4ff',
    200: '#efe9ff',
    300: '#ddd1ff',
    400: '#b69bff',
    500: '#7c4dff',
    600: '#6a3bef',
    700: '#5a2bd6',
    800: '#3b2680',
    900: '#241b4d',
  },
  /** Teal. Rest, and the second action. */
  teal: {
    100: '#f2fcf9',
    200: '#e6faf6',
    300: '#c6f0e8',
    400: '#5fdcc8',
    500: '#00c2a8',
    600: '#00a492',
    700: '#00786b',
    800: '#00584e',
    900: '#00332d',
  },
  /**
   * Gold. **Earned, and only earned** — a crown, the ridge flag, a banked
   * Streak Shield, the run of cleared days on the calendar.
   *
   * New in Playful, and it exists because Sunlit had to spend `accent[600]` on
   * this job (see `earnedColor` below) while amber was also the primary fill.
   * At two different hues the two roles can finally be told apart on sight:
   * orange means *you*, gold means *you earned it*.
   */
  gold: {
    100: '#fffaeb',
    200: '#fff2d0',
    300: '#ffe49e',
    400: '#ffc145',
    500: '#f5a623',
    600: '#cd7f0c',
    700: '#a3620b',
    800: '#7a4708',
    900: '#4d2c05',
  },
  /**
   * Blue. The flight, the altitude ticks, and the blue beat of the onboarding
   * run. **Never a stat and never a status** — those are spoken for, and a
   * fifth meaning on a screen that already carries four is how a palette stops
   * being readable at a glance.
   */
  sky: {
    100: '#f0faff',
    200: '#d8f3ff',
    300: '#b9e8ff',
    400: '#5cc6ff',
    500: '#2c9cff',
    600: '#0c7fd6',
    700: '#0c6fb8',
    800: '#0a5183',
    900: '#0b1b4d',
  },
} as const;

export const colors = {
  bg: '#fff6ec',
  /**
   * A card. Playful cards are **white on cream** and lifted by shadow — the
   * ground is warm enough that plain white reads as raised without a border.
   * Reaching for `borderColor` to build a card is working against the system;
   * a border here means *selected*, never *contained*.
   */
  surface: '#ffffff',
  /** Raised surface. Chrome that floats over content — the tab bar. */
  surfaceLift: '#ffffff',
  /**
   * The warm field the character occupies. **A place, not a card**: no radius
   * of its own, no shadow, and nothing that is not the character's own sky may
   * use it. On Playful the bird stands in daylight, so this is the pale bottom
   * of the hero's blue ramp rather than a tint of the ground.
   */
  sky: ramp.sky[200],
  /** The ground the flight is drawn on, and the dark half of onboarding. */
  night: ramp.sky[900],
  /** Darker still — the permissions and trivia beats, where the sheet lifts. */
  midnight: '#141033',
  // An 8-digit hex is a real colour to RN — the system's divider at 16% alpha.
  // Not measurable by `contrastRatio`, which is why it is excluded there.
  border: '#241b4d29',
  borderStrong: ramp.neutral[400],
  text: '#241b4d',
  subtle: ramp.neutral[700],
  muted: ramp.neutral[600],
  /**
   * Orange. **A fill and never text** — 2.65:1 on `bg`, which is unreadable.
   *
   * This is the single easiest thing in the palette to undo by accident:
   * pointing a `color:` at it renders perfectly and fails for anyone who needs
   * contrast. `contrast.test.ts` asserts it fails as text, so the test goes red
   * if the value ever drifts back into a range that would tempt somebody.
   *
   * Ink on it is `colors.text` at 5.53:1.
   */
  accent: ramp.accent[500],
  /**
   * Accent as **large display type only** — 24pt and up, or 18.66pt bold.
   * 4.12:1 on `bg`.
   *
   * Deliberately *not* a ramp step: `ramp.accent[700]` has to carry `Label`'s
   * 10pt eyebrow, and that is a heavier ink than a 62pt numeral wants.
   */
  accentInk: '#c9541c',
  /**
   * Accent as **body-size text**, on the page or on the `ramp.accent[200]`
   * wash. The design's own `#8A3410`, which is where it uses orange type.
   *
   * `ramp.accent[800]` and not 700 for the reason Sunlit found: accent text on
   * the amber wash is the commonest thing this token does, and one value that
   * passes on both grounds beats two that each pass on one. 7.62:1 on the page,
   * 7.30:1 on the wash.
   */
  accentDeep: ramp.accent[800],
  /** The hard 3px lip under a primary button. Never a text colour. */
  accentEdge: ramp.accent[600],
  /** Violet. Your lane, squad warmth, and Mind. Never a call to action. */
  sage: ramp.sage[600],
  /**
   * Teal. **Rest, and the secondary action** — the sleep card, the invite
   * block, "cleared".
   *
   * `ramp.teal[700]` and not the design's bright `[500]`: a cream label on
   * `#00c2a8` is 2.12:1, and `font.display.action` is 19pt Fredoka SemiBold,
   * which is not "large" under WCAG. The bright step stays available for dots,
   * washes, rings and check marks, where nothing has to be read off it.
   */
  teal: ramp.teal[700],
  tealEdge: ramp.teal[800],
  tealTint: ramp.teal[200],
  tealInk: ramp.teal[800],
  /**
   * The streak. A fill — the flame pill, the hot half of a gradient.
   * `damage` is the readable ink in this hue.
   */
  coral: '#ff4d8d',
  /** The 3px lip under a coral fill, and the ink on a coral wash. */
  coralEdge: '#d62e6b',
  coralTint: '#ffe3ee',
  /**
   * A battle slipping away, and only that.
   *
   * The design's `#d62e6b` measures 4.40:1 on cream — just under body AA — so
   * it stays a fill (`coralEdge`) and the readable ink is one step deeper at
   * 6.47:1. Same hue, and the two are used side by side.
   */
  damage: '#b0134a',
  /** @deprecated Kept so older call sites still compile. Use `damage`. */
  danger: '#b0134a',
} as const;

/**
 * Frosted chrome — the tab bar, the pinned flock rail, the card at the foot of
 * the flight, the sheet in the permissions beat.
 *
 * **This is not a blur.** `backdrop-filter` has no React Native equivalent and
 * `expo-blur` is a native module: adding it would move the fingerprint, spend
 * one of the month's fifteen EAS builds and withhold every OTA until that build
 * landed — the same trade the Sky corridor already refused for `react-native-svg`
 * (deviation #56). What ships instead is a translucent white fill over a
 * hairline highlight, which over these bright grounds reads as glass at a
 * glance and costs nothing.
 *
 * Two grounds, because the same fill cannot serve both: `light` over cream and
 * white, `dark` over the flight and the night beats.
 */
export const glass = {
  light: {
    fill: 'rgba(255,255,255,0.78)',
    fillSoft: 'rgba(255,255,255,0.46)',
    edge: 'rgba(255,255,255,0.9)',
  },
  dark: {
    fill: 'rgba(11,27,77,0.66)',
    fillSoft: 'rgba(11,27,77,0.42)',
    edge: 'rgba(255,255,255,0.28)',
  },
} as const;

/**
 * The "earned" step.
 *
 * This is what survives of the tier ladder. Bronze/Silver/Gold stopped being
 * shown on 2026-08-10 — the character sheet reads mastery now, and the bands
 * live entirely inside scoring — but several things still need the colour the
 * old `tierColors.gold` carried, and none is about a tier: the squad leader's
 * row, a banked Streak Shield, the All-Rounder's presence ring, the ridge flag,
 * and a cleared day on the calendar.
 *
 * All of them mean "earned", and none means "you" — which is the distinction
 * that kept them off `colors.accent` in the first place. **Playful is the first
 * palette that can actually show that distinction**: through Sunlit this was
 * `ramp.accent[600]`, one step of the same amber the primary fill came from, so
 * "you" and "you earned it" were a shade apart. It is its own hue now.
 */
export const earnedColor = ramp.gold[400];

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

/**
 * Playful is a rounder system than anything before it — a card is a 28–32pt
 * radius, a chip is a 24pt one, and chrome is a 34pt superellipse. `borderCurve:
 * 'continuous'` belongs on every one of them; at these radii the difference
 * between a circular and a continuous corner is plainly visible.
 */
export const radius = {
  sm: 10,
  md: 16,
  /** Chips, tiles, and the small end of a card. */
  lg: 24,
  /** Cards and sheets — the system's "rounded frame" step. */
  xl: 30,
  /** Floating chrome: the tab bar, a pinned rail, a lifted sheet. */
  xxl: 34,
  pill: 999,
} as const;

/**
 * Elevation, derived from the ground: soft ink-tinted shadows.
 *
 * This is what replaced the old palette's 1px borders, and Playful leans on it
 * harder — a white card on cream has no other edge. RN's `shadowRadius` is
 * roughly half a CSS blur, which is why these numbers look smaller than the
 * design's `0 18px 34px -22px`. `elevation` keeps Android in step; the app is
 * iOS first (§15) but the tokens should not be the reason that stops being true.
 */
export const shadow = {
  sm: {
    shadowColor: ramp.neutral[900],
    shadowOpacity: 0.14,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: ramp.neutral[900],
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  lg: {
    shadowColor: ramp.neutral[900],
    shadowOpacity: 0.24,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 13 },
    elevation: 8,
  },
} as const;

/**
 * Two type roles with a hard boundary.
 *
 * `display` is **Fredoka SemiBold**, and it replaced Caprasimo as the display
 * voice (which had replaced Chakra Petch). It carries every number and every
 * name — the focal point of each screen in Kairo is a number, and Fredoka's
 * rounded terminals are what make the same figure read as a game rather than as
 * a dashboard. Unlike Caprasimo it ships in more than one weight, but only one
 * more is bundled (`Fredoka-Bold`, for the wordmark), so size and colour still
 * do nearly all the work.
 *
 * `body` is **Nunito** and owns all prose, every eyebrow, and every meta line.
 * Three cuts are bundled: SemiBold for quiet copy, Bold as the default — the
 * design sets almost all its body text at 700 — and ExtraBold for the few
 * places a body-size line has to hold its own against a display figure.
 *
 * Weights are selected by *family name*, never by `fontWeight`. Setting both
 * asks iOS to synthesise a weight on top of an already-weighted face, which
 * renders as a smeared approximation of the real cut.
 *
 * Everything numeric is tabular: boards refetch on realtime broadcasts, and
 * proportional digits make a live number visibly jitter.
 */
const DISPLAY = 'Fredoka-SemiBold';
const DISPLAY_BOLD = 'Fredoka-Bold';
const BODY = 'Nunito-SemiBold';
const BODY_BOLD = 'Nunito-Bold';
const BODY_XBOLD = 'Nunito-ExtraBold';
// Typed, not `as const`: `as const` would make this a readonly tuple, which is
// not assignable to TextStyle['fontVariant'].
const NUM: Pick<TextStyle, 'fontVariant'> = { fontVariant: ['tabular-nums'] };

export const font = {
  display: {
    hero: { fontFamily: DISPLAY, fontSize: 62, letterSpacing: -1.5, ...NUM },
    major: { fontFamily: DISPLAY, fontSize: 32, letterSpacing: -0.4, ...NUM },
    minor: { fontFamily: DISPLAY, fontSize: 21, ...NUM },
    /** Row names and anything else Fredoka says at reading size. */
    small: { fontFamily: DISPLAY, fontSize: 17, ...NUM },
    /** Buttons. Fredoka, not Nunito — the system sets `.btn` in the display face. */
    action: { fontFamily: DISPLAY, fontSize: 19, ...NUM },
    /** The figure on a stat coin, and a chip's number. */
    label: { fontFamily: DISPLAY, fontSize: 14, ...NUM },
    // No `...NUM`: the wordmark is not a numeral, so tabular figures do not apply.
    brand: { fontFamily: DISPLAY_BOLD, fontSize: 56, letterSpacing: -1 },
    /** The wordmark at chrome size — the small KAIRO over an onboarding beat. */
    brandSmall: { fontFamily: DISPLAY, fontSize: 15, letterSpacing: 3 },
  },
  body: {
    title: { fontFamily: BODY_XBOLD, fontSize: 20 },
    body: { fontFamily: BODY_BOLD, fontSize: 13.5 },
    /** Copy that has to stay quiet beside a figure — a sheet's step captions. */
    quiet: { fontFamily: BODY, fontSize: 13 },
    /** Meta lines — "Joined August 2026 · Level 15", "14 minutes ago". */
    strong: { fontFamily: BODY_BOLD, fontSize: 12 },
    /** The eyebrow. Always paired with `textTransform: 'uppercase'`. */
    label: { fontFamily: BODY_BOLD, fontSize: 11, letterSpacing: 1.2 },
    button: { fontFamily: BODY_XBOLD, fontSize: 15 },
  },
} as const;

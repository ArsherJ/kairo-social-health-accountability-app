/**
 * Design tokens — the **warm-pastel** system (2026-09-11).
 *
 * Kairo used to be near-black with a violet accent, then warm-light with a
 * terracotta one, then Sunlit and Playful. It is warm-pastel now: a quiet cream
 * or charcoal-plum ground beneath apricot, lilac, mint, and earned gold. Depth
 * comes from restrained drop shadows and translucent fills on floating chrome.
 *
 * **Every token kept its name through that shift**, exactly as through Sunlit's
 * — which is what lets ~90 call sites re-skin without being edited. A token
 * names a *role*, never a hue, and the roles did not move:
 *
 * - **`accent`** — you, your day, the primary action. Orange. A fill.
 * - **`sage`** — your lane, squad warmth, and Mind. Violet. Never a CTA.
 * - **`teal`** — rest, and the second action on a screen.
 * - **`coral` / `damage`** — the streak, and things that went wrong. Pink.
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
 * The approved apricot, lilac, and mint anchors are used verbatim; the rest
 * preserve the same wash/fill/ink contract around them.
 */
export const ramp = {
  /**
   * Warm grey drifting to cocoa at the dark end, so `neutral[900]` *is*
   * `colors.text` — a muted line and the ink it supports are the same hue
   * family, which is what stops secondary copy reading as a different colour
   * rather than as a quieter one.
   */
  neutral: {
    100: '#fffdf9',
    200: '#f2ede8',
    300: '#e6ddd7',
    400: '#cbbfba',
    500: '#998b86',
    600: '#756761',
    700: '#61524d',
    800: '#4b3b35',
    900: '#382b29',
  },
  /** Apricot. You, your day, the primary action. */
  accent: {
    100: '#fff8f1',
    200: '#faeadc',
    300: '#f7d8bf',
    400: '#f5bd96',
    500: '#f4af82',
    600: '#d48658',
    700: '#99582f',
    800: '#754326',
    900: '#4f2f20',
  },
  /** Violet. Your lane, squad warmth, and Mind. */
  sage: {
    100: '#f8f4fc',
    200: '#f0e8f8',
    300: '#dfd2ef',
    400: '#c9b2e9',
    500: '#ac8bd3',
    600: '#795398',
    700: '#6e448f',
    800: '#523564',
    900: '#38283f',
  },
  /** Teal. Rest, and the second action. */
  teal: {
    100: '#f5faf6',
    200: '#e7f3eb',
    300: '#d2e9dd',
    400: '#b2dcca',
    500: '#77bba7',
    600: '#4f907d',
    700: '#386f60',
    800: '#28564a',
    900: '#193a32',
  },
  /**
   * Gold. **Earned, and only earned** — a crown, the ridge flag, a banked
   * Streak Shield, the run of cleared days on the calendar.
   *
   * It exists because the primary fill and earned feedback need to remain
   * distinguishable: apricot means *you*, gold means *you earned it*.
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
  bg: '#fbf8f2',
  /**
   * A card. Warm-pastel cards are **white on cream** and lifted by shadow — the
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
   * use it. In the light scheme the bird stands in daylight, so this is the
   * pale bottom of the hero's blue ramp rather than a tint of the ground.
   */
  sky: ramp.sky[200],
  /** The ground the flight is drawn on, and the dark half of onboarding. */
  night: ramp.sky[900],
  /** Darker still — the permissions and trivia beats, where the sheet lifts. */
  midnight: '#211c23',
  // An 8-digit hex is a real colour to RN — the system's divider at 16% alpha.
  // Not measurable by `contrastRatio`, which is why it is excluded there.
  border: '#382b291f',
  borderStrong: ramp.neutral[400],
  text: '#382b29',
  subtle: ramp.neutral[700],
  muted: ramp.neutral[600],
  /**
   * Apricot. **A fill and never text**.
   *
   * This is the single easiest thing in the palette to undo by accident:
   * pointing a `color:` at it renders perfectly and fails for anyone who needs
   * contrast. `contrast.test.ts` asserts it fails as text, so the test goes red
   * if the value ever drifts back into a range that would tempt somebody.
   *
   * Ink on it is `colors.ink`, in both schemes.
   */
  accent: ramp.accent[500],
  /**
   * Accent for **large display type**. The shared 700 ink also carries the
   * small accent eyebrow, so both roles remain readable without a second hue.
   */
  accentInk: ramp.accent[700],
  /**
   * Accent as **body-size text**, on the page or on the `ramp.accent[200]`
   * wash. One deep cocoa-apricot ink passes on both grounds.
   */
  accentDeep: ramp.accent[800],
  /** A deeper decorative edge. Never a text colour. */
  accentEdge: ramp.accent[600],
  /** Violet. Your lane, squad warmth, and Mind. Never a call to action. */
  sage: ramp.sage[600],
  /**
   * Teal. **Rest, and the secondary action** — the sleep card, the invite
   * block, "cleared".
   *
   * `ramp.teal[700]` rather than the decorative `[500]`, because
   * `font.display.action` is not large under WCAG. The bright step stays
   * available for dots, washes, rings and check marks.
   */
  teal: ramp.teal[700],
  tealEdge: ramp.teal[800],
  tealTint: ramp.teal[200],
  tealInk: ramp.teal[800],
  /**
   * The streak. A fill — the flame pill, the hot half of a gradient.
   * `damage` is the readable ink in this hue.
   */
  coral: '#f4a5a8',
  /** The 3px lip under a coral fill, and the ink on a coral wash. */
  coralEdge: '#c96f78',
  coralTint: '#fae6e5',
  /**
   * Something that went wrong, or is about to: an error line, the outline on a
   * destructive control. It named "a battle slipping away" until the Battle was
   * retired on 2026-09-06 (deviation #66) — the value never moved, the sentence
   * describing it did.
   *
   * `coralEdge` remains decorative-only; `damage` is the deeper readable ink.
   */
  damage: '#8b3543',
  /** @deprecated Kept so older call sites still compile. Use `damage`. */
  danger: '#8b3543',
  /**
   * The ink that sits on a **bright fill** — the primary button, the streak
   * pill, a cleared calendar day, the selected segment. Always dark, in both
   * schemes: `colors.text` flips to cream under the dark scheme and a bright
   * apricot takes ink whatever the ground behind it is. Reaching for `text` on
   * a fill is the mistake this token exists to make impossible to write.
   */
  ink: '#382b29',
  /**
   * The ink that sits on a **deep fill** — teal, sage 600, night. Always light,
   * in both schemes, for the same reason `ink` is always dark. Under the light
   * scheme it is `bg`; under the dark one `bg` is near-black and this is not.
   */
  onDeep: '#fbf8f2',
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
    fill: 'rgba(255,255,255,0.96)',
    fillSoft: 'rgba(255,255,255,0.46)',
    edge: 'rgba(255,255,255,0.9)',
  },
  dark: {
    fill: 'rgba(56,43,41,0.78)',
    fillSoft: 'rgba(56,43,41,0.52)',
    edge: 'rgba(250,243,235,0.28)',
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
 * that keeps them off the apricot `colors.accent`. Gold remains its own hue so
 * the two roles cannot collapse into a shade difference.
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
 * The rounded system uses a 28–32pt card radius, a 24pt chip, and 34pt chrome.
 * `borderCurve:
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
 * This replaces containment borders; a white card on cream needs only a quiet
 * lift. RN's `shadowRadius` is
 * roughly half a CSS blur, which is why these numbers look smaller than the
 * design's `0 18px 34px -22px`. `elevation` keeps Android in step; the app is
 * iOS first (§15) but the tokens should not be the reason that stops being true.
 */
export const shadow = {
  sm: {
    shadowColor: ramp.neutral[900],
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: ramp.neutral[900],
    shadowOpacity: 0.07,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  lg: {
    shadowColor: ramp.neutral[900],
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
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

/*
  ───────────────────────────────────────────────────────────────────────────
  Two schemes, one set of roles (2026-09-10, deviation #72).
  ───────────────────────────────────────────────────────────────────────────

  Everything above this line is the **light** palette, and it is still what the
  static exports (`colors`, `ramp`, `glass`, `shadow`, `earnedColor`) mean —
  root Vitest reads them, along with sign-in's intentionally fixed-light
  surface. The onboarding run now reads the runtime theme like the main app.

  A screen that follows the viewer's appearance reads `useTheme()` instead,
  which hands back one of the two `Theme` objects below. **The names and the
  contract are identical in both.** `ramp.<family>[200]` is a quiet wash you
  set text on in either scheme; `[500]` is a fill; `[700]` and `[800]` are
  inks. Under the dark scheme that means the low steps are *dark* tints and
  the high steps are *light* tints — the ink-strength contract inverted about
  the ground rather than the hue scale reversed. A call site that was right
  on cream is right on charcoal without being edited, which is the whole reason
  the ramp is described by strength rather than by brightness.

  Two tokens are the same in both schemes on purpose: `ink` (always dark, for
  bright fills) and `onDeep` (always light, for deep fills). `text` and `bg`
  swap places; those two do not, and that is how a primary button keeps its
  legible label when the page behind it goes dark.

  `contrast.test.ts` holds both palettes to the same claims.
*/

export type Scheme = 'light' | 'dark';

type ColorRoles = { [K in keyof typeof colors]: string };
type RampSteps = { [K in keyof typeof ramp.neutral]: string };
type RampFamilies = { [F in keyof typeof ramp]: RampSteps };
type GlassTones = {
  [T in keyof typeof glass]: { [K in keyof (typeof glass)[T]]: string };
};
type ShadowStep = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
};
type ShadowSteps = { [S in keyof typeof shadow]: ShadowStep };

export interface Theme {
  scheme: Scheme;
  colors: ColorRoles;
  ramp: RampFamilies;
  glass: GlassTones;
  shadow: ShadowSteps;
  earnedColor: string;
}

/**
 * The dark ramps. Same nine steps, same hues in the middle, and the ends
 * inverted about the ground so the strength contract holds.
 */
const darkRamp: RampFamilies = {
  neutral: {
    100: '#282229',
    200: '#342c35',
    300: '#453a45',
    400: '#665967',
    500: '#958796',
    600: '#bfb0bf',
    700: '#d8cbd5',
    800: '#eee2e8',
    900: '#faf3eb',
  },
  accent: {
    100: '#30221f',
    200: '#433026',
    300: '#62432f',
    400: '#f5bd96',
    500: '#f4af82',
    600: '#d48658',
    700: '#efb38e',
    800: '#f6cfb4',
    900: '#ffe6d1',
  },
  sage: {
    100: '#2a222f',
    200: '#403249',
    300: '#584160',
    400: '#c9b2e9',
    500: '#ac8bd3',
    600: '#795398',
    700: '#ceb1e5',
    800: '#e5d0f2',
    900: '#f5e9fc',
  },
  teal: {
    100: '#1d2925',
    200: '#263c35',
    300: '#315044',
    400: '#b2dcca',
    500: '#77bba7',
    600: '#4f907d',
    700: '#9fd7c3',
    800: '#c5eadc',
    900: '#e9f8f2',
  },
  gold: {
    100: '#2b2110',
    200: '#3d2e12',
    300: '#57411a',
    400: '#ffc145',
    500: '#f5a623',
    600: '#cd7f0c',
    700: '#ffd27a',
    800: '#ffe3a8',
    900: '#fff3d6',
  },
  sky: {
    100: '#0f1f3a',
    200: '#122a4a',
    300: '#173a66',
    400: '#5cc6ff',
    500: '#2c9cff',
    600: '#0c7fd6',
    700: '#8fd3ff',
    800: '#bfe6ff',
    900: '#0b1b4d',
  },
};

/**
 * The dark ground is a warm charcoal-plum, so the two schemes read as one
 * brand at two times of day rather than as a warm app and a grey one.
 */
const darkColors: ColorRoles = {
  bg: '#211c23',
  surface: '#302932',
  surfaceLift: '#3a313d',
  sky: darkRamp.sky[200],
  night: darkRamp.sky[900],
  midnight: '#19161c',
  border: '#faf3eb29',
  borderStrong: darkRamp.neutral[400],
  text: '#faf3eb',
  subtle: darkRamp.neutral[700],
  muted: darkRamp.neutral[600],
  accent: darkRamp.accent[500],
  /** Large display type in apricot, on charcoal-plum. */
  accentInk: darkRamp.accent[700],
  /** Body-size apricot ink, on the page and on the dark apricot wash. */
  accentDeep: darkRamp.accent[800],
  accentEdge: darkRamp.accent[600],
  sage: darkRamp.sage[600],
  teal: ramp.teal[700],
  tealEdge: ramp.teal[800],
  tealTint: darkRamp.teal[200],
  tealInk: darkRamp.teal[700],
  coral: colors.coral,
  coralEdge: colors.coralEdge,
  coralTint: '#4a2d33',
  /** The readable coral ink on the dark page. */
  damage: '#f2afb6',
  danger: '#f2afb6',
  ink: colors.ink,
  onDeep: colors.onDeep,
};

export const light: Theme = {
  scheme: 'light',
  colors,
  ramp,
  glass,
  shadow,
  earnedColor,
};

export const dark: Theme = {
  scheme: 'dark',
  colors: darkColors,
  ramp: darkRamp,
  /**
   * Glass over a dark page is a *dark* translucent fill: a white one over
   * charcoal reads as a grey box, which is the failure `Glass`'s own comment
   * warns about. The `dark` tone — chrome over the flight — is unchanged,
   * because the flight is drawn on `night` in both schemes.
   */
  glass: {
    light: {
      fill: 'rgba(58,49,61,0.96)',
      fillSoft: 'rgba(58,49,61,0.86)',
      edge: 'rgba(250,243,235,0.16)',
    },
    dark: glass.dark,
  },
  /** Dark surfaces keep the same restrained depth with a black shadow. */
  shadow: {
    sm: { ...shadow.sm, shadowColor: '#000000' },
    md: { ...shadow.md, shadowColor: '#000000' },
    lg: { ...shadow.lg, shadowColor: '#000000' },
  },
  earnedColor: darkRamp.gold[400],
};

export const themes: Record<Scheme, Theme> = { light, dark };

/** Scenery tokens share the app's schemes and stay out of screen files. */
type SceneStop = { color: string; at: number };
export const dioramaSky: Record<Scheme, { sky: SceneStop[]; crest: SceneStop[]; fade: SceneStop[] }> = {
  light: {
    sky: [
      { color: themes.light.ramp.sky[200], at: 0 },
      { color: themes.light.ramp.sage[100], at: 0.7 },
      { color: themes.light.colors.bg, at: 1 },
    ],
    crest: [
      { color: themes.light.ramp.gold[300], at: 0 },
      { color: themes.light.ramp.accent[300], at: 0.5 },
      { color: themes.light.colors.bg, at: 1 },
    ],
    fade: [
      { color: '#fbf8f200', at: 0 },
      { color: '#fbf8f259', at: 0.55 },
      { color: themes.light.colors.bg, at: 1 },
    ],
  },
  dark: {
    sky: [
      { color: themes.dark.ramp.sky[200], at: 0 },
      { color: themes.dark.ramp.sage[100], at: 0.7 },
      { color: themes.dark.colors.bg, at: 1 },
    ],
    crest: [
      { color: themes.dark.ramp.gold[300], at: 0 },
      { color: themes.dark.ramp.accent[300], at: 0.5 },
      { color: themes.dark.colors.bg, at: 1 },
    ],
    fade: [
      { color: '#211c2300', at: 0 },
      { color: '#211c2359', at: 0.55 },
      { color: themes.dark.colors.bg, at: 1 },
    ],
  },
};

export const flightSky: Record<Scheme, SceneStop[]> = {
  light: [
    { color: themes.light.ramp.sky[200], at: 0 },
    { color: themes.light.ramp.sage[100], at: 0.7 },
    { color: themes.light.colors.bg, at: 1 },
  ],
  dark: [
    { color: themes.dark.ramp.sky[900], at: 0 },
    { color: themes.dark.ramp.sky[200], at: 0.7 },
    { color: themes.dark.colors.bg, at: 1 },
  ],
};

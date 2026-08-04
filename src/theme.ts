/**
 * Design tokens. The palette is the one the wiring-proof screen established —
 * near-black surfaces with a single violet accent, matching §6's dark-fantasy
 * hunter aesthetic.
 */

import type { TextStyle } from 'react-native';

/** Raised surface, for a panel sitting on a panel without a border. */
export const colors = {
  bg: '#08080C',
  surface: '#12121A',
  surfaceLift: '#191922',
  // An 8-digit hex is a real colour to RN — #222230 at 25% alpha. Kept as the
  // hairline, with an opaque partner so borders and focus rings stop competing.
  border: '#22223040',
  borderStrong: '#2E2E3E',
  text: '#F5F5FF',
  subtle: '#9A9AB0',
  muted: '#6E6E85',
  accent: '#8B7CFF',
  danger: '#FF6B6B',
} as const;

/**
 * Tier colours (§6). A token rather than a per-component constant because two
 * screens speak this vocabulary — your own stat bars and your squadmates' tier
 * pills — and a Gold that is not the same Gold in both places reads as a bug.
 */
export const tierColors = {
  gold: '#E3B341',
  silver: '#C7CBD6',
  bronze: '#B87333',
  none: colors.border,
} as const;

export function tierColor(tier: string | undefined): string {
  return tierColors[(tier ?? 'none') as keyof typeof tierColors] ?? tierColors.none;
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
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/**
 * Two type roles with a hard boundary (see the redesign spec).
 *
 * `display` is Chakra Petch and is for numerals, levels and tier names only —
 * every screen's focal point in Kairo is a number, and this is what stops them
 * reading like system-font bold. `body` is SF Pro and owns all prose.
 *
 * Everything numeric is tabular: boards refetch on realtime broadcasts, and
 * proportional digits make a live number visibly jitter.
 */
const DISPLAY = 'ChakraPetch-Bold';
const DISPLAY_MEDIUM = 'ChakraPetch-SemiBold';
// Typed, not `as const`: `as const` would make this a readonly tuple, which is
// not assignable to TextStyle['fontVariant'].
const NUM: Pick<TextStyle, 'fontVariant'> = { fontVariant: ['tabular-nums'] };

export const font = {
  display: {
    hero: { fontFamily: DISPLAY, fontSize: 64, letterSpacing: -1, ...NUM },
    major: { fontFamily: DISPLAY, fontSize: 34, letterSpacing: -0.5, ...NUM },
    minor: { fontFamily: DISPLAY, fontSize: 20, ...NUM },
    label: { fontFamily: DISPLAY_MEDIUM, fontSize: 12, letterSpacing: 1.5 },
  },
  body: {
    title: { fontSize: 22, fontWeight: '700' },
    body: { fontSize: 15, fontWeight: '400' },
    label: { fontSize: 12, fontWeight: '600', letterSpacing: 1.5 },
    button: { fontSize: 16, fontWeight: '700' },
  },
} as const;

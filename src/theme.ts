/**
 * Design tokens. The palette is the one the wiring-proof screen established —
 * near-black surfaces with a single violet accent, matching §6's dark-fantasy
 * hunter aesthetic.
 */

export const colors = {
  bg: '#08080C',
  surface: '#12121A',
  border: '#22223040',
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

export const font = {
  brand: { fontSize: 34, fontWeight: '800', letterSpacing: 6 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 1.5 },
} as const;

import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { font, radius, space, type Theme } from '../theme.ts';
import { Meter } from './Meter.tsx';
import { Text } from './Text.tsx';
import { useStyles } from './use-theme.ts';

/**
 * One reading, as a card: an eyebrow, a figure, a caption, and optionally a
 * meter under it. The dashboard's unit (deviation #72).
 *
 * **One accessibility element**, with both halves of the grouping fix: the
 * tile carries `accessible` + a composed label and every child is hidden. A
 * dashboard of six tiles read as twenty-four stops otherwise, which is the
 * 2026-08-14 leaderboard failure in a grid.
 *
 * Two sizes and no more. `hero` is the day's one big figure; `half` sits two
 * across. A third size is how a grid stops reading as a grid.
 *
 * The figure takes `fixed` scale — it is display type in a box whose width
 * the grid decides — and the caption takes `chrome`, so at large Dynamic Type
 * the words grow and the number holds, which is the arrangement every other
 * numeral in the app already takes.
 */
export function Tile({
  eyebrow,
  figure,
  unit,
  caption,
  meter,
  size = 'half',
  accessibilityLabel,
  glyph,
  style,
}: {
  eyebrow: string;
  /** Already formatted — "3,086", "5h 22m", "—". */
  figure: string;
  /** Sits after the figure at caption size. */
  unit?: string;
  caption?: string | null;
  /** 0–1 and the fill colour. Omit for a reading with no target. */
  meter?: { fraction: number; color: string } | null;
  size?: 'hero' | 'half';
  accessibilityLabel: string;
  /** Drawn beside the eyebrow. Decorative; the eyebrow names it. */
  glyph?: ReactNode;
  style?: ViewStyle;
}) {
  const styles = useStyles(makeStyles);
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.tile, size === 'hero' ? styles.hero : styles.half, style]}
    >
      <View {...hidden} style={styles.head}>
        {glyph}
        <Text scale="chrome" numberOfLines={1} style={styles.eyebrow}>
          {eyebrow}
        </Text>
      </View>

      <View {...hidden} style={styles.figureRow}>
        <Text
          scale="fixed"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[styles.figure, size === 'hero' ? styles.figureHero : styles.figureHalf]}
        >
          {figure}
        </Text>
        {unit ? (
          <Text scale="chrome" style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>

      {caption ? (
        <Text {...hidden} scale="chrome" style={styles.caption}>
          {caption}
        </Text>
      ) : null}

      {meter ? (
        <View {...hidden} style={styles.meter}>
          <Meter fraction={meter.fraction} color={meter.color} height={6} />
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = ({ colors, shadow }: Theme) =>
  StyleSheet.create({
    tile: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      padding: space.md,
      ...shadow.sm,
    },
    hero: { paddingVertical: space.md + space.xs },
    // `flex: 1` inside a row, `minWidth: 0` so a long figure shrinks rather
    // than pushing its neighbour off the screen.
    half: { flex: 1, minWidth: 0 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    eyebrow: {
      ...font.body.label,
      color: colors.muted,
      textTransform: 'uppercase',
      flexShrink: 1,
    },
    figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: space.sm },
    figure: { fontFamily: font.display.major.fontFamily, color: colors.text, flexShrink: 1 },
    figureHero: { fontSize: 44, letterSpacing: -1, lineHeight: 50 },
    figureHalf: { fontSize: 26, letterSpacing: -0.4, lineHeight: 32 },
    unit: { ...font.body.strong, color: colors.muted },
    caption: { ...font.body.strong, color: colors.subtle, marginTop: 4 },
    meter: { marginTop: space.sm + 2 },
  });

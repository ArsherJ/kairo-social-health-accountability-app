import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { radius, space, type Theme } from '../theme.ts';
import { useStyles } from './use-theme.ts';

/**
 * The only card in the app.
 *
 * A card is separated from the ground by **shadow**, never by a border — a
 * `borderColor` on a card means *selected* (your own row), never *contained*.
 * Under the dark scheme the shadow is black and the surface is one step
 * lighter than the page, which is all the edge a card needs there.
 *
 * Deviation #72 brought the radius in from 30 to `radius.lg` (24) and the
 * padding down a step: the quieter system still reads as Playful through the
 * type and the fills, and the extra corner was the thing that made every card
 * look like a sticker.
 *
 * - `plain` — the default. Surface plus a soft shadow: it sits on the page.
 * - `lift` — leaves the page, for a card that has to out-rank its neighbours.
 *   For chrome floating over *content*, use `Glass` instead.
 * - `earned` — the sage wash under a gold top edge. A banked Streak Shield and
 *   the squad leader's row, nothing else.
 * - `sky` — the field the character occupies. **Not a card**: no shadow.
 * - `tint` — the orange wash that means *this one is you*.
 */
export function Panel({
  variant = 'plain',
  style,
  children,
}: {
  variant?: 'plain' | 'lift' | 'earned' | 'sky' | 'tint';
  style?: ViewStyle;
  children: ReactNode;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.base, styles[variant], style]}>
      {variant === 'earned' && <View style={styles.edge} />}
      {children}
    </View>
  );
}

const makeStyles = ({ colors, ramp, shadow, earnedColor }: Theme) =>
  StyleSheet.create({
    base: {
      marginTop: space.md,
      padding: space.md + space.xs,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      overflow: 'hidden',
    },
    plain: { backgroundColor: colors.surface, ...shadow.md },
    // `overflow: 'hidden'` on `base` clips a shadow on Android, where elevation
    // is drawn by the platform rather than composited outside the bounds. iOS
    // ships first (§15) and renders this correctly.
    lift: { backgroundColor: colors.surfaceLift, ...shadow.lg },
    earned: { backgroundColor: ramp.sage[200], ...shadow.md },
    /** No shadow, deliberately. A place does not float. */
    sky: { backgroundColor: colors.sky },
    tint: { backgroundColor: ramp.accent[200] },
    edge: {
      position: 'absolute',
      top: 0,
      left: space.lg,
      right: space.lg,
      height: 3,
      borderBottomLeftRadius: radius.pill,
      borderBottomRightRadius: radius.pill,
      borderCurve: 'continuous',
      backgroundColor: earnedColor,
    },
  });

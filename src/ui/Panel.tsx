import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, ramp, radius, shadow, space, tierColors } from '../theme.ts';

/**
 * The only card in the app.
 *
 * On the warm system a card is a *tint*, not an outline — the old 1px border
 * was doing the work that `colors.surface` on `colors.bg` now does by itself,
 * and keeping both would draw a box around every block on the screen.
 *
 * - `plain` — the default. Surface tint, no elevation: it is part of the page.
 * - `lift` — leaves the page. Lighter than the ground plus a real shadow, for
 *   anything floating over the diorama or over other content.
 * - `earned` — sage, with a terracotta top edge. The glow rule's one
 *   expression on a card, and it belongs to a banked Streak Shield and the
 *   squad leader's row, nothing else.
 */
export function Panel({
  variant = 'plain',
  style,
  children,
}: {
  variant?: 'plain' | 'lift' | 'earned';
  style?: ViewStyle;
  children: ReactNode;
}) {
  return (
    <View style={[styles.base, styles[variant], style]}>
      {variant === 'earned' && <View style={styles.edge} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    marginTop: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  plain: { backgroundColor: colors.surface },
  // `overflow: 'hidden'` on `base` clips a shadow on Android, where elevation
  // is drawn by the platform rather than composited outside the bounds. iOS
  // ships first (§15) and renders this correctly; if Android matters later,
  // this variant needs a wrapper view to carry the shadow.
  lift: { backgroundColor: colors.surfaceLift, ...shadow.md },
  earned: { backgroundColor: ramp.sage[200] },
  edge: {
    position: 'absolute',
    top: 0,
    left: space.lg,
    right: space.lg,
    height: 3,
    borderBottomLeftRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
    // The app has three colour families with one job each: terracotta means
    // "you", the tier ladder means "earned", burnt means sabotage. This edge
    // marks the squad leader's row and a banked Streak Shield — both
    // "earned", neither "you" — so it belongs to `tierColors`, and Gold
    // specifically since that is the top tier this app has.
    backgroundColor: tierColors.gold,
  },
});

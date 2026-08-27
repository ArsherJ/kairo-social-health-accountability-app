import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, earnedColor, ramp, radius, shadow, space } from '../theme.ts';

/**
 * The only card in the app.
 *
 * On Sunlit a card is separated from the ground by **shadow**, not by tint:
 * `colors.surface` and `colors.bg` differ by a hair on purpose. That is a
 * change from the warm system that preceded it, where the tint did the work —
 * so `plain` carries an elevation now, and anything reaching for a darker
 * surface to make a card legible is working against the system twice over.
 *
 * - `plain` — the default. Card tint plus a small shadow: it sits on the page.
 * - `lift` — leaves the page. White plus a real shadow, for chrome floating
 *   over content.
 * - `earned` — sage, with an amber top edge. The glow rule's one expression on
 *   a card, and it belongs to a banked Streak Shield and the squad leader's
 *   row, nothing else.
 * - `sky` — the warm field the character occupies. **Not a card**: no shadow,
 *   because it is a place rather than an object, and nothing that is not the
 *   character's own sky may use it.
 * - `tint` — the amber wash that means *this one is you*. The self row on a
 *   board, and the name block on the onboarding meet screen.
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
  plain: { backgroundColor: colors.surface, ...shadow.sm },
  // `overflow: 'hidden'` on `base` clips a shadow on Android, where elevation
  // is drawn by the platform rather than composited outside the bounds. iOS
  // ships first (§15) and renders this correctly; if Android matters later,
  // these variants need a wrapper view to carry the shadow.
  lift: { backgroundColor: colors.surfaceLift, ...shadow.md },
  earned: { backgroundColor: ramp.sage[200] },
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
    // The app has four colour families with one job each: amber means "you",
    // `earnedColor` means "earned", teal means rest, coral means falling
    // behind. This edge marks the squad leader's row and a banked Streak
    // Shield — both "earned", neither "you".
    backgroundColor: earnedColor,
  },
});

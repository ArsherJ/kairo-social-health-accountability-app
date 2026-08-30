import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, earnedColor, ramp, radius, shadow, space } from '../theme.ts';

/**
 * The only card in the app.
 *
 * A card is separated from the ground by **shadow**, never by a border — that
 * has held since Sunlit and Playful leans on it harder, because a Playful card
 * is plain white on cream and has no other edge at all. A `borderColor` on a
 * card therefore means *selected* (the picked quest tier, your own row), never
 * *contained*; reaching for one to make a card legible is working against the
 * system twice over.
 *
 * What Playful changed is the geometry, not the rule: `radius.xl` is 30 now and
 * every variant is `borderCurve: 'continuous'`, because at this radius a
 * circular corner is visibly not the shape the design draws.
 *
 * - `plain` — the default. White plus a soft shadow: it sits on the page.
 * - `lift` — leaves the page. The same white under a real shadow, for a card
 *   that has to out-rank the cards around it. For chrome floating over
 *   *content*, use `Glass` instead — that is a different job.
 * - `earned` — the violet wash under a gold top edge. Playful is the first
 *   palette where "earned" and "you" are different hues rather than two steps
 *   of one, so this finally reads as its own thing: a banked Streak Shield and
 *   the squad leader's row, nothing else.
 * - `sky` — the field the character occupies. **Not a card**: no shadow,
 *   because it is a place rather than an object, and nothing that is not the
 *   character's own sky may use it.
 * - `tint` — the orange wash that means *this one is you*. The self row on a
 *   board, and the name block on the onboarding name screen.
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
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  plain: { backgroundColor: colors.surface, ...shadow.md },
  // `overflow: 'hidden'` on `base` clips a shadow on Android, where elevation
  // is drawn by the platform rather than composited outside the bounds. iOS
  // ships first (§15) and renders this correctly; if Android matters later,
  // these variants need a wrapper view to carry the shadow.
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
    // The app has four colour families with one job each: amber means "you",
    // `earnedColor` means "earned", teal means rest, coral means falling
    // behind. This edge marks the squad leader's row and a banked Streak
    // Shield — both "earned", neither "you".
    backgroundColor: earnedColor,
  },
});

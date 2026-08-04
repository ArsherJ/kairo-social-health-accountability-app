import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, space, tierColors } from '../theme.ts';

/**
 * The only card in the app.
 *
 * `earned` is the glow rule's one expression on a card — a lit top edge — and
 * belongs to a banked Streak Shield and the squad leader's row, nothing else.
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
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  plain: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lift: { backgroundColor: colors.surfaceLift },
  earned: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  edge: {
    position: 'absolute',
    top: 0,
    left: space.lg,
    right: space.lg,
    height: 2,
    // The app has three colour families with one job each: violet
    // `colors.accent` means "you", `tierColors` means "earned", red means
    // sabotage. This edge marks the squad leader's row and a banked Streak
    // Shield — both "earned", neither "you" — so it belongs to `tierColors`,
    // and Gold specifically since that is the top tier this app has.
    backgroundColor: tierColors.gold,
    shadowColor: tierColors.gold,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});

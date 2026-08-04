import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../theme.ts';

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
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});

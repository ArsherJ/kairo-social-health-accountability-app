import { StyleSheet, View } from 'react-native';
import { ratingForStatPoints, type CoreStat } from '@kairo/core';
import { font, radius, type Theme } from '../theme.ts';
import { StatIcon } from './StatIcon.tsx';
import { Text } from './Text.tsx';
import { useStyles, useTheme } from './use-theme.ts';

/**
 * One stat as a coin, for the mastery rail on You.
 *
 * The coin carries an ability rating: one number, on the same curve and the
 * same floor as Level. A rating never falls, which is why nothing here has an
 * "unearned" state — every stat is at least 1 from the first frame. The three
 * letters became a glyph on 2026-08-11; the expanded bar one tap below still
 * carries icon **and** name **and** "Steps and distance", which is where the
 * vocabulary is taught.
 */
export function StatCoin({
  stat,
  points,
}: {
  stat: CoreStat;
  /** Lifetime points in this stat. Undefined until the profile loads. */
  points: number | undefined;
}) {
  const styles = useStyles(makeStyles);
  const { colors, ramp } = useTheme();
  const rating = ratingForStatPoints(points ?? 0);
  const untrained = (points ?? 0) <= 0;

  return (
    <View
      // No accessible name of its own: `StatRail` is a single Pressable whose
      // label already speaks every rating.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.coin, untrained && styles.idle]}
    >
      <StatIcon stat={stat} size={18} color={untrained ? colors.muted : ramp.accent[800]} />
      {/* `fixed`: 56pt circle with a glyph above the number. */}
      <Text scale="fixed" style={[styles.rating, untrained && styles.ratingIdle]}>
        {rating}
      </Text>
    </View>
  );
}

const makeStyles = ({ colors, ramp, shadow }: Theme) =>
  StyleSheet.create({
    coin: {
      width: 56,
      height: 56,
      borderRadius: radius.pill,
      borderWidth: 3,
      borderColor: ramp.accent[400],
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      ...shadow.sm,
    },
    // An untrained coin recedes rather than disappearing.
    idle: { borderColor: ramp.neutral[300] },
    rating: { ...font.display.small, fontSize: 17, lineHeight: 20, color: colors.text },
    ratingIdle: { color: colors.muted },
  });

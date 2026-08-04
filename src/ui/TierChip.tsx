import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space, tierColor } from '../theme.ts';
import { Meter } from './Meter.tsx';
import { Numeral } from './Numeral.tsx';

/**
 * One of the four stats, sized for a row of four.
 *
 * Only Gold glows. Bronze and Silver are real achievements but they are not
 * the ceiling, and a glow on all three would make the device meaningless.
 */
export function TierChip({
  stat,
  tier,
  points,
  fraction,
}: {
  stat: string;
  tier: string | undefined;
  points: number;
  fraction: number;
}) {
  const color = tierColor(tier);
  const gold = tier === 'gold';

  return (
    <View style={[styles.chip, gold && { ...styles.glow, shadowColor: color }]}>
      <Text style={styles.stat}>{stat}</Text>
      <Numeral value={points} size="minor" color={colors.subtle} />
      <Meter fraction={fraction} color={color} height={4} />
      <Text style={[styles.tier, { color }]}>{(tier ?? 'none').toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    minWidth: 0,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.xs,
  },
  glow: { shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  stat: { ...font.display.minor, color: colors.text },
  tier: { ...font.body.label, fontSize: 10 },
});

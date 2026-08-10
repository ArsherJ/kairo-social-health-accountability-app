import { Pressable, StyleSheet, View } from 'react-native';
import { CORE_STATS, type CoreStat } from '@kairo/core';
import { space } from '@/theme.ts';
import { StatCoin } from '@/ui/index.ts';

/**
 * The four stats as a rail of coins down the edge of the diorama.
 *
 * It replaced a row of four chips under the figure. The row had to compress
 * four numbers, four meters and four tier names into a phone's width, which
 * made every one of them small; the rail only ever has to say *which stat* and
 * *how far along*, and hands the numbers to the detail below. That is also why
 * this is one control rather than four — the coins are a summary you tap to
 * open, not four separate buttons.
 */
export function StatRail({
  ratings,
  expanded,
  onToggle,
}: {
  /** Lifetime per-stat points from `profiles`. Undefined until it loads. */
  ratings: Partial<Record<CoreStat, number>> | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={expanded ? 'Hide per-stat detail' : 'Show per-stat detail'}
      onPress={onToggle}
      style={styles.rail}
    >
      {CORE_STATS.map((stat) => (
        <View key={stat} style={styles.slot}>
          <StatCoin stat={stat} points={ratings?.[stat]} />
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: { gap: space.sm },
  // The coins are 54pt, comfortably over the 44pt target, and the rail as a
  // whole is one control — so the tappable area is the four of them together.
  slot: {},
});

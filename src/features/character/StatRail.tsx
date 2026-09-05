import { Pressable, StyleSheet, View } from 'react-native';
import { CORE_STATS, ratingForStatPoints, type CoreStat } from '@kairo/core';
import { space } from '@/theme.ts';
import { StatCoin, STAT_NAMES } from '@/ui/index.ts';

/**
 * The core stats as a rail of coins.
 *
 * It replaced a row of chips under the figure. The row had to compress a
 * number, a meter and a tier name per stat into a phone's width, which made
 * every one of them small; the rail only ever has to say *which stat* and
 * *how far along*, and hands the numbers to the detail below. That is also why
 * this is one control rather than several — the coins are a summary you tap to
 * open, not separate buttons.
 *
 * It renders `CORE_STATS`, so it went from four coins to three with deviation
 * #41 and needed no edit — including its composed label, which shrank with it.
 *
 * **It lays out across, and the direction has to be declared.** This was built
 * as a column down the edge of the character screen's diorama, where the
 * default `flexDirection: 'column'` was the layout and so was never written
 * down. That screen dissolved on 2026-08-27 and the rail was re-mounted into
 * the You tab's flowing page, where the same default stacked three 54pt coins
 * vertically down the left margin — three quarters of a screen of whitespace,
 * and nothing in the file said the arrangement was ever meant to be anything
 * else. `flexWrap` for the 2026-08-17 reason: a row that cannot fit its content
 * at large Dynamic Type clips rather than wraps, and clipping is what hides.
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
  // The rail is one Pressable, so its own label is all VoiceOver announces —
  // whatever the coins draw inside it. That was a gap while the coins showed
  // "AGI 12" (the ratings were simply never read out); with the letters now
  // replaced by a glyph there is no text left to fall back to at all, so the
  // ratings have to be spoken here or nowhere.
  const spoken = CORE_STATS.map(
    (stat) => `${STAT_NAMES[stat]} ${ratingForStatPoints(ratings?.[stat] ?? 0)}`,
  ).join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={
        `${spoken}. ${expanded ? 'Hide per-stat detail' : 'Show per-stat detail'}`
      }
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
  rail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
  },
  // The coins are 54pt, comfortably over the 44pt target, and the rail as a
  // whole is one control — so the tappable area is all of them together.
  slot: {},
});

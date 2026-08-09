import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, shadow, tierColor, tierInk } from '../theme.ts';

/**
 * One stat as a coin, for the diorama's floating rail.
 *
 * The rail sits over the sky rather than on the cream, so the coin carries a
 * translucent ground of its own — the sage reads through it just enough to
 * keep the HUD feeling laid over a world rather than pasted on top of one.
 *
 * The tier is the ring, not the fill. A filled coin at four different
 * strengths turns the rail into a colour chart and buries the one thing worth
 * reading at a glance, which is how far along each stat is.
 */
export function TierCoin({
  stat,
  tier,
}: {
  stat: string;
  /** Bronze/silver/gold from `daily_scores.tiers`. Undefined before any sync. */
  tier: string | undefined;
}) {
  const earned = tier !== undefined && tier !== 'none';

  return (
    <View
      style={[
        styles.coin,
        { borderColor: tierColor(tier) },
        // An unearned coin recedes rather than disappearing: the stat still
        // has to be findable on the rail before it has a tier.
        !earned && styles.idle,
      ]}
    >
      <Text style={[styles.stat, { color: earned ? tierInk(tier) : colors.muted }]}>{stat}</Text>
      <Text style={[styles.tier, { color: tierInk(tier) }]}>
        {earned ? tier!.toUpperCase() : '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  coin: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    // The cream, held back off full opacity so the sky tints it.
    backgroundColor: '#f9f4edeb',
    ...shadow.md,
  },
  idle: { backgroundColor: '#f9f4ed9e' },
  stat: { ...font.display.label, lineHeight: 14 },
  tier: { ...font.body.label, fontSize: 9, letterSpacing: 0.6, marginTop: 2 },
});

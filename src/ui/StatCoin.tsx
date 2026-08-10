import { StyleSheet, Text, View } from 'react-native';
import { ratingForStatPoints } from '@kairo/core';
import { colors, font, radius, ramp, shadow } from '../theme.ts';

/**
 * One stat as a coin, for the diorama's floating rail.
 *
 * The rail sits over the sky rather than on the cream, so the coin carries a
 * translucent ground of its own — the sage reads through it just enough to
 * keep the HUD feeling laid over a world rather than pasted on top of one.
 *
 * **This used to be `TierCoin`, showing GOLD / SILVER / BRONZE.** Those still
 * score every day underneath — the change is what the coin *says*. A medal
 * describes today; the rail is a character sheet, and the question it answers
 * is "how strong am I", which is cumulative. So the coin carries an ability
 * rating: one number, on the same curve and the same floor as Level, so the two
 * read as one system rather than as a score and a rank badge side by side.
 *
 * A rating never falls, which is why nothing here has an "unearned" state any
 * more: every stat is at least 1 from the first frame, and the coin is legible
 * before the first sync instead of showing a dash.
 */
export function StatCoin({
  stat,
  points,
}: {
  stat: string;
  /** Lifetime points in this stat. Undefined until the profile loads. */
  points: number | undefined;
}) {
  // Undefined is "not loaded", which the curve's own floor already answers
  // correctly — a brand-new character and an unloaded one both read 1, and one
  // of them is about to become right.
  const rating = ratingForStatPoints(points ?? 0);
  const untrained = (points ?? 0) <= 0;

  return (
    <View style={[styles.coin, untrained && styles.idle]}>
      <Text style={[styles.stat, untrained && styles.statIdle]}>{stat}</Text>
      <Text style={[styles.rating, untrained && styles.ratingIdle]}>{rating}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  coin: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    // The ring used to carry the tier colour. With no tier to carry it is one
    // weight in one hue — the rail's job is to say *which stat* and *how far
    // along*, and four colours competing was always the thing that buried it.
    borderWidth: 3,
    borderColor: ramp.accent[400],
    alignItems: 'center',
    justifyContent: 'center',
    // The cream, held back off full opacity so the sky tints it.
    backgroundColor: '#f9f4edeb',
    ...shadow.md,
  },
  // An untrained coin recedes rather than disappearing: the stat still has to
  // be findable on the rail before anything has been earned in it.
  idle: { backgroundColor: '#f9f4ed9e', borderColor: ramp.neutral[300] },
  stat: { ...font.display.label, lineHeight: 14, color: ramp.accent[800] },
  statIdle: { color: colors.muted },
  rating: { ...font.display.small, fontSize: 17, lineHeight: 20, color: colors.text },
  ratingIdle: { color: colors.muted },
});

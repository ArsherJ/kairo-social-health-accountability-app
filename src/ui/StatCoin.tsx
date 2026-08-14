import { StyleSheet, View } from 'react-native';
import { ratingForStatPoints, type CoreStat } from '@kairo/core';
import { colors, font, radius, ramp, shadow } from '../theme.ts';
import { StatIcon, STAT_NAMES } from './StatIcon.tsx';
import { Text } from './Text.tsx';

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
 *
 * **The three letters became a glyph on 2026-08-11.** 54pt is not enough room
 * to set an abbreviation and a number and have either be the thing you see —
 * the coin's whole job is *which stat* and *how far along*, and `AGI` only
 * answers the first one for someone who already knows the vocabulary. What
 * teaches the vocabulary is the expanded bar one tap below, which still carries
 * icon **and** `AGI` **and** "Steps and distance"; the rail is the summary you
 * read once you have learned it.
 */
export function StatCoin({
  stat,
  points,
}: {
  stat: CoreStat;
  /** Lifetime points in this stat. Undefined until the profile loads. */
  points: number | undefined;
}) {
  // Undefined is "not loaded", which the curve's own floor already answers
  // correctly — a brand-new character and an unloaded one both read 1, and one
  // of them is about to become right.
  const rating = ratingForStatPoints(points ?? 0);
  const untrained = (points ?? 0) <= 0;

  return (
    <View
      // One element, not two. Read separately a coin announces "7" with no way
      // to know which stat, because `StatIcon` is deliberately hidden and the
      // rating is the only text — the whole point of the glyph-over-letters
      // change on 2026-08-11 is that there is no abbreviation left to read.
      // STAT_NAMES exists for exactly this and was never wired up here.
      accessible
      accessibilityLabel={
        untrained
          ? `${STAT_NAMES[stat]}, untrained`
          : `${STAT_NAMES[stat]}, ability ${rating}`
      }
      style={[styles.coin, untrained && styles.idle]}
    >
      {/* 18pt, not 20: the inner box is 48pt after the 3pt border, and the
          rating below it is 20pt of line. 18 leaves the glyph and the number
          breathing room inside the ring instead of pressing on it. */}
      <StatIcon
        stat={stat}
        size={18}
        color={untrained ? colors.muted : ramp.accent[800]}
      />
      {/* `fixed`: 54pt circle with a 3pt border and a glyph above the number.
          There is no room to grow, and the label above is what carries the
          value at any text size. */}
      <Text scale="fixed" style={[styles.rating, untrained && styles.ratingIdle]}>
        {rating}
      </Text>
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
  rating: { ...font.display.small, fontSize: 17, lineHeight: 20, color: colors.text },
  ratingIdle: { color: colors.muted },
});

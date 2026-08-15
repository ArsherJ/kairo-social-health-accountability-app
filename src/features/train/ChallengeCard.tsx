import { StyleSheet, View } from 'react-native';
import type { Challenge } from '@kairo/core';
import { colors, earnedColor, font, radius, ramp, space } from '@/theme.ts';
import { Label, Text } from '@/ui/index.ts';
import { AREA_NAMES, challengeHeadline, challengeHint, challengeLabel } from './challenge-copy.ts';

/**
 * One area's live challenge.
 *
 * The target is the display figure, because the target *is* the product here —
 * a pace or a calorie count the user can go outside and produce. Nothing on
 * this card is a score.
 *
 * Cleared switches the eyebrow and the rule to `earnedColor`, the system's
 * existing "earned" ink (a banked Streak Shield, the All-Rounder ring). Not
 * sage, which means lane and squad warmth, and not a green check, which would
 * be the first tick-mark in an app that has so far said "done" with ink weight.
 *
 * There is deliberately **no progress bar**. A challenge is cleared by a single
 * session that either met the bar or did not; a bar filling toward it would
 * imply partial credit that the mechanic does not give.
 */
export function ChallengeCard({
  challenge,
  cleared,
}: {
  challenge: Challenge;
  cleared: boolean;
}) {
  return (
    // One element, one meaning — not six stops. Every child is hidden
    // explicitly as well as the parent being marked accessible; neither half is
    // redundant, and removing one is how the leaderboard-row failure returns.
    <View
      style={styles.card}
      accessible
      accessibilityLabel={challengeLabel(challenge, cleared)}
    >
      <View
        style={styles.head}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Label>{AREA_NAMES[challenge.area].toUpperCase()}</Label>
        {cleared && <Text style={styles.cleared}>CLEARED TODAY</Text>}
      </View>

      {/* `fixed`: this line sits inside a card with a drawn rule under it, and
          a `prose` display line at the largest Dynamic Type sizes would push
          the rule past the card's own padding. */}
      <Text
        scale="fixed"
        style={[styles.headline, cleared && styles.headlineCleared]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {challengeHeadline(challenge)}
      </Text>

      <View
        style={[styles.rule, cleared && styles.ruleCleared]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />

      <Text
        style={styles.hint}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {challengeHint(challenge)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  cleared: { ...font.body.label, textTransform: 'uppercase', color: earnedColor },
  headline: {
    ...font.display.minor,
    color: colors.text,
    marginTop: space.xs,
  },
  headlineCleared: { color: earnedColor },
  // The one drawn line on the card, and it carries the state: the target is a
  // bar to get under or over, so a rule beneath it reads as that bar.
  rule: {
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: ramp.neutral[400],
    marginTop: space.sm,
  },
  ruleCleared: { backgroundColor: earnedColor },
  hint: {
    ...font.body.body,
    fontSize: 13,
    color: ramp.neutral[600],
    marginTop: space.sm,
    lineHeight: 18,
  },
});

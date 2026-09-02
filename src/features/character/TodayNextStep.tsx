import { forwardRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';

/**
 * The one visible prompt, and the door to everything else.
 *
 * Two ordered accessibility stops and no more: the sentence (which is the
 * reaction's, the ceiling line's or the next step's, decided by the caller),
 * then the trigger. Everything the day actually contains lives behind that
 * trigger in `TodayDetailsSheet`.
 */
export const TodayNextStep = forwardRef<View, {
  sentence: string;
  onDetails: () => void;
  /**
   * False until confirmed or cached totals exist. The trigger is **hidden**
   * rather than disabled: a dead control with nothing explaining it is the same
   * false accusation `QUIET_GRACE_MS` exists to prevent, and a control that is
   * not there yet reads as "not yet". Everything above it already renders from
   * cached or neutral state, so nothing is left behind.
   */
  showDetails: boolean;
}>(function TodayNextStep({ sentence, onDetails, showDetails }, ref) {
  return (
    <View style={styles.nextStep}>
      <Text accessibilityRole="summary" style={styles.sentence}>{sentence}</Text>
      {showDetails && (
        <Pressable
          ref={ref}
          accessibilityRole="button"
          accessibilityLabel="See today's details"
          hitSlop={space.sm}
          onPress={onDetails}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Text style={styles.detailsLink}>See today&apos;s details</Text>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  nextStep: { gap: space.md, paddingTop: space.lg },
  /**
   * The one sentence. Larger than the old hero aside, because it is now the
   * only prose on the screen rather than one line of four — but still below the
   * step numeral in the scene, which stays the largest figure on Today.
   */
  sentence: {
    ...font.body.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  },
  /**
   * Terracotta, which is what the system already means by "the thing to press".
   * A link rather than a `Button`: details are genuinely optional, and a filled
   * CTA under a calm sentence would make looking at your numbers the point of
   * the screen.
   */
  detailsLink: { ...font.body.strong, color: colors.accentDeep },
});

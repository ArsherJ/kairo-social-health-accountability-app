import { forwardRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useStyles } from '@/ui/index.ts';
import { font, space, type Theme } from '@/theme.ts';

/**
 * The one sentence the bird says, and the door to the rest of the day.
 *
 * Two ordered accessibility stops and no more: the sentence (the reaction's,
 * the ceiling line's or the next step's, decided by the caller), then the
 * trigger. The complete raw-unit day lives behind that trigger in
 * `TodayDetailsSheet`.
 */
export const TodayNextStep = forwardRef<View, {
  sentence: string;
  onDetails: () => void;
  /**
   * False until confirmed or cached totals exist. The trigger is **hidden**
   * rather than disabled: a dead control with nothing explaining it is the
   * same false accusation `QUIET_GRACE_MS` exists to prevent.
   */
  showDetails: boolean;
}>(function TodayNextStep({ sentence, onDetails, showDetails }, ref) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.nextStep}>
      <Text accessibilityRole='summary' style={styles.sentence}>{sentence}</Text>
      {showDetails && (
        <Pressable
          ref={ref}
          accessibilityRole='button'
          accessibilityLabel="See today's details"
          hitSlop={space.sm}
          onPress={onDetails}
          style={(
            { pressed },
          ) => [
            styles.detailsTarget,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.detailsLink}>See today&apos;s details</Text>
        </Pressable>
      )}
    </View>
  );
});

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    nextStep: { gap: space.xs, paddingTop: space.sm },
    sentence: {
      ...font.body.body,
      fontSize: 15,
      lineHeight: 22,
      color: colors.text,
    },
    /**
     * A link rather than a `Button`: details are genuinely optional, and a
     * filled CTA under a calm sentence would make looking at your numbers the
     * point of the screen.
     */
    detailsLink: { ...font.body.strong, color: colors.accentDeep },
    detailsTarget: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  });

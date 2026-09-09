import { forwardRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/index.ts';
import { colors, font, radius, ramp, space } from '@/theme.ts';
import { tw } from '@/ui/tailwind.ts';
import { TODAY_SCREEN_COPY } from './today-screen-copy.ts';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

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
  dark?: boolean;
}>(function TodayNextStep({ sentence, onDetails, showDetails, dark = false }, ref) {
  return (
    <View style={styles.nextStep}>
      <Text
        scale='chrome'
        style={{ ...font.body.label, color: dark ? ramp.sage[300] : colors.muted }}
      >
        {TODAY_SCREEN_COPY.next}
      </Text>
      <Text accessibilityRole='summary' style={[styles.sentence, dark && { color: colors.bg }]}>
        {sentence}
      </Text>
      {showDetails && (
        <Pressable
          ref={ref}
          accessibilityRole='button'
          accessibilityLabel="See today's details"
          hitSlop={space.sm}
          onPress={onDetails}
          style={({ pressed }) =>
            tw.style('flex-row items-center justify-between gap-md px-md py-sm', {
              minHeight: 56,
              borderRadius: radius.lg,
              borderCurve: 'continuous',
              backgroundColor: dark ? ramp.neutral[800] : colors.surface,
              opacity: pressed ? 0.6 : 1,
            })}
        >
          <Text scale='chrome' style={[styles.detailsLink, dark && { color: colors.bg }]}>
            {TODAY_SCREEN_COPY.details}
          </Text>
          <MaterialCommunityIcons
            name='arrow-right'
            size={20}
            color={dark ? colors.bg : colors.accentDeep}
            accessibilityElementsHidden
            importantForAccessibility='no-hide-descendants'
          />
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

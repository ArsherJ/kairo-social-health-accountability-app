import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { font, space, type Theme } from '@/theme.ts';
import { Glass, Text, useStyles, useTheme } from '@/ui/index.ts';

/**
 * The one fat button at the foot of an onboarding beat.
 *
 * Deliberately not `Button`. `Button` is the app's compact control, sized to
 * its label. An onboarding CTA is
 * a different object: full width, 62pt tall, and the only tappable thing on the
 * screen. Making `Button` grow a fifth variant to cover that would put a shape
 * nothing else in the app uses behind a name everything else in the app uses.
 *
 * Three tones, and each is a ground rather than a preference:
 *
 * `glass` is the readable translucent surface, `ink` is a deliberate deep
 * fill, and `bright` is the apricot primary action. None carries a hard lip.
 */
export function OnboardingCta({
  label,
  tone,
  icon,
  lines = 1,
  disabled = false,
  busy = false,
  onPress,
}: {
  label: string;
  tone: 'glass' | 'ink' | 'bright';
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  /**
   * How many lines the label may take. **One on a beat, two in a sheet.**
   *
   * A beat's CTA has the whole screen; the welcome run's cards are a sheet
   * inside a scrim, so the same pill loses four lots of `space.lg` and about a
   * third of its width — and at the `chrome` scale's 1.4× cap a three-word
   * label no longer fits on a 320pt screen. `numberOfLines={1}` then ellipsises
   * it, which is the permission sheet's 2026-08-17 failure in a new place: a
   * control whose words are cut is a control somebody cannot act on. Wrapping
   * costs nothing here because `HEIGHT` is a `minHeight`.
   */
  lines?: 1 | 2;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const ink = tone === 'bright' ? colors.ink : tone === 'ink' ? colors.onDeep : colors.text;

  const body = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.body}
    >
      {busy ? (
        <ActivityIndicator color={ink} />
      ) : (
        <>
          <Text scale="chrome" numberOfLines={lines} style={[styles.label, { color: ink }]}>
            {label}
          </Text>
          {icon ? <MaterialCommunityIcons name={icon} size={20} color={ink} /> : null}
        </>
      )}
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        tone === 'ink' && styles.inkPill,
        // `bright` is the accent, which is a fill — so its label is ink, set
        // above. Cream on it measures 2.65:1.
        tone === 'bright' && styles.brightPill,
        pressed && styles.pressed,
        (disabled || busy) && styles.disabled,
      ]}
    >
      {tone === 'glass' ? (
        <Glass tone="light" radius={26} style={styles.glassPill}>
          {body}
        </Glass>
      ) : (
        body
      )}
    </Pressable>
  );
}

const HEIGHT = 62;

const makeStyles = ({ colors, shadow }: Theme) => StyleSheet.create({
  pill: { minHeight: HEIGHT, borderRadius: 26, borderCurve: 'continuous', justifyContent: 'center' },
  glassPill: { minHeight: HEIGHT, justifyContent: 'center' },
  inkPill: { backgroundColor: colors.sage, ...shadow.lg },
  brightPill: {
    backgroundColor: colors.accent,
    ...shadow.lg,
  },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.45 },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: space.lg,
  },
  label: { ...font.display.action, flexShrink: 1 },
});

export const ONBOARDING_CTA_HEIGHT = HEIGHT;

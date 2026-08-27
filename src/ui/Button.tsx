import { ActivityIndicator, Animated, Pressable, StyleSheet } from 'react-native';
import { colors, font, ramp, radius, shadow, space } from '../theme.ts';
import { usePressScale } from './motion.ts';
import { Text } from './Text.tsx';

/**
 * Caprasimo on a pill. The system sets `.btn` in the display face, which is
 * what keeps a primary action reading as part of the game rather than as a
 * form control borrowed from somewhere else.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  disabled?: boolean;
  busy?: boolean;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const inert = disabled || busy;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        // Named on the control rather than left to the child, because the
        // child goes away: while `busy` the label is replaced by a spinner,
        // and a button whose name vanishes mid-action is announced as
        // "button, busy" with no indication of which one.
        accessibilityLabel={label}
        accessibilityState={{ disabled: inert, busy }}
        disabled={inert}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.base, styles[variant], inert && styles.disabled]}
      >
        {busy ? (
          <ActivityIndicator color={variant === 'primary' ? colors.bg : colors.accent} />
        ) : (
          // `chrome`: `base` sets minHeight rather than height, so the pill
          // grows with the label — but a Caprasimo action line past ~1.4x
          // wraps, and a two-line button stops reading as one.
          <Text scale="chrome" style={[styles.label, styles[`${variant}Label`]]}>
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    marginTop: space.sm,
    minHeight: 52,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent, ...shadow.sm },
  secondary: { backgroundColor: ramp.neutral[100] },
  ghost: {},
  /**
   * Leaving a battle, leaving a squad.
   *
   * Outlined in the damage colour rather than filled with it: these belong at
   * the foot of a screen and must not compete with the primary action above
   * them, but "quiet" was taken too far — both were 12.5pt grey text, which
   * hand-testing did not read as a button at all. Chrome without weight is what
   * this variant is for. The `Alert.alert` confirm behind each one is still the
   * real guard.
   */
  destructive: {
    borderWidth: 1,
    borderColor: colors.damage,
    backgroundColor: 'transparent',
  },
  disabled: { opacity: 0.45 },
  label: { ...font.display.action },
  primaryLabel: { color: colors.bg },
  secondaryLabel: { color: colors.text },
  ghostLabel: { color: ramp.accent[700] },
  destructiveLabel: { color: colors.damage },
});

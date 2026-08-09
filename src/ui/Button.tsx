import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from 'react-native';
import { colors, font, ramp, radius, shadow, space } from '../theme.ts';
import { usePressScale } from './motion.ts';

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
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale();
  const inert = disabled || busy;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
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
          <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
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
  disabled: { opacity: 0.45 },
  label: { ...font.display.action },
  primaryLabel: { color: colors.bg },
  secondaryLabel: { color: colors.text },
  ghostLabel: { color: ramp.accent[700] },
});

import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from 'react-native';
import { colors, font, radius, space } from '../theme.ts';
import { usePressScale } from './motion.ts';

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
        style={[styles.base, styles[variant], disabled && styles.disabled]}
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
    minHeight: 48,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: 1, borderColor: colors.borderStrong },
  ghost: {},
  disabled: { opacity: 0.35 },
  label: { ...font.body.button },
  primaryLabel: { color: colors.bg },
  secondaryLabel: { color: colors.text },
  ghostLabel: { color: colors.subtle },
});

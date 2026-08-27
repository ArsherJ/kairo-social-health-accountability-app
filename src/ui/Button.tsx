import { ActivityIndicator, Animated, Pressable, StyleSheet } from 'react-native';
import { colors, font, radius, space } from '../theme.ts';
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
          <ActivityIndicator color={variant === 'primary' ? colors.text : colors.accentDeep} />
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
    minHeight: 56,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * The lip.
   *
   * `borderBottomWidth`, never `shadow` — the design's `0 4px 0` has no blur,
   * and RN's `shadowRadius: 0` still composites differently on the two
   * platforms. A border is the same 3px everywhere and costs nothing.
   *
   * It is on the filled variants only. A ghost button has no body for an edge
   * to be the underside of.
   */
  primary: {
    backgroundColor: colors.accent,
    borderBottomWidth: 3,
    borderBottomColor: colors.accentEdge,
  },
  secondary: {
    backgroundColor: colors.teal,
    borderBottomWidth: 3,
    borderBottomColor: colors.tealEdge,
  },
  ghost: {},
  /**
   * Leaving a battle, leaving a squad.
   *
   * Outlined in the damage colour rather than filled with it: these belong at
   * the foot of a screen and must not compete with the primary action above
   * them, but "quiet" was taken too far once — both were 12.5pt grey text,
   * which hand-testing did not read as a button at all. Chrome without weight
   * is what this variant is for. It takes no lip, because it has no fill to be
   * the underside of. The `Alert.alert` confirm behind each one is still the
   * real guard.
   */
  destructive: {
    borderWidth: 1,
    borderColor: colors.damage,
    backgroundColor: 'transparent',
  },
  disabled: { opacity: 0.45 },
  label: { ...font.display.action },
  /** `colors.text` on amber is 6.4:1. `colors.bg` on it would be 1.9:1. */
  primaryLabel: { color: colors.text },
  /** Cream on teal. The one filled variant whose label is light. */
  secondaryLabel: { color: colors.bg },
  ghostLabel: { color: colors.accentDeep },
  destructiveLabel: { color: colors.damage },
});

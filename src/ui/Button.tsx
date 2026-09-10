import { ActivityIndicator, Animated, Pressable, StyleSheet } from 'react-native';
import { font, radius, space, type Theme } from '../theme.ts';
import { usePressScale } from './motion.ts';
import { Text } from './Text.tsx';
import { useStyles, useTheme } from './use-theme.ts';

/**
 * Fredoka on a pill. The system sets `.btn` in the display face, which is
 * what keeps a primary action reading as part of the game rather than as a
 * form control borrowed from somewhere else.
 *
 * Four variants, and the label colour of each answers to its fill rather than
 * to the page: a bright fill takes `ink`, a deep fill takes `onDeep`, and the
 * two unfilled variants take the page's own inks. That is what keeps every
 * button legible in both schemes without a per-scheme branch here.
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
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { scale, onPressIn, onPressOut } = usePressScale();
  const inert = disabled || busy;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        // Named on the control rather than left to the child, because the
        // child goes away while `busy`.
        accessibilityLabel={label}
        accessibilityState={{ disabled: inert, busy }}
        disabled={inert}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.base, styles[variant], inert && styles.disabled]}
      >
        {busy ? (
          <ActivityIndicator color={variant === 'primary' ? colors.ink : colors.accentDeep} />
        ) : (
          // `chrome`: `base` sets minHeight rather than height, so the pill
          // grows with the label — but an action line past ~1.4x wraps, and a
          // two-line button stops reading as one.
          <Text scale="chrome" style={[styles.label, styles[`${variant}Label`]]}>
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    base: {
      marginTop: space.sm,
      minHeight: 54,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
    },
    /**
     * The lip. `borderBottomWidth`, never `shadow` — a border is the same 3px
     * everywhere and costs nothing. Filled variants only.
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
     * Leaving a squad, deleting an account. Outlined rather than filled: these
     * belong at the foot of a screen and must not compete with the primary
     * action above them. The `Alert.alert` confirm behind each is the guard.
     */
    destructive: {
      borderWidth: 1,
      borderColor: colors.damage,
      backgroundColor: 'transparent',
    },
    disabled: { opacity: 0.45 },
    label: { ...font.display.action },
    /** Ink on the orange. `text` would be cream under the dark scheme. */
    primaryLabel: { color: colors.ink },
    /** Light on teal, in both schemes. */
    secondaryLabel: { color: colors.onDeep },
    ghostLabel: { color: colors.accentDeep },
    destructiveLabel: { color: colors.damage },
  });

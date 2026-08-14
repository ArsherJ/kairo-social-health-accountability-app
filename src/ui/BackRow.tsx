import Feather from '@expo/vector-icons/Feather';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from './Text.tsx';
import { colors, font, space } from '../theme.ts';

/**
 * The way out of a full-screen task.
 *
 * Create and join hide the orbit nav, so without this the only exit is a ghost
 * button below a scrolling form — reachable, but not *visible* while the
 * keyboard is up. This sits where the eye already starts.
 *
 * It does not replace that ghost button: one is the escape, the other is the
 * end of the form. Both call the same `onPress`.
 */
export function BackRow({
  onPress,
  disabled = false,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      accessibilityState={{ disabled }}
      hitSlop={space.md}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Feather name="chevron-left" size={20} color={colors.subtle} />
      <Text style={styles.label}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    marginBottom: space.md,
    // Pulled left so the chevron's own side-bearing does not read as an
    // indent against the label stack below it.
    marginLeft: -6,
  },
  label: { color: colors.subtle, ...font.body.button, fontSize: 15 },
});

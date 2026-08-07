import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { UserFocus } from '@kairo/core';
import { colors, font, radius, space } from '@/theme.ts';
import { FOCUS_OPTIONS } from './focus-options.ts';

/**
 * The single-select focus question, shared by the onboarding step and the
 * Profile edit row so the two cannot drift apart.
 *
 * Tapping the selected chip clears it — the honest affordance for a question
 * whose "no answer" is a real answer, and the only way to get back to unset
 * once something is picked.
 */
export function FocusChips({
  value,
  onChange,
  disabled = false,
}: {
  value: UserFocus | null;
  onChange: (focus: UserFocus | null) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.list}>
      {FOCUS_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${option.label}. ${option.blurb}`}
            disabled={disabled}
            onPress={() => onChange(selected ? null : option.value)}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && styles.chipPressed,
              disabled && styles.chipDisabled,
            ]}
          >
            <View style={styles.chipText}>
              <Text style={[styles.label, selected && styles.labelSelected]}>
                {option.label}
              </Text>
              <Text style={styles.blurb}>{option.blurb}</Text>
            </View>
            <View style={[styles.dot, selected && styles.dotSelected]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  chipSelected: { borderColor: colors.accent },
  chipPressed: { opacity: 0.85 },
  chipDisabled: { opacity: 0.5 },
  chipText: { flex: 1 },
  label: { color: colors.text, fontSize: 16, fontWeight: '700' },
  labelSelected: { color: colors.accent },
  blurb: { color: colors.subtle, ...font.body, marginTop: 2 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    marginLeft: space.md,
  },
  dotSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
});

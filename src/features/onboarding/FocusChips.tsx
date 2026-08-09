import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { UserFocus } from '@kairo/core';
import { colors, font, ramp, radius, space } from '@/theme.ts';
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
    borderRadius: radius.lg,
    // The ring below is drawn on every chip, transparent until selected, so
    // the padding here is the *inner* box on both states. Sizing the resting
    // chip without a border and adding one on selection made the whole row
    // jump 4pt on tap.
    borderWidth: 2,
    borderColor: 'transparent',
    paddingVertical: 17,
    paddingHorizontal: 19,
  },
  // Chosen is a tint plus a ring, not an outline on an otherwise identical
  // plate: on cream a 1px border is nearly invisible at arm's length, and
  // this question is answered once, quickly, while standing up.
  chipSelected: {
    backgroundColor: ramp.accent[200],
    borderColor: ramp.accent[500],
  },
  chipPressed: { opacity: 0.85 },
  chipDisabled: { opacity: 0.5 },
  chipText: { flex: 1 },
  label: { color: colors.text, ...font.display.small, fontSize: 19 },
  labelSelected: { color: ramp.accent[900] },
  blurb: { ...font.body.body, fontSize: 13, color: ramp.neutral[700], marginTop: 2 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: ramp.neutral[400],
    marginLeft: space.md,
  },
  // A filled disc with a page-coloured core, so the mark reads as a switch
  // that moved rather than as a dot that changed colour.
  dotSelected: {
    borderWidth: 5,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
  },
});

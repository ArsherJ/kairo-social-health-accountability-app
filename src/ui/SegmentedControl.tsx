import { Pressable, StyleSheet, View } from 'react-native';
import { font, radius, type Theme } from '../theme.ts';
import { Text } from './Text.tsx';
import { useStyles } from './use-theme.ts';

/**
 * Two or three choices in a track, one of them chosen.
 *
 * The selected segment is a raised surface with the page's own ink, never an
 * accent fill: the Flock board's day toggle painted its active half orange,
 * which made a *filter* look like the screen's primary action. A control that
 * says where you are stands out by height, not by hue.
 *
 * Each segment is its own `button` with `selected` state, so VoiceOver reads
 * "Today, selected, button" and the track itself says nothing.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Names the choice being made, for the hint on each segment. */
  accessibilityLabel: string;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.track}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            accessibilityHint={accessibilityLabel}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentOn]}
          >
            <Text
              scale="chrome"
              numberOfLines={1}
              style={[styles.label, selected && styles.labelOn]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = ({ colors, ramp, shadow }: Theme) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      padding: 3,
      gap: 3,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: ramp.neutral[200],
    },
    segment: {
      flex: 1,
      minHeight: 44,
      paddingVertical: 10,
      borderRadius: radius.md - 3,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentOn: { backgroundColor: colors.surface, ...shadow.sm },
    label: { ...font.body.strong, fontSize: 13, color: colors.muted },
    labelOn: { color: colors.text },
  });

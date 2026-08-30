import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, font, shadow, space } from '@/theme.ts';
import { Glass, Text } from '@/ui/index.ts';

/**
 * The one fat button at the foot of an onboarding beat.
 *
 * Deliberately not `Button`. `Button` is the app's control — a 52pt pill sized
 * to its label, in the display face, with a hard 3px lip. An onboarding CTA is
 * a different object: full width, 62pt tall, and the only tappable thing on the
 * screen. Making `Button` grow a fifth variant to cover that would put a shape
 * nothing else in the app uses behind a name everything else in the app uses.
 *
 * Three tones, and each is a ground rather than a preference:
 *
 *   - `glass` for a saturated field (the two value cards), where a solid fill
 *     would punch a hole in the gradient behind it;
 *   - `ink` for a pale field, where the button has to be the darkest thing;
 *   - `bright` for the moment the run pays off, on the name screen.
 *
 * **A 3px lip, not a shadow**, on the two solid tones. It is the design's own
 * mark and it does something a shadow does not: it survives being pressed,
 * because the press state removes it and the button visibly sits down.
 */
export function OnboardingCta({
  label,
  tone,
  icon,
  disabled = false,
  onPress,
}: {
  label: string;
  tone: 'glass' | 'ink' | 'bright';
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  disabled?: boolean;
  onPress: () => void;
}) {
  const ink = tone === 'glass' ? colors.sage : tone === 'ink' ? colors.bg : colors.text;

  const body = (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.body}
    >
      <Text scale="chrome" numberOfLines={1} style={[styles.label, { color: ink }]}>
        {label}
      </Text>
      {icon && <MaterialCommunityIcons name={icon} size={20} color={ink} />}
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        tone === 'ink' && styles.inkPill,
        // `bright` is the accent, which is a fill — so its label is ink, set
        // above. Cream on it measures 2.65:1.
        tone === 'bright' && styles.brightPill,
        // The lip collapses on press, so the button sits down rather than
        // merely fading. Glass has none: it has no edge to lose.
        pressed && tone !== 'glass' && styles.pressed,
        disabled && styles.disabled,
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

const styles = StyleSheet.create({
  pill: { minHeight: HEIGHT, borderRadius: 26, borderCurve: 'continuous', justifyContent: 'center' },
  glassPill: { minHeight: HEIGHT, justifyContent: 'center' },
  inkPill: { backgroundColor: colors.text, borderBottomWidth: 3, borderBottomColor: '#120c2b', ...shadow.lg },
  brightPill: {
    backgroundColor: colors.accent,
    borderBottomWidth: 3,
    borderBottomColor: colors.accentEdge,
    ...shadow.lg,
  },
  // Losing the lip *and* gaining the height back, so the button does not jump.
  pressed: { borderBottomWidth: 0, marginBottom: 3, opacity: 0.92 },
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

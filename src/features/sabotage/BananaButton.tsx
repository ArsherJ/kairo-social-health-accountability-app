import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, ramp, radius, shadow, space } from '@/theme.ts';
import { NAV_HEIGHT } from '@/ui/index.ts';

/**
 * Sabotage as a standing HUD affordance rather than a detail inside a row.
 *
 * §20.4 calls sabotage the soul of the product, and the old placement argued
 * against that: you could only throw from a control that appeared once you had
 * already scrolled a board looking at someone else's number. This sits above
 * the nav on every tab, carrying how many you have left, so the mechanic is
 * visible on a screen where nothing has reminded you of it.
 *
 * It does not throw. Choosing *who* is the whole decision, and inventing a
 * target picker here would put two steps between the impulse and the banana —
 * exactly what `DeploySheet` is written to avoid. So it takes you to the board,
 * where every target is one tap away.
 */
export function BananaButton({
  remaining,
  onPress,
}: {
  remaining: number;
  onPress: () => void;
}) {
  const insets = useSafeAreaInsets();
  const spent = remaining === 0;

  return (
    <View style={[styles.dock, { bottom: insets.bottom + space.sm + NAV_HEIGHT - 6 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          spent
            ? 'No bananas left today'
            : `${remaining} banana${remaining === 1 ? '' : 's'} left. Open the board to throw one.`
        }
        onPress={onPress}
        style={({ pressed }) => [styles.button, spent && styles.spent, pressed && styles.pressed]}
      >
        <Text style={styles.emoji}>🍌</Text>
      </Pressable>

      {/* The count is the point — an ammo indicator you never spend is just
          decoration, and one you cannot see is not an indicator. */}
      <View style={[styles.badge, spent && styles.badgeSpent]}>
        <Text style={styles.badgeLabel}>{remaining}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  button: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: ramp.sage[500],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },
  spent: { backgroundColor: ramp.neutral[300] },
  pressed: { opacity: 0.8 },
  emoji: { fontSize: 24 },
  badge: {
    position: 'absolute',
    top: -6,
    right: '50%',
    marginRight: -34,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: ramp.accent[700],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  badgeSpent: { backgroundColor: ramp.neutral[500] },
  badgeLabel: { ...font.display.label, fontSize: 11, color: colors.bg },
});

import { StyleSheet, View } from 'react-native';
import { colors, font, radius, space } from '../theme.ts';
import { Text } from './Text.tsx';

/**
 * A call to action that **is not itself tappable** — the card around it is.
 *
 * Deliberately a `View`, not a `Button`. The battle empty state is one big
 * `Pressable`, and nesting a touchable inside a touchable on iOS gives you two
 * overlapping targets where the inner one swallows the press and the outer one
 * still highlights. So this borrows `Button`'s shape and does none of its work.
 *
 * It exists because both empty states were a `Label` plus two lines of prose
 * inside a dashed border, and hand-testing reported them as not clickable —
 * correctly, since nothing in a stack of text says "tap me". The dashed edge
 * says *"something goes here"*; this says *"and here is how"*.
 */
export function CtaPill({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'sage' }) {
  return (
    <View style={[styles.pill, tone === 'sage' && styles.sage]}>
      {/* `chrome`, and deliberately not marked up as a control: the card
          around this is the `Pressable`, so VoiceOver should reach one
          element that ends "…Start a battle", not a button nested in a button.
          Same reasoning as the comment above about overlapping targets. */}
      <Text scale="chrome" style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    marginTop: space.md,
    // Shorter than `Button`'s 52pt minimum on purpose: it is not the primary
    // action of a screen, it is the affordance on a card.
    paddingVertical: 10,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  sage: { backgroundColor: colors.sage },
  label: { ...font.display.action, fontSize: 14, color: colors.bg },
});

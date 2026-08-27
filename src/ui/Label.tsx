import { StyleSheet } from 'react-native';
import { colors, font, ramp } from '../theme.ts';
import { Text } from './Text.tsx';

/**
 * The eyebrow. Small, spaced, uppercase, and always naming the block under it.
 *
 * `tone` is not decoration — it says which family the block belongs to, and
 * the three are the app's three: amber for you, sage for your lane and your
 * squad, neutral for everything that is merely a setting.
 */
export function Label({
  children,
  tone = 'accent',
}: {
  children: string;
  tone?: 'accent' | 'sage' | 'muted';
}) {
  return (
    // `chrome`: 10pt uppercase with letter-spacing, naming the block beneath
    // it. It has room to grow but not prose's room — an eyebrow that wraps to
    // two lines stops reading as an eyebrow.
    //
    // `header` is what lets VoiceOver's rotor jump between sections. Without
    // it the eyebrows are the only structure on these screens and none of it
    // is reachable.
    <Text scale="chrome" accessibilityRole="header" style={[styles.label, styles[tone]]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: { ...font.body.label, textTransform: 'uppercase' },
  /**
   * `colors.accentDeep`, not `ramp.accent[700]`, since 2026-08-27. 700 passes
   * on cream (4.71:1) and on a card (4.81:1) but measures 4.30:1 on the amber
   * wash, and an eyebrow on that wash is a thing this app now does. One value
   * that is right on all three grounds beats a rule about which ground an
   * eyebrow is allowed on.
   */
  accent: { color: colors.accentDeep },
  sage: { color: ramp.sage[700] },
  muted: { color: ramp.neutral[600] },
});

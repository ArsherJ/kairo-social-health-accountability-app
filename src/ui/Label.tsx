import { StyleSheet } from 'react-native';
import { font, ramp } from '../theme.ts';
import { Text } from './Text.tsx';

/**
 * The eyebrow. Small, spaced, uppercase, and always naming the block under it.
 *
 * `tone` is not decoration — it says which family the block belongs to, and
 * the three are the app's three: terracotta for you, sage for your lane and
 * your squad, neutral for everything that is merely a setting.
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
  accent: { color: ramp.accent[700] },
  sage: { color: ramp.sage[700] },
  muted: { color: ramp.neutral[600] },
});

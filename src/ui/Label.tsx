import { StyleSheet } from 'react-native';
import { font, type Theme } from '../theme.ts';
import { Text } from './Text.tsx';
import { useStyles } from './use-theme.ts';

/**
 * The eyebrow. Small, spaced, uppercase, and always naming the block under it.
 *
 * `tone` says which family the block belongs to: accent for you, sage for
 * your lane and your squad, neutral for everything that is merely a setting.
 */
export function Label({
  children,
  tone = 'accent',
}: {
  children: string;
  tone?: 'accent' | 'sage' | 'muted';
}) {
  const styles = useStyles(makeStyles);
  return (
    // `chrome`: an eyebrow that wraps to two lines stops reading as an eyebrow.
    // `header` is what lets VoiceOver's rotor jump between sections.
    <Text scale="chrome" accessibilityRole="header" style={[styles.label, styles[tone]]}>
      {children}
    </Text>
  );
}

const makeStyles = ({ colors, ramp }: Theme) =>
  StyleSheet.create({
    label: { ...font.body.label, textTransform: 'uppercase' },
    accent: { color: colors.accentDeep },
    sage: { color: ramp.sage[700] },
    muted: { color: ramp.neutral[600] },
  });

import { StyleSheet, View } from 'react-native';
import { font, radius, space, type Theme } from '../theme.ts';
import { Text } from './Text.tsx';
import { useStyles } from './use-theme.ts';

/**
 * A call to action that **is not itself tappable** — the card around it is.
 *
 * Deliberately a `View`, not a `Button`: nesting a touchable inside a
 * touchable on iOS gives two overlapping targets where the inner one swallows
 * the press. So this borrows `Button`'s shape and does none of its work.
 */
export function CtaPill({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'sage' }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.pill, tone === 'sage' && styles.sage]}>
      <Text
        scale="chrome"
        style={[styles.label, tone === 'sage' ? styles.sageInk : styles.accentInk]}
      >
        {label}
      </Text>
    </View>
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    pill: {
      alignSelf: 'flex-start',
      marginTop: space.md,
      paddingVertical: 10,
      paddingHorizontal: space.lg,
      borderRadius: radius.pill,
      borderCurve: 'continuous',
      backgroundColor: colors.accent,
    },
    // `sage` is a deep violet and carries `onDeep`; `accent` is a bright
    // orange and carries `ink`. Neither is the page's text colour.
    sage: { backgroundColor: colors.sage },
    label: { ...font.display.action, fontSize: 14 },
    accentInk: { color: colors.ink },
    sageInk: { color: colors.onDeep },
  });

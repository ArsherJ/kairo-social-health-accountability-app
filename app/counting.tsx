import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { COUNTING_COPY as copy } from '@/features/health/counting-copy.ts';
import { font, space, type Theme } from '@/theme.ts';
import { setNavHidden } from '@/ui/chrome.ts';
import { BackRow, Screen, Text, useStyles } from '@/ui/index.ts';

/**
 * How Kairo counts your activity — a pushed route with `/progress`'s shape.
 *
 * That screen explains what the figures *mean*; this one explains where they
 * *come from* — which sources are counted, what a typed-in number does, where
 * the day stops, what a flag means. The words are `counting-copy.ts`'s, which
 * is where the test that bans the hourly ceilings reads them.
 *
 * A route, not an eighth onboarding beat, and not a link on the Health ask —
 * that screen is the App Review disclosure surface the privacy sweep reads
 * whole, and a second thing to read there dilutes the one thing it must say.
 */
export default function Counting() {
  const router = useRouter();
  const styles = useStyles(makeStyles);

  // The same shape `/progress` uses: a card over the tab shell, so the tab bar
  // is covered rather than absent and `Screen` must not reserve room for it.
  useFocusEffect(
    useCallback(() => {
      setNavHidden(true);
      return () => setNavHidden(false);
    }, []),
  );

  return (
    <Screen>
      <BackRow onPress={() => router.back()} />

      <Text accessibilityRole="header" style={styles.title}>{copy.title}</Text>
      <Text style={styles.standfirst}>{copy.standfirst}</Text>

      {copy.sections.map((section) => (
        <View key={section.title} style={styles.entry}>
          <Text accessibilityRole="header" style={styles.term}>{section.title}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}
    </Screen>
  );
}

const makeStyles = ({ colors }: Theme) => StyleSheet.create({
  title: { color: colors.text, ...font.body.title, marginTop: space.md },
  standfirst: { color: colors.subtle, ...font.body.body, marginTop: space.sm, lineHeight: 21 },
  entry: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  term: { color: colors.text, ...font.display.minor },
  body: { color: colors.subtle, ...font.body.body, marginTop: space.sm, lineHeight: 21 },
});

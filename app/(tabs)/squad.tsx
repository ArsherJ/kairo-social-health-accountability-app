import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, space } from '@/theme.ts';

export default function Squad() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + space.lg }]}>
      <Text style={styles.title}>Squad</Text>
      <Text style={styles.body}>
        Squads arrive in Phase 4 — create or join by a six-digit code, then watch the
        leaderboard reorder live.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg },
  title: { color: colors.text, ...font.title },
  body: { color: colors.muted, ...font.body, marginTop: space.sm },
});

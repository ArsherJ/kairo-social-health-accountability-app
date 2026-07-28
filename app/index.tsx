import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { computeDailyScore, featuredStatFor } from '@kairo/core';

/**
 * Placeholder home screen. Its only job right now is to prove the wiring end to
 * end: Expo Router renders, and @kairo/core resolves from the workspace and
 * executes inside Hermes. Phase 1 replaces this with the character screen.
 */
export default function Home() {
  const insets = useSafeAreaInsets();

  const today = new Date().toISOString().slice(0, 10);
  const demo = computeDailyScore({
    buckets: Array.from({ length: 8 }, (_, hour) => ({
      hour,
      steps: 900,
      distanceM: 650,
      activeKcal: 55,
      activeMinutes: 6,
    })),
    featuredStat: featuredStatFor(today),
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.brand}>KAIRO</Text>
      <Text style={styles.tagline}>Every day is a Kairo moment.</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Scoring engine</Text>
        <Text style={styles.score}>{demo.healthTotal.toLocaleString()}</Text>
        <Text style={styles.meta}>
          {demo.contributingStats} of 4 stats · featured {demo.featuredStat}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#08080C', paddingHorizontal: 24 },
  brand: { color: '#F5F5FF', fontSize: 34, fontWeight: '800', letterSpacing: 6 },
  tagline: { color: '#6E6E85', fontSize: 15, marginTop: 6 },
  card: {
    marginTop: 40,
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#12121A',
    borderWidth: 1,
    borderColor: '#22223040',
  },
  label: { color: '#6E6E85', fontSize: 12, letterSpacing: 1.5, fontWeight: '600' },
  score: { color: '#8B7CFF', fontSize: 48, fontWeight: '800', marginTop: 8 },
  meta: { color: '#9A9AB0', fontSize: 13, marginTop: 4 },
});

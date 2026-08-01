import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '@/theme.ts';
import { xpProgress } from './xp-progress.ts';

/**
 * Lifetime progress toward the next level (§6).
 *
 * Level is permanent and never resets — a bad week costs progress but takes
 * nothing away — so this bar only ever moves right. The absolute numbers are
 * shown alongside the fill because the curve is quadratic: at level 20 the
 * bar creeps while the XP total climbs fast, and without the figures that
 * reads as the screen being broken.
 *
 * Track and fill deliberately match `StatBar`'s geometry; two bar idioms in
 * one app is one too many.
 */
export function XpBar({ totalXp }: { totalXp: number }) {
  const progress = xpProgress(totalXp);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.level}>LEVEL {progress.level}</Text>
        <Text style={styles.figures}>
          {progress.intoLevel.toLocaleString()} /{' '}
          {progress.neededForNext.toLocaleString()} XP
        </Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress.fraction * 100}%` }]} />
      </View>

      <Text style={styles.meta}>
        {(progress.neededForNext - progress.intoLevel).toLocaleString()} XP to level{' '}
        {progress.level + 1} · {totalXp.toLocaleString()} lifetime
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: space.lg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  level: { color: colors.text, fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  figures: { color: colors.subtle, fontSize: 14, fontWeight: '600' },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    marginTop: space.xs,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  meta: { color: colors.muted, fontSize: 12, marginTop: space.xs },
});

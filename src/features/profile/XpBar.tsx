import { StyleSheet, Text, View } from 'react-native';
import { colors, space } from '@/theme.ts';
import { Meter, Numeral } from '@/ui/index.ts';
import { xpProgress } from './xp-progress.ts';

/**
 * Lifetime progress toward the next level (§6).
 *
 * Level is permanent and never resets — a bad week costs progress but takes
 * nothing away — so this bar only ever moves right. The absolute numbers are
 * shown alongside the fill because the curve is quadratic: at level 20 the
 * bar creeps while the XP total climbs fast, and without the figures that
 * reads as the screen being broken.
 */
export function XpBar({ totalXp }: { totalXp: number }) {
  const progress = xpProgress(totalXp);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Numeral value={progress.level} size="hero" />
        <Text style={styles.figures}>
          {progress.intoLevel.toLocaleString()} /{' '}
          {progress.neededForNext.toLocaleString()} XP
        </Text>
      </View>

      <View style={styles.meterWrapper}>
        <Meter fraction={progress.fraction} color={colors.accent} />
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
  figures: { color: colors.subtle, fontSize: 14, fontFamily: 'Figtree-SemiBold' },
  meterWrapper: { marginTop: space.xs },
  meta: { color: colors.muted, fontSize: 12, marginTop: space.xs },
});

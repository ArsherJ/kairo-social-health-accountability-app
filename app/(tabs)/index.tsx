import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CORE_STATS, evolutionStageForLevel, levelForXp, type CoreStat } from '@kairo/core';
import { HunterSilhouette } from '@/features/character/HunterSilhouette.tsx';
import { StatBar } from '@/features/character/StatBar.tsx';
import {
  DOMINANCE_WINDOW_DAYS,
  useDominantStat,
  useTodayScore,
} from '@/features/character/queries.ts';
import { HealthPermissionSheet } from '@/features/health/HealthPermissionSheet.tsx';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { colors, font, radius, space } from '@/theme.ts';

const STAT_LABELS: Record<CoreStat, string> = {
  AGI: 'Steps and distance',
  STR: 'Active calories',
  END: 'Active minutes',
  VIT: 'Hourly movement',
};

/**
 * §6's evolution table, said out loud. The silhouette differences are real but
 * subtle on placeholder art, and a character that quietly changes shape reads
 * as a rendering glitch rather than as a reward.
 */
const DOMINANCE_LABELS: Record<CoreStat | 'balanced', string> = {
  AGI: 'AGILITY BUILD',
  STR: 'STRENGTH BUILD',
  END: 'ENDURANCE BUILD',
  VIT: 'VITALITY BUILD',
  balanced: 'ALL-ROUNDER',
};

export default function Character() {
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);
  const score = useTodayScore(session?.user.id, profile.data?.timezone);
  const dominance = useDominantStat(session?.user.id, profile.data?.timezone);

  const totalXp = profile.data?.total_xp ?? 0;
  const level = profile.data?.level ?? levelForXp(totalXp);
  const stage = evolutionStageForLevel(level);
  const today = score.data;

  const bonus = (today?.consistency_points ?? 0) + (today?.rec_points ?? 0);

  const points: Record<CoreStat, number> = {
    AGI: today?.agi_points ?? 0,
    STR: today?.str_points ?? 0,
    END: today?.end_points ?? 0,
    VIT: today?.vit_points ?? 0,
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.lg,
      }}
    >
      <Text style={styles.label}>LEVEL {level}</Text>
      <Text style={styles.name}>{profile.data?.character_name ?? '—'}</Text>

      <HunterSilhouette stage={stage} dominance={dominance.data} />

      {/* Null means an unstarted character, which has no build to name — and
          saying "All-Rounder" to someone who has done nothing would cheapen
          the one visual §6 says must be earned. */}
      {dominance.data != null && (
        <View style={styles.dominance}>
          <Text style={styles.dominanceLabel}>
            {DOMINANCE_LABELS[dominance.data]}
          </Text>
          <Text style={styles.meta}>
            from your last {DOMINANCE_WINDOW_DAYS} days
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>TODAY</Text>
        <Text style={styles.total}>{(today?.total ?? 0).toLocaleString()}</Text>
        <Text style={styles.meta}>
          {today
            ? `${today.contributing_stats} of 4 stats contributing`
            : 'No activity synced yet today.'}
        </Text>
        {bonus > 0 && (
          // Without this the four bars visibly do not sum to the total: the
          // consistency bonus and REC are both real points with no stat of
          // their own (§5).
          <Text style={styles.meta}>
            includes +{bonus.toLocaleString()} for consistency
            {(today?.rec_points ?? 0) > 0 ? ' and recovery' : ''}
          </Text>
        )}
      </View>

      {CORE_STATS.map((stat) => (
        <StatBar
          key={stat}
          stat={stat}
          label={STAT_LABELS[stat]}
          points={points[stat]}
          featured={today?.featured_stat === stat}
          tier={today?.tiers?.[stat]}
        />
      ))}

      <HealthPermissionSheet />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  label: { color: colors.muted, ...font.label },
  name: { color: colors.text, ...font.title, marginTop: space.xs },
  card: {
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  total: { color: colors.accent, fontSize: 48, fontWeight: '800', marginTop: space.sm },
  meta: { color: colors.subtle, fontSize: 13, marginTop: space.xs },
  dominance: { alignItems: 'center', marginTop: space.sm },
  dominanceLabel: { color: colors.accent, ...font.label },
});

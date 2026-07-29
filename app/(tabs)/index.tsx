import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CORE_STATS, evolutionStageForLevel, levelForXp, type CoreStat } from '@kairo/core';
import { HunterSilhouette } from '@/features/character/HunterSilhouette.tsx';
import { StatBar } from '@/features/character/StatBar.tsx';
import { useTodayScore } from '@/features/character/queries.ts';
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

export default function Character() {
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);
  const score = useTodayScore(session?.user.id, profile.data?.timezone);

  const totalXp = profile.data?.total_xp ?? 0;
  const level = profile.data?.level ?? levelForXp(totalXp);
  const stage = evolutionStageForLevel(level);
  const today = score.data;

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

      <HunterSilhouette stage={stage} />

      <View style={styles.card}>
        <Text style={styles.label}>TODAY</Text>
        <Text style={styles.total}>{(today?.total ?? 0).toLocaleString()}</Text>
        <Text style={styles.meta}>
          {today
            ? `${today.contributing_stats} of 4 stats contributing`
            : 'No activity synced yet today.'}
        </Text>
      </View>

      {CORE_STATS.map((stat) => (
        <StatBar
          key={stat}
          stat={stat}
          label={STAT_LABELS[stat]}
          points={points[stat]}
          featured={today?.featured_stat === stat}
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
});

import { StyleSheet, Text, View } from 'react-native';
import { evolutionStageForLevel, levelForXp, type CoreStat } from '@kairo/core';
import { HunterSilhouette } from '@/features/character/HunterSilhouette.tsx';
import { StatRow } from '@/features/character/StatRow.tsx';
import {
  DOMINANCE_WINDOW_DAYS,
  useDominantStat,
  useTodayScore,
} from '@/features/character/queries.ts';
import { useTodayBuckets } from '@/features/character/buckets.ts';
import { resolveStanding, type Standing } from '@/features/character/standing.ts';
import { resolveStatDetail, type StatDetail } from '@/features/character/stat-detail.ts';
import { useMySquad, useSquadLeaderboard } from '@/features/squad/queries.ts';
import { HealthPermissionSheet } from '@/features/health/HealthPermissionSheet.tsx';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { colors, font, space } from '@/theme.ts';
import { Label, Numeral, Screen } from '@/ui/index.ts';

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

/** "1st", "2nd", "3rd", "4th"... "11th"–"13th" are the irregular teens. */
function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "gold" -> "Gold", for a sentence. Never renders above Gold — there is no tier above it. */
function tierLabel(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function standingCopy(standing: Standing): string | null {
  switch (standing.kind) {
    case 'unknown':
      return null;
    case 'solo':
      return 'No squad yet.';
    case 'unranked':
      return 'Unranked today.';
    case 'ranked':
      if (!standing.ahead) return `${ordinal(standing.rank)} · leading.`;
      if (standing.ahead.gap === 0) {
        return `${ordinal(standing.rank)} · level with ${standing.ahead.name}.`;
      }
      return (
        `${ordinal(standing.rank)} · ${standing.ahead.name} is ` +
        `${standing.ahead.gap.toLocaleString()} ahead.`
      );
  }
}

function detailCopy(detail: StatDetail): string | null {
  switch (detail.kind) {
    case 'unknown':
      return null;
    case 'maxed':
      return 'Every stat at Gold.';
    case 'gap': {
      const gap = detail.gap.toLocaleString();
      const tier = tierLabel(detail.tier);
      if (detail.featured) {
        // `·` matches standingCopy's separator above — one rhetorical pattern
        // (clause · clause), one glyph, across this screen's two copy lines.
        return `${detail.stat} ×1.5 this week · ${gap} more ${detail.unit} for ${tier}.`;
      }
      return `${gap} more ${detail.unit} for ${tier} on ${detail.stat}.`;
    }
  }
}

export default function Character() {
  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);
  const score = useTodayScore(session?.user.id, profile.data?.timezone);
  const dominance = useDominantStat(session?.user.id, profile.data?.timezone);
  const buckets = useTodayBuckets(session?.user.id, profile.data?.timezone);

  // TanStack shares this cache with the Squad tab, so composing these two
  // queries here costs no extra request.
  const squad = useMySquad(session?.user.id);
  const board = useSquadLeaderboard(squad.data?.id, 'current');

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

  // daily_scores.featured_stat is a bare text column; CORE_STATS is the only
  // vocabulary sync-health ever writes into it.
  const featuredStat = (today?.featured_stat ?? null) as CoreStat | null;

  // undefined while squad membership is still loading, false for no squad,
  // true once it resolves either way. resolveStanding treats those as three
  // genuinely different states — coercing to a plain boolean here would
  // collapse "still loading" into "no squad" and render a false claim.
  const hasSquad = squad.data === undefined ? undefined : squad.data !== null;
  const standing = resolveStanding({ hasSquad, rows: board.data });
  const detail = resolveStatDetail({ totals: buckets.data, featuredStat });

  const standingLine = standingCopy(standing);
  const detailLine = detailCopy(detail);

  return (
    <Screen>
      <Label>{`LEVEL ${level}`}</Label>
      <Text style={styles.name}>{profile.data?.character_name ?? '—'}</Text>

      <HunterSilhouette stage={stage} dominance={dominance.data} />

      {/* Null means an unstarted character, which has no build to name — and
          saying "All-Rounder" to someone who has done nothing would cheapen
          the one visual §6 says must be earned. */}
      {dominance.data != null && (
        <View style={styles.dominance}>
          <Text style={styles.dominanceLabel}>{DOMINANCE_LABELS[dominance.data]}</Text>
          <Text style={styles.meta}>from your last {DOMINANCE_WINDOW_DAYS} days</Text>
        </View>
      )}

      {/* A pending score query is not an answer, and the hero number is the
          single most emphasised element on this screen — `today?.total ?? 0`
          would confidently claim zero for the one moment it is not true, then
          jump to the real total. Same discipline as the standing and detail
          lines below: render nothing rather than something false. */}
      {!score.isPending && (
        <Numeral value={today?.total ?? 0} size="hero" color={colors.accent} animate style={styles.hero} />
      )}

      {/* A pending standing query is not an answer. Rendering nothing beats a
          placeholder or a dash, both of which would state something false. */}
      {standingLine != null && <Text style={styles.standing}>{standingLine}</Text>}

      {!score.isPending && (
        <StatRow points={points} tiers={today?.tiers} featuredStat={featuredStat} />
      )}

      {detailLine != null && <Text style={styles.detail}>{detailLine}</Text>}

      {bonus > 0 && (
        // Without this the four chips visibly do not sum to the hero total:
        // the consistency bonus and REC are real points with no stat of
        // their own (§5).
        <Text style={styles.meta}>
          Includes {bonus.toLocaleString()} for consistency
          {(today?.rec_points ?? 0) > 0 ? ' and recovery' : ''}.
        </Text>
      )}

      <HealthPermissionSheet />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.text, ...font.body.title, marginTop: space.xs },
  dominance: { alignItems: 'center', marginTop: space.sm },
  dominanceLabel: { color: colors.accent, ...font.body.label },
  meta: { color: colors.subtle, ...font.body.body, marginTop: space.xs },
  hero: { marginTop: space.lg },
  standing: { color: colors.text, ...font.body.body, marginTop: space.sm },
  detail: { color: colors.subtle, ...font.body.body, marginTop: space.md },
});

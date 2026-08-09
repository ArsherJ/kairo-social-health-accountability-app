import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CORE_STATS, evolutionStageForLevel, levelForXp, type CoreStat } from '@kairo/core';
import { FirstSyncCallout } from '@/features/character/FirstSyncCallout.tsx';
import { Diorama } from '@/features/character/Diorama.tsx';
import { StatBar } from '@/features/character/StatBar.tsx';
import { StatRail } from '@/features/character/StatRail.tsx';
import { laneEmptyCopy, laneStat } from '@/features/character/lane.ts';
import {
  DOMINANCE_WINDOW_DAYS,
  useDominantStat,
  useTodayScore,
} from '@/features/character/queries.ts';
import { useTodayBuckets } from '@/features/character/buckets.ts';
import { resolveStanding, type Standing } from '@/features/character/standing.ts';
import { resolveStatDetail, type StatDetail } from '@/features/character/stat-detail.ts';
import { useMySquad, useSquadLeaderboard } from '@/features/squad/queries.ts';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile, useStreak } from '@/features/profile/queries.ts';
import { xpProgress } from '@/features/profile/xp-progress.ts';
import { colors, font, ramp, radius, shadow, space } from '@/theme.ts';
import { Avatar, Label, Meter, Numeral, TAB_PILL_CLEARANCE } from '@/ui/index.ts';

/**
 * §6's evolution table, said out loud. The silhouette differences are real but
 * subtle on placeholder art, and a character that quietly changes shape reads
 * as a rendering glitch rather than as a reward.
 */
const DOMINANCE_LABELS: Record<CoreStat | 'balanced', string> = {
  AGI: 'Agility build',
  STR: 'Strength build',
  END: 'Endurance build',
  VIT: 'Vitality build',
  balanced: 'All-Rounder',
};

/** The human-readable line under each bar, once the rail is expanded. */
const STAT_LABELS: Record<CoreStat, string> = {
  AGI: 'Steps and distance',
  STR: 'Active calories',
  END: 'Active minutes',
  VIT: 'Hourly movement',
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
      if (detail.lane) {
        // `·` matches standingCopy's separator above — one rhetorical pattern
        // (clause · clause), one glyph, across this screen's two copy lines.
        // No multiplier is claimed: the lane is marked, never scaled.
        return `Your lane · ${gap} more ${detail.unit} for ${tier} on ${detail.stat}.`;
      }
      return `${gap} more ${detail.unit} for ${tier} on ${detail.stat}.`;
    }
  }
}

export default function Character() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);

  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);
  const score = useTodayScore(session?.user.id, profile.data?.timezone);
  const dominance = useDominantStat(session?.user.id, profile.data?.timezone);
  const buckets = useTodayBuckets(session?.user.id, profile.data?.timezone);
  const streak = useStreak(session?.user.id);

  // TanStack shares this cache with the Squad tab, so composing these two
  // queries here costs no extra request.
  const squad = useMySquad(session?.user.id);
  const board = useSquadLeaderboard(squad.data?.id, 'current');

  const totalXp = profile.data?.total_xp ?? 0;
  const level = profile.data?.level ?? levelForXp(totalXp);
  const stage = evolutionStageForLevel(level);
  const xp = xpProgress(totalXp);
  const today = score.data;

  const bonus = (today?.consistency_points ?? 0) + (today?.rec_points ?? 0);

  const points: Record<CoreStat, number> = {
    AGI: today?.agi_points ?? 0,
    STR: today?.str_points ?? 0,
    END: today?.end_points ?? 0,
    VIT: today?.vit_points ?? 0,
  };

  // No featured stat any more. The redesign branch still had §6's weekly ×1.5
  // rotation; deviation #10 retired it from stored scoring, because squad
  // programs (deviation #12) carry the meta permanently and leaving both in
  // would stack multiplicatively. `daily_scores.featured_stat` is written null.
  //
  // What replaces it on this screen is the user's declared focus - their
  // "lane" - which is presentation only: the bar is marked, never widened.
  // `?? null`: the profile query is undefined while in flight, and both
  // helpers take "no focus declared" as null. Treating loading as "no lane"
  // for a frame only costs the marker, never a wrong claim.
  const focus = profile.data?.focus ?? null;
  const lane = laneStat(focus);
  const laneCopy = laneEmptyCopy(focus);

  // undefined while squad membership is still loading, false for no squad,
  // true once it resolves either way. resolveStanding treats those as three
  // genuinely different states — coercing to a plain boolean here would
  // collapse "still loading" into "no squad" and render a false claim.
  const hasSquad = squad.data === undefined ? undefined : squad.data !== null;
  const standing = resolveStanding({ hasSquad, rows: board.data });
  const detail = resolveStatDetail({ totals: buckets.data, lane });

  const standingLine = standingCopy(standing);
  const detailLine = detailCopy(detail);

  // Tall enough to stand someone in, capped so a Pro Max does not turn the
  // page into a poster with the day's number below the fold.
  const skyHeight = Math.max(360, Math.min(520, windowHeight * 0.54));
  const sabotage = Math.abs(today?.sabotage_delta ?? 0);

  // Everyone above you, nearest first — the faces on the squad pill.
  const others = (board.data ?? []).filter((r) => !r.is_self).slice(0, 3);

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Diorama height={skyHeight} stage={stage} dominance={dominance.data}>
          {/* The HUD. Everything here floats over the world rather than
              sitting in the page, which is the whole point of the direction —
              so each piece carries its own translucent ground and a shadow. */}

          {standing.kind === 'ranked' && standing.ahead && (
            <View style={[styles.squadPill, { top: insets.top + space.sm }]}>
              <View style={styles.faces}>
                {others.map((row, i) => (
                  <View key={row.user_id} style={i > 0 && styles.overlap}>
                    <Avatar name={row.character_name} size={24} ringed />
                  </View>
                ))}
              </View>
              <Text style={styles.squadText} numberOfLines={1}>
                {standing.ahead.name} is{' '}
                <Text style={styles.squadGap}>{standing.ahead.gap.toLocaleString()}</Text> ahead
              </Text>
            </View>
          )}

          <View style={[styles.levelPill, { top: insets.top + space.xl + space.sm }]}>
            <View style={styles.levelDisc}>
              <Text style={styles.levelNumber}>{level}</Text>
            </View>
            <View style={styles.levelBody}>
              <Meter fraction={xp.fraction} color={ramp.accent[500]} height={9} />
              <Text style={styles.levelMeta}>
                {xp.intoLevel.toLocaleString()} / {xp.neededForNext.toLocaleString()} XP
              </Text>
            </View>
          </View>

          {(streak.data?.current_streak ?? 0) > 0 && (
            <View style={[styles.streakPill, { top: insets.top + space.xl + space.sm }]}>
              <Text style={styles.streakNumber}>{streak.data?.current_streak}</Text>
              <Text style={styles.streakUnit}>day{streak.data?.current_streak === 1 ? '' : 's'}</Text>
            </View>
          )}

          {!score.isPending && (
            <View style={[styles.rail, { top: insets.top + 132 }]}>
              <StatRail
                tiers={today?.tiers}
                expanded={expanded}
                onToggle={() => setExpanded((e) => !e)}
              />
            </View>
          )}
        </Diorama>

        <View style={styles.shelf}>
          <View style={styles.todayHead}>
            <Label>Today</Label>
            {/* Null means an unstarted character, which has no build to name —
                and saying "All-Rounder" to someone who has done nothing would
                cheapen the one visual §6 says must be earned. */}
            {dominance.data != null && (
              <Text style={styles.build}>
                {DOMINANCE_LABELS[dominance.data]} · last {DOMINANCE_WINDOW_DAYS} days
              </Text>
            )}
          </View>

          {/* A pending score query is not an answer, and the hero number is the
              single most emphasised element on this screen — `today?.total ?? 0`
              would confidently claim zero for the one moment it is not true,
              then jump to the real total. Same discipline as the standing and
              detail lines below: render nothing rather than something false. */}
          {!score.isPending && (
            <Numeral
              value={today?.total ?? 0}
              size="hero"
              color={ramp.accent[700]}
              animate
              style={styles.hero}
            />
          )}

          {/* A pending standing query is not an answer. Rendering nothing beats
              a placeholder or a dash, both of which would state something
              false. */}
          {standingLine != null && <Text style={styles.standing}>{standingLine}</Text>}

          {detailLine != null && <Text style={styles.detail}>{detailLine}</Text>}

          {bonus > 0 && (
            // Without this the four coins visibly do not account for the hero
            // total: the consistency bonus and REC are real points with no
            // stat of their own (§5).
            <Text style={styles.meta}>
              Includes {bonus.toLocaleString()} for consistency
              {(today?.rec_points ?? 0) > 0 ? ' and recovery' : ''}.
            </Text>
          )}

          {expanded && (
            <View style={styles.detailBlock}>
              {CORE_STATS.map((stat) => (
                <StatBar
                  key={stat}
                  stat={stat}
                  label={STAT_LABELS[stat]}
                  points={points[stat]}
                  tier={today?.tiers?.[stat]}
                  lane={stat === lane}
                  laneEmptyCopy={laneCopy}
                />
              ))}
            </View>
          )}

          {sabotage > 0 && (
            // Being hit is the moment §14 cares most about, and the app should
            // not be the last place to mention it. It is also the one block on
            // this screen allowed to use the burnt family.
            <View style={styles.hit}>
              <View style={styles.hitBadge}>
                <Text style={styles.hitEmoji}>🍌</Text>
              </View>
              <View style={styles.hitBody}>
                <Text style={styles.hitTitle}>
                  Somebody got you. −{sabotage.toLocaleString()}
                </Text>
                <Text style={styles.hitMeta}>Off today's total. See it on the board.</Text>
              </View>
            </View>
          )}

          <FirstSyncCallout
            userId={session?.user.id}
            timeZone={profile.data?.timezone}
            points={points}
            tiers={today?.tiers ?? {}}
            hasScore={today != null}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: TAB_PILL_CLEARANCE },

  // — the floating HUD —
  squadPill: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '86%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 7,
    paddingLeft: 9,
    paddingRight: 15,
    borderRadius: radius.pill,
    backgroundColor: '#f9f4ede6',
    ...shadow.md,
  },
  faces: { flexDirection: 'row' },
  overlap: { marginLeft: -9 },
  squadText: { ...font.body.strong, color: ramp.neutral[800], flexShrink: 1 },
  squadGap: { color: ramp.accent[700] },

  levelPill: {
    position: 'absolute',
    left: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: 8,
    paddingRight: space.md,
    borderRadius: radius.pill,
    backgroundColor: '#f9f4ede6',
    ...shadow.md,
  },
  levelDisc: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNumber: { ...font.display.minor, color: colors.bg },
  levelBody: { width: 96 },
  levelMeta: { ...font.body.label, color: ramp.neutral[700], letterSpacing: 0, marginTop: 4 },

  streakPill: {
    position: 'absolute',
    right: space.md,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    backgroundColor: '#f9f4ede6',
    ...shadow.md,
  },
  streakNumber: { ...font.display.minor, color: ramp.accent[700] },
  streakUnit: { ...font.body.label, color: ramp.accent[700], letterSpacing: 0 },

  rail: { position: 'absolute', right: space.md },

  // — the cream shelf —
  shelf: { paddingHorizontal: space.lg, paddingTop: space.sm },
  todayHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  build: { ...font.body.strong, color: ramp.neutral[600], flexShrink: 1 },
  hero: { marginTop: space.xs },
  standing: { ...font.body.body, fontSize: 14.5, color: ramp.neutral[800], marginTop: space.sm },
  detail: { ...font.body.body, fontSize: 14.5, color: ramp.sage[700], marginTop: space.sm },
  meta: { ...font.body.body, fontSize: 13, color: colors.muted, marginTop: space.xs },
  detailBlock: { marginTop: space.sm },

  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: ramp.accent[200],
  },
  hitBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: ramp.accent[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  hitEmoji: { fontSize: 20 },
  hitBody: { flex: 1 },
  hitTitle: { ...font.display.small, color: ramp.accent[900] },
  hitMeta: { ...font.body.strong, color: ramp.accent[800], marginTop: 1 },
});

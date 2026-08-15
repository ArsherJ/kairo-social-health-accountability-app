import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CORE_STATS,
  currentLocalDate,
  evolutionStageForLevel,
  levelForXp,
  type CoreStat,
} from '@kairo/core';
import { DailyWalkCard } from '@/features/train/DailyWalkCard.tsx';
import { TrainEntry } from '@/features/train/TrainEntry.tsx';
import { GoalCard } from '@/features/goals/GoalCard.tsx';
import { FirstSyncCallout } from '@/features/character/FirstSyncCallout.tsx';
import { Diorama } from '@/features/character/Diorama.tsx';
import { StatBar } from '@/features/character/StatBar.tsx';
import { StatRail } from '@/features/character/StatRail.tsx';
import { SyncStatus } from '@/features/character/SyncStatus.tsx';
import { TodayPanel } from '@/features/character/TodayPanel.tsx';
import { laneEmptyCopy, laneStat } from '@/features/character/lane.ts';
import {
  DOMINANCE_WINDOW_DAYS,
  useDominantStat,
  useTodayScore,
} from '@/features/character/queries.ts';
import { useTodayBuckets, useTodayVitals } from '@/features/character/buckets.ts';
import { resolveStanding, type Standing } from '@/features/character/standing.ts';
import { resolveStatDetail, type StatDetail } from '@/features/character/stat-detail.ts';
import { useMySquad, useSquadLeaderboard } from '@/features/squad/queries.ts';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile, useStreak } from '@/features/profile/queries.ts';
import { xpProgress } from '@/features/profile/xp-progress.ts';
import { track } from '@/features/telemetry/events.ts';
import {
  hasReached,
  markReached,
  markUnreached,
} from '@/features/telemetry/milestone-store.ts';
import { colors, font, ramp, radius, shadow, space } from '@/theme.ts';
import { Avatar, Label, Meter, Numeral, STAT_NAMES, TAB_PILL_CLEARANCE, Text } from '@/ui/index.ts';

/**
 * Distinct from `first_sync_seen` (`markFirstSyncSeen` in `useHealthSync.ts`,
 * which this mirrors): data can land on the server overnight while nobody is
 * looking, so that event marks the write, not the payoff. This one marks the
 * moment the loop first visibly paid out — a non-zero day actually on screen.
 *
 * Milestone bookkeeping has no error handling of its own (MMKV can throw),
 * and telemetry must never break the screen it is observed from — so, same
 * as `markFirstSyncSeen`, every call into `milestone-store.ts` is guarded
 * here rather than inside it.
 *
 * Claims before the write lands, then releases the claim if `track` resolves
 * `false`, so a later non-zero day gets another chance. That trade errs
 * deliberately toward a duplicate over a loss: a write that actually landed
 * but *reported* false would fire the event twice, which is harmless, since
 * every reader of this event counts `distinct user_id` — a duplicate changes
 * no answer, a lost event is unrecoverable and this dataset cannot be
 * backfilled.
 */
function markFirstScoreSeen(userId: string): void {
  try {
    if (hasReached(userId, 'first_score_seen')) return;
    markReached(userId, 'first_score_seen');
  } catch (error) {
    console.warn('[telemetry] first_score_seen milestone', error);
    return;
  }

  // Fire-and-forget — the render path must never await telemetry — but the
  // resolved boolean still matters: `track` resolves `true` only when the
  // row actually landed, and a failed write must not count as a send.
  void track(userId, 'first_score_seen').then((landed) => {
    if (landed) return;
    try {
      markUnreached(userId, 'first_score_seen');
    } catch (error) {
      console.warn('[telemetry] first_score_seen milestone release', error);
    }
  });
}

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
      return 'Every stat is maxed for today.';
    case 'gap': {
      // Named in raw units and in what the effort *achieves* — never in points
      // and never in tier names. This line has carried three vocabularies:
      // "for Gold" (retired by deviation #23, tiers went internal), "for +400
      // AGI" (retired by the points spec), and this one. Each retirement had
      // the same motive: name something the user can recognise.
      const gap = detail.gap.toLocaleString();
      const name = STAT_NAMES[detail.stat];
      const outcome = detail.topsOut
        ? `tops out your ${name} today`
        : `lifts your ${name} today`;
      if (detail.lane) {
        // `·` matches standingCopy's separator above — one rhetorical pattern
        // (clause · clause), one glyph, across this screen's two copy lines.
        // No multiplier is claimed: the lane is marked, never scaled.
        return `Your lane · ${gap} more ${detail.unit} ${outcome}.`;
      }
      return `${gap} more ${detail.unit} ${outcome}.`;
    }
  }
}

export default function Character() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);
  const score = useTodayScore(session?.user.id, profile.data?.timezone);
  const dominance = useDominantStat(session?.user.id, profile.data?.timezone);
  const buckets = useTodayBuckets(session?.user.id, profile.data?.timezone);
  // Wearable-only, and gated on `has_wearable` at render — but fetched
  // unconditionally, because the flag is server-observed from sleep data and
  // a user who just connected a watch would otherwise wait a render for it.
  const vitals = useTodayVitals(session?.user.id, profile.data?.timezone);
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
  const userId = session?.user.id;

  // Guarded on total > 0 so a day that synced as zeros — a rest day, a phone
  // left at home — does not count as having seen progress.
  useEffect(() => {
    if (!userId) return;
    if (!today || today.total <= 0) return;
    markFirstScoreSeen(userId);
  }, [userId, today]);

  const points: Record<CoreStat, number> = {
    AGI: today?.agi_points ?? 0,
    STR: today?.str_points ?? 0,
    END: today?.end_points ?? 0,
    VIT: today?.vit_points ?? 0,
  };

  // Lifetime totals, which is what the coins and bars read. Undefined while the
  // profile loads — `ratingForStatPoints` floors at 1, so an unloaded rail says
  // the same thing a brand-new character's does rather than flashing a dash.
  const lifetime: Record<CoreStat, number> | undefined = profile.data && {
    AGI: profile.data.agi_total,
    STR: profile.data.str_total,
    END: profile.data.end_total,
    VIT: profile.data.vit_total,
  };

  // No featured stat any more. The redesign branch still had §6's weekly ×1.5
  // rotation; deviation #10 retired it from stored scoring, because squad
  // programs (deviation #12) carry the meta permanently and leaving both in
  // would stack multiplicatively. `daily_scores.featured_stat` is written null.
  //
  // What replaces it on this screen is the user's "lane" - presentation only:
  // the bar is marked, never widened. The lane used to be a focus declared once
  // in onboarding; that column is gone, and it now comes from the same
  // `dominance` the build label above already reads. Both helpers take an
  // in-flight query as "no lane", so a loading frame costs the marker and never
  // makes a wrong claim.
  const lane = laneStat(dominance.data);
  const laneCopy = laneEmptyCopy(dominance.data);

  // undefined while squad membership is still loading, false for no squad,
  // true once it resolves either way. resolveStanding treats those as three
  // genuinely different states — coercing to a plain boolean here would
  // collapse "still loading" into "no squad" and render a false claim.
  const hasSquad = squad.data === undefined ? undefined : squad.data !== null;
  const standing = resolveStanding({ hasSquad, rows: board.data });
  const detail = resolveStatDetail({ totals: buckets.data?.totals, lane });

  const standingLine = standingCopy(standing);
  const detailLine = detailCopy(detail);

  // Tall enough to stand someone in, capped so a Pro Max does not turn the
  // page into a poster with the day's number below the fold.
  const skyHeight = Math.max(360, Math.min(520, windowHeight * 0.54));

  // Everyone above you, nearest first — the faces on the squad pill.
  const others = (board.data ?? []).filter((r) => !r.is_self).slice(0, 3);

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Diorama
          height={skyHeight}
          stage={stage}
          dominance={dominance.data}
          body={profile.data?.character_body}
          lifetimePoints={lifetime}
        >
          {/* The HUD. Everything here floats over the world rather than
              sitting in the page, which is the whole point of the direction —
              so each piece carries its own translucent ground and a shadow.

              One absolutely-positioned column rather than four separately
              positioned pieces: the old version pinned each at a hardcoded
              offset (+8, +48, +48, +132) which silently assumed the pills were
              a certain height. At large Dynamic Type sizes they grew past each
              other's offsets and overlapped. Flexbox computes it now, so
              growth pushes downward and cannot collide.

              `box-none` so the column does not swallow taps meant for the
              diorama, while the rail inside it stays tappable. */}
          <View
            pointerEvents="box-none"
            style={[styles.hud, { top: insets.top + space.sm }]}
          >
            {standing.kind === 'ranked' && standing.ahead && (
              <View style={styles.squadPill}>
                <View style={styles.faces}>
                  {others.map((row, i) => (
                    <View key={row.user_id} style={i > 0 && styles.overlap}>
                      <Avatar name={row.character_name} size={24} ringed />
                    </View>
                  ))}
                </View>
                {/* `fixed` throughout the HUD. These are short numerals and
                    labels on a drawn surface, and every value here is repeated
                    at full `prose` scale further down the page — level and XP
                    in the TODAY panel, the streak on Profile, the ratings in
                    the expanded StatBars. Nothing becomes unreadable; it
                    becomes readable lower down.

                    The nested span needs its own: `maxFontSizeMultiplier` is
                    set per-Text and `Text` always passes one, so leaving it
                    off would cap this word at 1.8 inside a line capped at
                    1.2. */}
                <Text scale="fixed" style={styles.squadText} numberOfLines={1}>
                  {standing.ahead.name} is{' '}
                  <Text scale="fixed" style={styles.squadGap}>
                    {standing.ahead.gap.toLocaleString()}
                  </Text>{' '}
                  ahead
                </Text>
              </View>
            )}

            <View style={styles.hudRow}>
              {/* Never grouped at all before, so the level and its XP line read
                  as loose numbers. Children hidden explicitly, same as
                  `LeaderboardRow`. */}
              <View
                accessible
                accessibilityLabel={
                  `Level ${level}, ${xp.intoLevel.toLocaleString()} of ` +
                  `${xp.neededForNext.toLocaleString()} XP`
                }
                style={styles.levelPill}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={styles.levelDisc}
                >
                  <Text scale="fixed" style={styles.levelNumber}>{level}</Text>
                </View>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={styles.levelBody}
                >
                  <Meter fraction={xp.fraction} color={ramp.accent[500]} height={9} />
                  <Text scale="fixed" style={styles.levelMeta}>
                    {xp.intoLevel.toLocaleString()} / {xp.neededForNext.toLocaleString()} XP
                  </Text>
                </View>
              </View>

              {/* The streak is the only persistent pill. A goal in flight
                  belongs on the shelf below, where it has room for a target
                  and a date — not squeezed into a second pill up here.

                  "3 day streak", not "3-day": the hyphenated form is right on
                  screen and wrong out loud, the same rule `row-label.ts`
                  tests. */}
              {(streak.data?.current_streak ?? 0) > 0 && (
                <View
                  accessible
                  accessibilityLabel={`${streak.data?.current_streak} day streak`}
                  style={styles.pill}
                >
                  <Text
                    scale="fixed"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={styles.streakNumber}
                  >
                    {streak.data?.current_streak}
                  </Text>
                  <Text
                    scale="fixed"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={styles.streakUnit}
                  >
                    day{streak.data?.current_streak === 1 ? '' : 's'}
                  </Text>
                </View>
              )}
            </View>

            {!score.isPending && (
              <View style={styles.railRow}>
                <StatRail
                  ratings={lifetime}
                  expanded={expanded}
                  onToggle={() => setExpanded((e) => !e)}
                />
              </View>
            )}
          </View>
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

          {/* The day in the units it was lived in.

              This slot held `daily_scores.total` until 2026-08-15: a four-digit
              integer with no unit, no label and no target, in 64pt type. The
              engine still computes it — it ranks the board and scores every
              Goal — it is simply not something a first-time user can read.
              Steps lead because they are the figure the most users earn.

              Guarded on the buckets query, not the score query: this reads
              totals now. A pending query renders nothing rather than a
              confident zero that jumps to the real figure — the same
              discipline as the standing and detail lines below.

              One accessible element, not three. Ungrouped, VoiceOver would
              stop on the bare numeral ("8,412"), then on "steps", then on the
              hour line — the leaderboard's twelve-stop failure in miniature.
              The parent carries both props *and* hides each child explicitly,
              per the 2026-08-14 device pass. */}
          {buckets.data?.totals != null && (
            <View
              accessible
              accessibilityLabel={
                `${buckets.data.totals.steps.toLocaleString()} steps, ` +
                `${buckets.data.totals.activeHours} active ` +
                `${buckets.data.totals.activeHours === 1 ? 'hour' : 'hours'}`
              }
              style={styles.heroGroup}
            >
              {/* `flexWrap`, because this row is the widest thing on the shelf:
                  six display glyphs at 64pt plus the unit already overflow a
                  320pt screen before Dynamic Type touches it. Wrapping puts
                  the unit on its own line; without it the unit clips. */}
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.heroRow}
              >
                <Numeral
                  value={buckets.data.totals.steps}
                  size="hero"
                  color={ramp.accent[700]}
                  animate
                />
                {/* The unit is set in the display face, a step lighter on the
                    same terracotta ramp — "8,412 steps" is one utterance, not
                    a number with a grey caption pinned to it. `fixed` matches
                    Numeral's own cap, so the word cannot outgrow the figure it
                    belongs to. */}
                <Text scale="fixed" style={styles.heroUnit}>
                  steps
                </Text>
              </View>

              {/* Active *hours*, the one figure TodayPanel below does not
                  carry — it lists minutes. Volume, then spread: how much you
                  moved, and whether it was one walk or a whole day. */}
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.heroMeta}
              >
                {buckets.data.totals.activeHours} active{' '}
                {buckets.data.totals.activeHours === 1 ? 'hour' : 'hours'}
              </Text>
            </View>
          )}

          {/* A pending standing query is not an answer. Rendering nothing beats
              a placeholder or a dash, both of which would state something
              false. */}
          {standingLine != null && <Text style={styles.standing}>{standingLine}</Text>}

          {detailLine != null && <Text style={styles.detail}>{detailLine}</Text>}

          {/* The rest of the ledger, under the headline. The consistency and
              REC bonuses still score exactly as §5 says; the line narrating
              them as arithmetic ("Includes 300 for consistency") went with the
              hero total on 2026-08-15, since it existed only to reconcile the
              stat coins against a number no longer on screen.

              Strain and Sleep appear only with a wearable (§5). */}
          <TodayPanel
            totals={buckets.data?.totals}
            hourlyAvgHr={buckets.data?.hourlyAvgHr}
            restingHr={vitals.data?.restingHr}
            birthYear={profile.data?.birth_year}
            sleepMinutes={vitals.data?.sleepMinutes}
            hasWearable={profile.data?.has_wearable ?? false}
            today={
              profile.data?.timezone
                ? currentLocalDate(new Date(), profile.data.timezone)
                : undefined
            }
          />

          {/* Deliberately outside the panel's own null guard: an empty TODAY
              panel is exactly when "waiting for your first sync" or "couldn't
              sync" is the most useful thing on the screen. */}
          <SyncStatus />

          {expanded && (
            <View style={styles.detailBlock}>
              {CORE_STATS.map((stat) => (
                <StatBar
                  key={stat}
                  stat={stat}
                  label={STAT_LABELS[stat]}
                  todayPoints={points[stat]}
                  lifetimePoints={lifetime?.[stat]}
                  lane={stat === lane}
                  laneEmptyCopy={laneCopy}
                />
              ))}

              {/* Offered here rather than beside the hero because expanding
                  the rail is the moment someone is already asking what these
                  numbers mean. A permanent link by the score would be a help
                  affordance competing with the thing it explains. */}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="How progress works"
                hitSlop={space.sm}
                onPress={() => router.push('/progress')}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Text style={styles.helpLink}>How progress works</Text>
              </Pressable>
            </View>
          )}

          {/* The one number in Kairo that never moves, and the run of days
              against it. Above the goal deliberately: the walk is the floor
              everyone shares, and a goal is the thing this particular user
              chose — baseline first, then commitment.

              It does not restate today's steps. The hero already sets them at
              64pt and `detailCopy` already names the gap; see the card. */}
          <DailyWalkCard
            userId={session?.user.id}
            timeZone={profile.data?.timezone}
            today={
              profile.data?.timezone
                ? currentLocalDate(new Date(), profile.data.timezone)
                : undefined
            }
            todaySteps={buckets.data?.totals?.steps}
          />

          {/* The door to Challenges, between the floor everyone shares and the
              commitment this user chose. It shows the live target as text so
              the mechanic is legible without navigating — for a new user that
              reads as "Log one run of 1 km", which is an invitation. */}
          <TrainEntry
            userId={session?.user.id}
            timeZone={profile.data?.timezone}
            today={
              profile.data?.timezone
                ? currentLocalDate(new Date(), profile.data.timezone)
                : undefined
            }
          />

          {/* The slot the sabotage callout left. A commitment belongs below the
              day's numbers, not among them: today's score is a fact, and this is
              a promise measured against it. */}
          <GoalCard
            userId={session?.user.id}
            today={
              profile.data?.timezone
                ? currentLocalDate(new Date(), profile.data.timezone)
                : undefined
            }
            onSetGoal={() => router.push('/goal/new')}
          />

          <FirstSyncCallout
            userId={session?.user.id}
            timeZone={profile.data?.timezone}
            points={points}
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
  // One column. `left`/`right` rather than a width, so the row below can put
  // the level pill against one edge and the streak pill against the other.
  // Nothing here carries a vertical offset any more: the container is placed
  // once, and flexbox spaces what is inside it. That is the property that
  // stops large Dynamic Type sizes from stacking pills on top of each other,
  // so do not reintroduce a `top` on any child.
  hud: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    gap: space.sm,
  },
  hudRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  railRow: { alignItems: 'flex-end' },

  squadPill: {
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
    // The row is the vertical fix's horizontal twin: two content-sized pills
    // in a `space-between` row overflow rather than wrap, and RN defaults
    // `flexShrink` to 0. The level pill is the one that grows (a long XP line),
    // so it is the one that yields. `levelBody`'s minWidth is its floor.
    flexShrink: 1,
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
  // minWidth, not width: the meter and its XP line still align at the default
  // text size, but scaled content grows the box instead of being clipped by
  // it. Same reason `LeaderboardRow`'s rank uses minWidth.
  levelBody: { minWidth: 96 },
  levelMeta: { ...font.body.label, color: ramp.neutral[700], letterSpacing: 0, marginTop: 4 },

  pill: {
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

  // — the cream shelf —
  shelf: { paddingHorizontal: space.lg, paddingTop: space.sm },
  todayHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  build: { ...font.body.strong, color: ramp.neutral[600], flexShrink: 1 },
  heroGroup: { marginTop: space.xs },
  // `baseline` so the unit sits on the numeral's line rather than centred
  // against a 64pt box; `wrap` so it moves to a line of its own instead of
  // clipping when the figure or the type size grows.
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: space.xs },
  // Caprasimo, not Figtree: the display face carries every number and every
  // name in this system, and the unit is part of the number's name. accent[600]
  // rather than [500] keeps it above 3:1 on the cream ground at this size.
  heroUnit: { ...font.display.minor, color: ramp.accent[600], flexShrink: 1 },
  heroMeta: { ...font.body.strong, color: ramp.neutral[700], marginTop: space.xs },
  standing: { ...font.body.body, fontSize: 14.5, color: ramp.neutral[800], marginTop: space.sm },
  detail: { ...font.body.body, fontSize: 14.5, color: ramp.sage[700], marginTop: space.sm },
  detailBlock: { marginTop: space.sm },
  helpLink: {
    ...font.body.strong,
    color: colors.accent,
    marginTop: space.md,
    alignSelf: 'flex-start',
  },
});

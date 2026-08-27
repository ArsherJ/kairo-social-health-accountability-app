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
import { useWorkoutSessions } from '@/features/train/queries.ts';
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
import { useDisclosure } from '@/features/character/useDisclosure.ts';
import { resolveStanding, type Standing } from '@/features/character/standing.ts';
import {
  resolveStatDetail,
  workoutDaySignal,
  type StatDetail,
} from '@/features/character/stat-detail.ts';
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
import {
  Avatar,
  Label,
  Meter,
  Numeral,
  STAT_NAMES,
  TAB_PILL_CLEARANCE,
  Text,
  dominanceName,
} from '@/ui/index.ts';

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

/** The human-readable line under each bar, once the rail is expanded. */
const STAT_LABELS: Record<CoreStat, string> = {
  AGI: 'Steps and distance',
  STR: 'Active calories',
  MND: 'Sleep duration',
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

/**
 * Small counts, spelled. "Two more active days" is a sentence; "2 more active
 * days" is a readout, and this line sits directly under a card whose whole job
 * is a figure — the numeral would compete with the one number that matters.
 *
 * Only ever called with 1..DISCLOSURE_THRESHOLD_DAYS, so the fallback is for a
 * raised threshold rather than for real input.
 */
const COUNT_WORDS = ['zero', 'one', 'Two', 'Three', 'Four', 'Five', 'Six'] as const;

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
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
    case 'unquantified': {
      // Body (`STR`) is the only thing left to ask for and today carries a
      // workout, so the bands it will be judged against are lower than the
      // ones this screen can compute — by up to a quarter. Naming the lever
      // and no figure is the one honest sentence available: "150 more kcal"
      // would be the unshifted number, and arriving early reads as a broken
      // score. Same clause · clause shape as the lines around it.
      const name = STAT_NAMES[detail.stat];
      return detail.lane
        ? `Your lane · active calories lift your ${name} today.`
        : `Active calories lift your ${name} today.`;
    }
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

/**
 * Whether this launch has already offered the species picker.
 *
 * Module scope, so it resets on a cold start and nothing is persisted: a user
 * who backs out of the picker is asked again next launch, and never twice in
 * one session. That is the right trade for a choice every account made at
 * onboarding after 2026-08-18 — the only people who ever see this are the
 * cohort that predates the column, and once they choose, `species` is no
 * longer null and the condition below can never fire again. An MMKV
 * once-ever marker would make "not now" permanent and leave those accounts
 * rendering the fallback figure forever with no prompt to fix it.
 */
let speciesPrompted = false;

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
  // Mounted here for the guidance line, not for the TRAIN card: whether today
  // carries a workout decides whether Body's gap can be quoted at all
  // (`resolveStatDetail`), and that is true at every disclosure stage, while
  // `TrainEntry` below only renders at `full`. TanStack shares the cache on
  // `sessionsKey`, so the two mounts are one request.
  //
  // Existence only. Nothing here reads a column `useWorkoutSessions` does not
  // already select — §5's owner-only posture on `workout_sessions` is why the
  // fix is silence rather than a corrected number.
  const sessions = useWorkoutSessions(session?.user.id, profile.data?.timezone);

  // What this account is allowed to see yet (§5). Everything gated below stays
  // built and reachable — this decides whether it is on screen, nothing more.
  //
  // Not destructured to a bare `stage`: this screen already has one, and it is
  // `evolutionStageForLevel`'s. Two unrelated "stages" one line apart is the
  // kind of collision that gets resolved by whichever import was written last.
  const disclosure = useDisclosure(session?.user.id);

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
  // The user's own calendar date. One computation the cards below share —
  // `today` above is already taken, and it is the score row, not a date.
  const localToday = profile.data?.timezone
    ? currentLocalDate(new Date(), profile.data.timezone)
    : undefined;

  // Guarded on total > 0 so a day that synced as zeros — a rest day, a phone
  // left at home — does not count as having seen progress.
  useEffect(() => {
    if (!userId) return;
    if (!today || today.total <= 0) return;
    markFirstScoreSeen(userId);
  }, [userId, today]);

  // The one-time offer for accounts created before the species column existed.
  //
  // `profile.isSuccess` is the load-bearing half, and it is deviation #37's
  // fourth lesson in a new place: `profile.data?.species` reads `undefined`
  // while the query is in flight, which is indistinguishable from null here,
  // and pushing on that frame throws the picker at someone who already chose.
  // Require the loaded row, then read it.
  useEffect(() => {
    if (speciesPrompted) return;
    if (!profile.isSuccess || !profile.data) return;
    if (profile.data.species !== null) return;
    speciesPrompted = true;
    router.push('/species');
  }, [profile.isSuccess, profile.data, router]);

  const points: Record<CoreStat, number> = {
    AGI: today?.agi_points ?? 0,
    STR: today?.str_points ?? 0,
    MND: today?.mind_points ?? 0,
  };

  // Lifetime totals, which is what the coins and bars read. Undefined while the
  // profile loads — `ratingForStatPoints` floors at 1, so an unloaded rail says
  // the same thing a brand-new character's does rather than flashing a dash.
  //
  // Three rollups, matching CoreStat. MND read a hardcoded 0 between the
  // column landing and this wiring, which is the same figure a stat with no
  // lifetime points shows — so the rail could not distinguish "never slept"
  // from "never read", and the second failure looks exactly like the first.
  // `mnd_total`, not `mind_total`: the rollup is spelled for the stat, the
  // score column it sums is `mind_points`, and that split has cost a bug.
  const lifetime: Record<CoreStat, number> | undefined = profile.data && {
    AGI: profile.data.agi_total,
    STR: profile.data.str_total,
    MND: profile.data.mnd_total,
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
  const detail = resolveStatDetail({
    totals: buckets.data?.totals,
    // The screen already loads this for the TODAY panel's sleep row, so Mind
    // reports a real gap here rather than being skipped. Passing it is what
    // keeps a third of the stat model from silently vanishing out of the one
    // line that tells someone what to do next.
    sleepMinutes: vitals.data?.sleepMinutes,
    // Not the minutes — those need three trust columns this app deliberately
    // does not read — but whether there is a workout at all, which is enough
    // to know that Body's bands may have moved and that quoting them
    // would be a guess. In flight reads `'unknown'` and silences the same way.
    workoutDay: workoutDaySignal(sessions.data, localToday),
    lane,
  });

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
          level={level}
          stage={stage}
          dominance={dominance.data}
          species={profile.data?.species}
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

              {/* The streak is the only persistent pill. A squad's Battle
                  belongs on the squad tab, where the squad is — not squeezed
                  into a second pill up here.

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

            {/* Four ability ratings are four numbers with no scale beside
                them until there are days behind them, so the rail — and the
                per-stat block it expands — waits for `full` (§5). */}
            {disclosure.stage === 'full' && !score.isPending && (
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
            {/* `dominanceName` returns null for an unstarted character *and*
                for a query still in flight, which is the same guard the
                `!= null` check was making by hand — so the name is what the
                condition now reads. One table, not two: the old
                `DOMINANCE_LABELS` held its own copy of the three stat words,
                which is exactly the drift `STAT_NAMES` exists to stop. */}
            {dominanceName(dominance.data) != null && (
              <Text style={styles.build}>
                {dominanceName(dominance.data)} build · last {DOMINANCE_WINDOW_DAYS} days
              </Text>
            )}
          </View>

          {/* The day in the units it was lived in.

              This slot held `daily_scores.total` until 2026-08-15: a four-digit
              integer with no unit, no label and no target, in 64pt type. The
              engine still computes it — it ranks the board and feeds XP and
              the ability ratings — it is simply not something a first-time
              user can read.
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

              Strain and Sleep appear only with a wearable (§5) — and, since
              2026-08-17, only at the `full` disclosure stage. That is one
              condition on `hasWearable` below rather than a second wrapper:
              two gates in two places is how a surface ends up half-hidden. */}
          <TodayPanel
            totals={buckets.data?.totals}
            hourlyAvgHr={buckets.data?.hourlyAvgHr}
            restingHr={vitals.data?.restingHr}
            birthYear={profile.data?.birth_year}
            sleepMinutes={vitals.data?.sleepMinutes}
            hasWearable={
              disclosure.stage === 'full' && (profile.data?.has_wearable ?? false)
            }
            today={localToday}
          />

          {/* Deliberately outside the panel's own null guard: an empty TODAY
              panel is exactly when "waiting for your first sync" or "couldn't
              sync" is the most useful thing on the screen. */}
          <SyncStatus userId={session?.user.id} timeZone={profile.data?.timezone} />

          {/* Unreachable in `core` anyway — `expanded` is only ever set by
              StatRail, which is gated above — but stated rather than implied,
              so removing that gate later cannot silently bring this back. */}
          {disclosure.stage === 'full' && expanded && (
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

          {/* The Daily Walk and the Challenge door moved to the Today tab on
              2026-08-25 (deviation #50). This screen's subject is the
              character; everything below the hero was a different subject
              sharing a scroll, and that scroll had no room left. **The `full`
              wrapper moved with `TrainEntry`** — it is reproduced on the Today
              tab, not dropped, and the disclosure gate's subject list is
              unchanged by the move. */}

          {/* What the gate is building toward. An empty space where a card
              used to be reads as a missing feature, so `core` says what is
              coming — counted in "active days" rather than as a bare
              countdown, because that is the thing the gate actually counts.
              The card where you earn one is the Daily Walk, which now lives on
              the Today tab; the sentence stays true either way, because it
              names the day and not the card.

              No accessibilityLabel: it is already text, and a label would
              duplicate it. */}
          {/* `resolved` here and nowhere else on this screen. The gated cards
              above act on the stage alone, which is right — hiding early then
              revealing is a reveal. This line makes an affirmative claim with a
              number in it, so an unresolved count would print "Three more
              active days…" to an established user for a frame, or permanently
              if the count query errors while the profile query succeeded. */}
          {disclosure.resolved && disclosure.stage === 'core' && (
            <Text style={styles.disclosureNote}>
              {/* Names only what this gate still holds back. Goals were on this
                  list until 2026-08-25; a Battle replaced them and is ungated,
                  because it is the squad's shared thing and hiding it from one
                  new member would hide something the rest are already looking
                  at. A promise of a feature that has since become visible
                  reads as the app losing track of itself. */}
              {disclosure.daysToGo === 1
                ? 'One more active day and challenges and your full stat breakdown open up.'
                : `${countWord(disclosure.daysToGo)} more active days and challenges ` +
                  'and your full stat breakdown open up.'}
            </Text>
          )}

          {/* `/progress` is reached through the expanded stat block in `full`,
              which `core` does not have — leaving a first-time user with no
              explanation of anything on the screen they understand least. So
              the link renders here instead, at the one stage that needs it
              most. It is the same destination, not a second help surface. */}
          {disclosure.stage === 'core' && (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="How progress works"
              hitSlop={space.sm}
              onPress={() => router.push('/progress')}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={[styles.helpLink, styles.helpLinkCentred]}>
                How progress works
              </Text>
            </Pressable>
          )}

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
    color: colors.accentDeep,
    marginTop: space.md,
    alignSelf: 'flex-start',
  },
  // Centred in `core` because it is the last thing on a short page rather than
  // a footnote to an expanded block — a left-aligned link under nothing reads
  // as an orphan.
  helpLinkCentred: { alignSelf: 'center', textAlign: 'center' },
  // `prose` scale by default and no fixed height, so this may grow freely — it
  // sits in a ScrollView with nothing drawn around it.
  disclosureNote: {
    ...font.body.body,
    fontSize: 13,
    color: colors.muted,
    marginTop: space.md,
    textAlign: 'center',
    lineHeight: 19,
  },
});

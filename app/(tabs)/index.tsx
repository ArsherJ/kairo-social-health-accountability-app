import { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  type CoreStat,
  currentLocalDate,
  DAILY_STEP_BASELINE,
  type DayTotals,
  evolutionStageForLevel,
  levelForXp,
  MAX_DAILY_SCORE_PHONE_ONLY,
  questTier,
  restedShift,
  spreadShift,
  topBandFor,
} from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { Diorama } from '@/features/character/Diorama.tsx';
import { TodayDetailsSheet } from '@/features/character/TodayDetailsSheet.tsx';
import { TodayNextStep } from '@/features/character/TodayNextStep.tsx';
import { ceilingLine, restedLine, spreadLine } from '@/features/character/kairo-voice.ts';
import { useTodayBuckets, useTodayVitals } from '@/features/character/buckets.ts';
import {
  livingCharacterLabel,
  locationName,
  motionLocationForSteps,
  type ReactionKind,
  resolveLivingMirror,
} from '@/features/character/living-mirror.ts';
import { useLivingReaction } from '@/features/character/useLivingReaction.ts';
import { todayDetails } from '@/features/character/today-details.ts';
import { useDominantStat, useScoredDayCount, useTodayScore } from '@/features/character/queries.ts';
import { useDisclosure } from '@/features/character/useDisclosure.ts';
import { useSyncStatusStore } from '@/features/health/status-store.ts';
import { useProfile, useStreak } from '@/features/profile/queries.ts';
import { useStatRecords } from '@/features/profile/records.ts';
import { xpProgress } from '@/features/profile/xp-progress.ts';
import { nextStepSentence, selectNextStep } from '@/features/quests/next-step.ts';
import { todayQuests, useQuestCompletions } from '@/features/quests/queries.ts';
import { flockPaneHref } from '@/features/squad/flock-pane.ts';
import { useMySquad } from '@/features/squad/queries.ts';
import { claimDaily, type DailyMarker } from '@/features/telemetry/daily-marker.ts';
import { track } from '@/features/telemetry/events.ts';
import { hasReached, markReached, markUnreached } from '@/features/telemetry/milestone-store.ts';
import { type DailyWalkState, dailyWalkState, walkNote } from '@/features/train/daily-walk.ts';
import { useWalkHistory } from '@/features/train/queries.ts';
import { useTodayStrengthSummary } from '@/features/train/useTodayStrengthSummary.ts';
import { TODAY_SCREEN_COPY } from '@/features/character/today-screen-copy.ts';
import { TodayChips } from '@/features/character/TodayHud.tsx';
import { QuestRows, TodayTiles } from '@/features/character/TodayBoard.tsx';
import {
  bodyReading,
  dateHeading,
  mindReading,
  motionReading,
} from '@/features/character/today-board.ts';
import { WelcomePopups } from '@/features/onboarding/WelcomePopups.tsx';
import { claimModal, releaseModal, useModalOwner } from '@/ui/modal-owner.ts';
import { STAT_NAMES } from '@/ui/StatIcon.tsx';
import { Button, Panel, Screen, Text, useStyles, useTheme } from '@/ui/index.ts';
import { font, space, type Theme } from '@/theme.ts';

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
 * How tall the scene card is.
 *
 * Fixed rather than a fraction of the screen, because the figure inside it is
 * sized from this (`Diorama` draws the character at `height * 0.6`) and a bird
 * that changed size between a 320pt and a 440pt phone would read as a different
 * bird. Half the old hero (deviation #72): the scene is one tile of the
 * dashboard now, and the day's figures sit beside it rather than over it.
 */
const SCENE_HEIGHT = 236;

/**
 * The neutral day, for the frame before buckets land.
 *
 * Defined once and **not rendered as a confirmed reading**: the scene may stand
 * at Branch on it, because Branch is where KAIRO lives rather than a claim about
 * the day, but the details trigger stays hidden until real or cached totals
 * exist. Unknown is never presented as zero.
 */
const EMPTY_DAY_TOTALS: DayTotals = {
  steps: 0,
  distanceM: 0,
  activeKcal: 0,
  activeMinutes: 0,
  activeHours: 0,
};

/**
 * The cold-start walk, so the note has its "the baseline is fixed" form rather
 * than naming a run that has not started.
 */
const EMPTY_WALK_STATE: DailyWalkState = {
  todaySteps: 0,
  baseline: DAILY_STEP_BASELINE,
  fraction: 0,
  remaining: DAILY_STEP_BASELINE,
  met: false,
  streak: 0,
};

/**
 * Today — the dashboard (deviation #72, over #59's Living Mirror).
 *
 * The screen reads top to bottom as a day: the date and the character's name
 * with the level and streak chips beside them; the scene, at card size, with
 * KAIRO standing where today put it; the sentence the bird says and the door
 * to the details; then the readings — Motion as the hero tile with the walk's
 * meter under it, Body and Mind two across — and the three quests as rows.
 *
 * **What #59 argued is still true and still decides the rules here.** The
 * quest contract is untouched: `todayQuests()` resolves exactly three entries,
 * `finalize-days` grades the same three, and `selectNextStep()` only ranks
 * them — the dashboard shows all three and marks the ranked one. Every figure
 * is a raw unit and never a score total (deviation #34); the Motion tile
 * reaches the ridge through `dailyWalkState` and prints no literal; an unknown
 * night reads "No reading yet" and never zero. The reaction sentence, the
 * ceiling line and the crest sky are all as they were. The Sky still owns the
 * race and You still owns Mastery and records — no race copy, no Mastery
 * coins, no leaderboard read.
 *
 * **What changed is the shape.** #59 put one figure on the screen and every
 * other reading one tap away; a dashboard puts the day's five readings on the
 * page and keeps the sheet for the sentences that explain them (the spread
 * and rested notes, the dropped-source note, the sync line). The composition
 * is pinned by `today-composition.test.ts` and the tile sentences by
 * `today-board.test.ts`.
 */
export default function Today() {
  const router = useRouter();
  // The sky bleeds under the status bar, so the HUD takes the inset itself —
  // `Screen bleed` deliberately hands that back rather than guessing.
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const timeZone = profile.data?.timezone;

  const score = useTodayScore(userId, timeZone);
  const buckets = useTodayBuckets(userId, timeZone);
  const vitals = useTodayVitals(userId, timeZone);
  // Last night as the trust gate scored it, or null. Null, never 0, and never
  // the raw column: an unknown night must read "No reading yet" rather than
  // accuse somebody of not sleeping — and the same value scores Mind, gates
  // the sleep quest and buys Body's rested shift, so all four readings of one
  // night come from one expression.
  const sleepMinutesToday = vitals.data?.sleepMinutes ?? null;
  // Kept for the presence ring, which is `auraStrength()`'s and not Body's: the
  // All-Rounder earns a ring at any rating, and dropping this query would
  // delete that from the only screen in the app that draws one.
  const dominance = useDominantStat(userId, timeZone);
  const streak = useStreak(userId);
  // For `WelcomePopups`' invite card only — the race lives on the Sky tab.
  const squad = useMySquad(userId);
  const disclosure = useDisclosure(userId);
  const scoredDays = useScoredDayCount(userId);
  const walkHistory = useWalkHistory(userId, timeZone);
  const records = useStatRecords(userId);

  const localToday = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;
  const completions = useQuestCompletions(userId, localToday);
  const strength = useTodayStrengthSummary(userId, localToday);

  const totalXp = profile.data?.total_xp ?? 0;
  const level = profile.data?.level ?? levelForXp(totalXp);
  const stage = evolutionStageForLevel(level);
  const xp = xpProgress(totalXp);
  const totals = buckets.data?.totals;
  const steps = totals?.steps ?? 0;
  const characterName = profile.data?.character_name ?? 'Your Kairo';
  // The squad's own code, and the only thing the welcome run's flock card needs
  // to know about membership — see the card's own note on why a join door is
  // withheld from somebody who already has a squad.
  const inviteCode = squad.data?.invite_code ?? null;
  const today = score.data;

  // Lifetime rollups. They drive two things on the figure and neither is a
  // readout: the presence ring (`aura.ts`) and, since issue #33, the crest's
  // hue. The rail that reads the same three numbers lives on You and is gated;
  // these are not, because they are shape rather than a figure — and the crest
  // reads *these* rather than `dominance` precisely so a flock row, which can
  // only see the lifetime rollups, draws the same bird.
  const lifetimePoints: Record<CoreStat, number> | undefined = profile.data && {
    AGI: profile.data.agi_total,
    STR: profile.data.str_total,
    MND: profile.data.mnd_total,
  };

  // Guarded on total > 0 so a day that synced as zeros — a rest day, a phone
  // left at home — does not count as having seen progress.
  useEffect(() => {
    if (!userId) return;
    if (!today || today.total <= 0) return;
    markFirstScoreSeen(userId);
  }, [userId, today]);

  const quests = todayQuests({
    userId,
    localDate: localToday,
    // `?? 0` while the count is in flight puts a first-frame account on the
    // starter tier, which is the safe direction: showing an easy quest then a
    // harder one is a correction, where the reverse is a bar disappearing out
    // from under someone mid-walk.
    scoredDays: scoredDays.data ?? 0,
    tierOverride: profile.data?.quest_tier_override ?? null,
    // The stored answer, not a derived one — `finalize-days` grades against
    // this same column. `?? false` while the profile is in flight matches the
    // column's default and withholds a sleep quest rather than showing one the
    // grader might not agree with.
    hasSleep: profile.data?.has_sleep_source ?? false,
    day: totals && {
      steps: totals.steps,
      activeKcal: totals.activeKcal,
      activeHours: totals.activeHours,
      distanceM: totals.distanceM,
      sleepMinutes: sleepMinutesToday,
    },
    completedIds: completions.data ?? [],
  });

  // The nearest incomplete quest across Motion and Body together — one rule,
  // deliberately not Motion-first with a fallback. The quest set is unchanged.
  const nextStep = selectNextStep({
    quests,
    strengthChallengeOptedIn: profile.data?.trains_strength ?? false,
  });

  const walk = localToday && walkHistory.data
    ? dailyWalkState({ todaySteps: totals?.steps, today: localToday, days: walkHistory.data })
    : null;

  // Same-day records only. A historical best is on You with its date; a
  // reaction is about something that just happened.
  const recordStatsToday = (records.data ?? [])
    .filter((record) => record.localDate === localToday)
    .map((record) => record.stat);

  const trackReactionImpression = useCallback((kind: ReactionKind) => {
    // `kind` alone. Never an occurrence id, never a health figure, and never
    // the Motion location — a five-band location is a coarse step count.
    void track(userId, 'character_reaction_seen', { kind });
  }, [userId]);

  const reaction = useLivingReaction({
    userId,
    ready: Boolean(
      localToday && profile.data && buckets.data && vitals.isFetched &&
        walkHistory.isFetched && records.isFetched && strength.isFetched,
    ),
    signals: {
      localDate: localToday ?? '',
      characterName,
      currentLevel: level,
      motionLocation: motionLocationForSteps(steps),
      dailyWalkMet: walk?.met ?? false,
      recordStatsToday,
      verifiedWorkoutOccurrence: strength.data?.latestOccurrence ?? null,
      statNames: STAT_NAMES,
    },
    onImpression: trackReactionImpression,
  });

  const mirror = resolveLivingMirror({
    steps,
    verifiedStrengthMinutes: strength.data?.verifiedMinutes ?? 0,
    hasSleepSource: profile.data?.has_sleep_source ?? false,
    sleepMinutes: sleepMinutesToday,
    lifetimeBodyPoints: profile.data?.str_total ?? 0,
    nextStep,
    reaction,
  });

  // The day has earned everything scoring can see. Read from the stored total
  // rather than recomputed — the ceiling is the same figure with or without a
  // wearable (normalization is what makes that true), so one comparison covers
  // both cohorts. **Read, never rendered**: deviation #34 bans printing a score
  // total, not consulting one.
  const ceilingReached = (today?.total ?? 0) >= MAX_DAILY_SCORE_PHONE_ONLY;

  const droppedStepSources = useSyncStatusStore((state) => state.droppedStepSources);

  const sections = todayDetails({
    totals: totals ?? EMPTY_DAY_TOTALS,
    verifiedStrengthMinutes: strength.data?.verifiedMinutes ?? 0,
    hasSleepSource: profile.data?.has_sleep_source ?? false,
    sleepMinutes: sleepMinutesToday,
    dailyWalkRun: walk?.streak ?? 0,
    dailyWalkNote: walkNote(walk ?? EMPTY_WALK_STATE),
    // Why today's Motion is easier than the published number, when it is. Read
    // through the same `spreadShift` the scorer used rather than restated —
    // a sentence quoting a ladder the engine stopped using is worse than no
    // sentence. Both bands come from `topBandFor`, which is the one way to
    // reach a threshold out of the engine, so the two notes below cannot arrive
    // at a band by two different routes. `topBandFor('AGI')` *is*
    // `DAILY_STEP_BASELINE` by derivation, which is why no literal appears.
    motionNote: totals
      ? spreadLine({
        activeHours: totals.activeHours,
        goldSteps: topBandFor('AGI', spreadShift(totals.activeHours)),
        baseSteps: topBandFor('AGI'),
      })
      : null,
    // And why today's Body is, when last night bought it. The same shape as the
    // line above and read through the same `restedShift` the scorer used, from
    // the same `sleepMinutes` — which has already passed the trust gate, so a
    // hand-typed night neither scores Mind nor earns this sentence. Null for
    // every phone-only account, which is most of them (deviation #68).
    bodyNote: restedLine({
      sleepMinutes: sleepMinutesToday,
      goldKcal: topBandFor('STR', restedShift(sleepMinutesToday)),
      baseKcal: topBandFor('STR'),
    }),
    quests,
    selectedQuestIndex: nextStep.kind === 'quest' ? nextStep.index : null,
    // From the sync store rather than a query: nothing about which apps were
    // dropped is stored server-side, and nothing should be — it is an
    // observation about this phone, for this player, and no projection carries
    // it.
    droppedStepSources,
    // The one line on this sheet a squadmate can also see the effect of, and
    // the reason it is here: the accused reads it on their own day before the
    // chip appears on anybody's leaderboard row.
    flagged: today?.flagged ?? false,
  });

  // Once per the user's own local day, not per render: fired on render this
  // would measure scrolling. In an effect because `claimDaily` writes to MMKV
  // and `track` writes a row, and a render that does either is a render with a
  // side effect — React may call it twice.
  const metSlots = quests.map((q) => q.state.met).join(',');
  useEffect(() => {
    if (!userId || !localToday) return;
    const tier = questTier({
      // The same two arguments `todayQuests` passes, from the same two
      // variables — so the tier reported here cannot disagree with the tier the
      // three quests on screen were picked for.
      trailingScoredDays: scoredDays.data ?? 0,
      override: profile.data?.quest_tier_override ?? null,
    });
    quests.forEach((entry, index) => {
      if (!entry.state.met) return;
      const marker = `quest_cleared.${index as 0 | 1 | 2}` as DailyMarker;
      if (claimDaily(userId, marker, localToday)) void track(userId, 'quest_cleared', { tier });
    });
    // `metSlots` is the dependency rather than `quests`, which is a fresh array
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, localToday, metSlots]);

  // Category only, once per the user's own local day. `next_step_shown` says
  // which kind of step the one visible prompt named; no figure, no quest id.
  const nextStepCategory = nextStep.kind === 'quest' ? nextStep.category : 'none';
  useEffect(() => {
    if (!userId || !localToday || quests.length === 0) return;
    if (claimDaily(userId, 'today_seen', localToday)) void track(userId, 'today_seen');
    if (claimDaily(userId, 'next_step_shown', localToday)) {
      void track(userId, 'next_step_shown', { category: nextStepCategory });
    }
  }, [userId, localToday, quests.length, nextStepCategory]);

  const modalOwner = useModalOwner((state) => state.owner);
  const detailsTriggerRef = useRef<View>(null);

  const openDetails = () => {
    // A losing claim is silent by design: another native modal is up, and a
    // sheet that refused to open with an explanation would be explaining
    // UIKit's presentation rules to somebody looking at their step count.
    if (!claimModal('today-details')) return;
    void track(userId, 'today_details_opened');
  };
  const closeDetails = () => {
    releaseModal('today-details');
  };
  // VoiceOver focus lands nowhere after a native dismissal, so it is put back
  // on the control that opened the sheet.
  const restoreDetailsFocus = () => {
    const node = findNodeHandle(detailsTriggerRef.current);
    if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
  };

  // The tiles' sentences, from a module root Vitest can hold. The Body and
  // Mind quests are found by metric off the same three entries the rows draw,
  // so a tile's target and its row's bar cannot disagree.
  const bodyQuest = quests.find((q) => q.quest.metric === 'active_kcal') ?? null;
  const mindQuest = quests.find((q) => q.quest.metric === 'sleep_minutes') ?? null;
  const motion = motionReading({
    steps,
    locationName: locationName(mirror.motion.location),
    walk: walk && { remaining: walk.remaining, fraction: walk.fraction, met: walk.met },
  });
  const body = bodyReading({
    activeKcal: totals?.activeKcal ?? 0,
    quest: bodyQuest && { def: bodyQuest.quest, state: bodyQuest.state },
    verifiedStrengthMinutes: strength.data?.verifiedMinutes ?? 0,
  });
  const mind = mindReading({
    hasSleepSource: profile.data?.has_sleep_source ?? false,
    sleepMinutes: sleepMinutesToday,
    quest: mindQuest && { def: mindQuest.quest, state: mindQuest.state },
  });

  const styles = useStyles(makeStyles);
  const { colors } = useTheme();

  return (
    <>
      <Screen bleed>
        <View style={[styles.page, { paddingTop: insets.top + space.md }]}>
          {
            /* The date in the player's own zone (§2), never the device's, and
              the character's name under it: the day belongs to somebody. */
          }
          <View style={styles.header}>
            <View style={styles.headerWords}>
              <Text scale='chrome' numberOfLines={1} style={styles.date}>
                {localToday ? dateHeading(localToday) : 'Today'}
              </Text>
              <Text scale='chrome' numberOfLines={1} style={styles.name}>
                {characterName}
              </Text>
            </View>
            <TodayChips level={level} xp={xp} streak={streak.data?.current_streak ?? 0} />
          </View>

          {
            /* The bird, in its sky, standing where today put it — one card of
              the dashboard rather than the page's header. `Diorama` owns the
              scenery, the figure, the ground shadow and the sky's fade; the
              location word is the Motion tile's eyebrow now, so nothing floats
              over the picture. */
          }
          <View style={styles.scene}>
            <Diorama
              height={SCENE_HEIGHT}
              level={level}
              stage={stage}
              location={mirror.motion.location}
              figure={mirror.figure}
              body={mirror.body}
              dominance={dominance.data}
              lifetimePoints={lifetimePoints}
              figureLabel={livingCharacterLabel({
                characterName,
                level,
                location: mirror.motion.location,
                mind: mirror.mind,
              })}
              crest={ceilingReached}
            />
          </View>

          {
            /* One sentence, and the door to the sentences that explain the day.

              `ceilingLine` outranks the next step deliberately: the crest
              changes the sky, and an unexplained change to the screen someone
              opens first is indistinguishable from a bug, so the crest is
              always paired with the line that explains it. The reaction
              sentence preempts both for `REACTION_HOLD_MS` and then returns. */
          }
          <TodayNextStep
            ref={detailsTriggerRef}
            sentence={reaction?.sentence ??
              (ceilingReached
                ? ceilingLine(characterName)
                : nextStepSentence(nextStep, characterName))}
            onDetails={openDetails}
            // Hidden, not disabled: a dead control with nothing explaining it
            // is the same false accusation `QUIET_GRACE_MS` exists to prevent.
            showDetails={Boolean(buckets.data)}
          />

          {
            /* The day, in real units. Motion is the hero because steps have
              been the one big figure since deviation #30 and the walk's meter
              under it is the ridge — one number, two readings (#56). */
          }
          {buckets.data
            ? (
              <>
                <TodayTiles motion={motion} body={body} mind={mind} />

                <QuestRows
                  quests={quests}
                  selected={nextStep.kind === 'quest' ? nextStep.index : null}
                />
              </>
            )
            : buckets.isError
            ? (
              <Panel>
                <Text accessibilityRole='alert' style={{ ...font.body.body, color: colors.damage }}>
                  {TODAY_SCREEN_COPY.error}
                </Text>
                <Button
                  label={TODAY_SCREEN_COPY.retry}
                  variant='ghost'
                  onPress={() => void buckets.refetch()}
                />
              </Panel>
            )
            : (
              <ActivityIndicator
                accessibilityLabel={TODAY_SCREEN_COPY.waiting}
                color={colors.accentDeep}
              />
            )}
        </View>

        {
          /* The four cards that land after onboarding, the last of them the
            flock ask. Mounted here because this is where onboarding drops you.
            It leases the same modal host details and the permission asks do,
            so the three can never compete. Both doors land on the Flock tab
            rather than acting from here. */
        }
        <WelcomePopups
          userId={userId}
          characterName={characterName}
          inviteCode={inviteCode}
          onJoin={() => router.push(flockPaneHref('join'))}
          // One predicate, read from the same value the card branches on: an
          // invite code *is* the squad.
          onInvite={() => router.push(inviteCode ? '/flock' : flockPaneHref('create'))}
        />
      </Screen>

      {
        /* A sibling of `Screen`, not a child: a native `<Modal>` presents on the
          root view controller wherever it is mounted, and nesting it inside the
          scrolling page only makes that less obvious. */
      }
      <TodayDetailsSheet
        visible={modalOwner === 'today-details'}
        sections={sections}
        userId={userId}
        timeZone={timeZone}
        // The one gated surface left on Today. `stage`, not `resolved && stage`
        // — this hides a link rather than navigating.
        showChallenges={disclosure.stage === 'full'}
        onClose={closeDetails}
        onDismiss={restoreDetailsFocus}
        onChallenges={() => {
          closeDetails();
          router.push('/train');
        }}
        onProgress={() => {
          closeDetails();
          router.push('/progress');
        }}
      />
    </>
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    /** The page pads itself: `Screen bleed` hands the insets back. */
    page: { paddingHorizontal: space.lg },
    header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    // `flex: 1` + `minWidth: 0` so a long name truncates rather than pushing
    // the chips off the row at large Dynamic Type.
    headerWords: { flex: 1, minWidth: 0 },
    date: { ...font.body.label, color: colors.muted, textTransform: 'uppercase' },
    name: { ...font.display.major, fontSize: 26, color: colors.text, marginTop: 2 },
    scene: { marginTop: space.md },
  });

import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  DAILY_STEP_BASELINE,
  MAX_DAILY_SCORE_PHONE_ONLY,
  currentLocalDate,
  evolutionStageForLevel,
  levelForXp,
  questTier,
  shiftedThreshold,
  spreadShift,
  type CoreStat,
  type DayTotals,
} from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { Diorama } from '@/features/character/Diorama.tsx';
import { TodayDetailsSheet } from '@/features/character/TodayDetailsSheet.tsx';
import { TodayNextStep } from '@/features/character/TodayNextStep.tsx';
import { ceilingLine, spreadLine } from '@/features/character/kairo-voice.ts';
import { useTodayBuckets, useTodayVitals } from '@/features/character/buckets.ts';
import {
  livingCharacterLabel,
  locationName,
  motionLocationForSteps,
  resolveLivingMirror,
  type ReactionKind,
} from '@/features/character/living-mirror.ts';
import { useLivingReaction } from '@/features/character/useLivingReaction.ts';
import { todayDetails } from '@/features/character/today-details.ts';
import {
  useDominantStat,
  useScoredDayCount,
  useTodayScore,
} from '@/features/character/queries.ts';
import { useDisclosure } from '@/features/character/useDisclosure.ts';
import { useProfile, useStreak } from '@/features/profile/queries.ts';
import { useStatRecords } from '@/features/profile/records.ts';
import { xpProgress } from '@/features/profile/xp-progress.ts';
import { nextStepSentence, selectNextStep } from '@/features/quests/next-step.ts';
import { todayQuests, useQuestCompletions } from '@/features/quests/queries.ts';
import { flockPaneHref } from '@/features/squad/flock-pane.ts';
import { useMySquad } from '@/features/squad/queries.ts';
import { claimDaily, type DailyMarker } from '@/features/telemetry/daily-marker.ts';
import { track } from '@/features/telemetry/events.ts';
import {
  hasReached,
  markReached,
  markUnreached,
} from '@/features/telemetry/milestone-store.ts';
import { dailyWalkState, walkNote, type DailyWalkState } from '@/features/train/daily-walk.ts';
import { useWalkHistory } from '@/features/train/queries.ts';
import { useTodayStrengthSummary } from '@/features/train/useTodayStrengthSummary.ts';
import { TodayChips, TodayCount } from '@/features/character/TodayHud.tsx';
import { WelcomePopups } from '@/features/onboarding/WelcomePopups.tsx';
import { claimModal, releaseModal, useModalOwner } from '@/ui/modal-owner.ts';
import { STAT_NAMES } from '@/ui/StatIcon.tsx';
import { Screen, Text } from '@/ui/index.ts';
import { colors, font, space } from '@/theme.ts';

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
 * How tall the sky is.
 *
 * Fixed rather than a fraction of the screen, because the figure inside it is
 * sized from this (`Diorama` draws the character at `height * 0.6`) and a bird
 * that changed size between a 320pt and a 440pt phone would read as a different
 * bird.
 */
const HERO_HEIGHT = 452;

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
 * Today — the Living Mirror (deviation #59).
 *
 * KAIRO **is** the interface. Motion moves the scene's location, lifetime Body
 * weights and tints the ground shadow, and a verified night selects the daily
 * Mind image; a level-up, a personal best, the Daily Walk clear, a strength
 * session or a new location surfaces as one bounded reaction. The always-visible
 * order is the scene, compact Level and personal Streak, the location word and
 * one step figure, one quest-backed next step, then **See today's details**.
 *
 * **The dashboard is gone and this screen is thin.** Three quest rings, a race
 * line, Mastery coins, the sleep and lane tiles, the Daily Walk card, the
 * Challenge card and the first-sync callout were seven surfaces competing to be
 * read. The complete raw-unit day, every quest state, the Daily Walk run and
 * the gated Challenge link all live one tap away in `TodayDetailsSheet`.
 *
 * **Nothing about the engine moved.** `todayQuests()` still resolves exactly
 * three entries and `finalize-days` grades the same three; `selectNextStep()`
 * only ranks them. Scoring, XP, the Daily Walk rules, Challenges and the race
 * are untouched, and real-world activity still counts with the app closed.
 *
 * **The Sky owns the race; You owns Mastery and records.** Today's leaderboard,
 * recent-day and race-rank reads are gone with the copy that used them, so this
 * screen makes two fewer requests than it did — and adds two owner-only ones
 * that nothing else needed: today's verified strength evidence and personal
 * records, neither of which reaches a projection or a telemetry payload.
 *
 * **The disclosure gate did not move** (deviation #37). Same constant, same
 * `total > 0` filter, same rule — what changed is the list of surfaces it
 * covers on Today, which is now one: the Challenge link inside details.
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

  // Lifetime rollups, for the presence ring. The rail that reads the same three
  // numbers lives on You; the ring is the figure's own business and is not
  // gated, because it is shape rather than a readout.
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
      // Null, never 0, and never the raw column: an unknown night must read
      // "No reading yet" rather than accuse somebody of not sleeping.
      sleepMinutes: vitals.data?.sleepMinutes ?? null,
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
      walkHistory.isFetched && records.isFetched && strength.isFetched
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
    hasSleepSource: profile.data?.has_sleep_source ?? false,
    sleepMinutes: vitals.data?.sleepMinutes ?? null,
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

  const sections = todayDetails({
    totals: totals ?? EMPTY_DAY_TOTALS,
    verifiedStrengthMinutes: strength.data?.verifiedMinutes ?? 0,
    hasSleepSource: profile.data?.has_sleep_source ?? false,
    sleepMinutes: vitals.data?.sleepMinutes ?? null,
    dailyWalkRun: walk?.streak ?? 0,
    dailyWalkNote: walkNote(walk ?? EMPTY_WALK_STATE),
    // Why today's Motion is easier than the published number, when it is. Read
    // through the same `spreadShift` the scorer used rather than restated —
    // a sentence quoting a ladder the engine stopped using is worse than no
    // sentence. `DAILY_STEP_BASELINE` *is* Motion's gold band by derivation,
    // which is why no literal appears here.
    motionNote: totals
      ? spreadLine({
          activeHours: totals.activeHours,
          goldSteps: shiftedThreshold(DAILY_STEP_BASELINE, spreadShift(totals.activeHours)),
          baseSteps: DAILY_STEP_BASELINE,
        })
      : null,
    quests,
    selectedQuestIndex: nextStep.kind === 'quest' ? nextStep.index : null,
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

  return (
    <>
      <Screen bleed>
        {/* The bird, in its sky, standing where today put it.

            `Diorama` owns the scenery, the figure, the ground shadow and the
            sky's fade; this screen supplies the HUD that floats over it. The
            HUD is a **flowing column** spaced by flex — the 2026-08-14 rule,
            and this screen is where it was learned: the pills were pinned at
            fixed offsets against heights nothing enforced, and at large Dynamic
            Type they grew past each other. No child here carries a `top`. */}
        <Diorama
          height={HERO_HEIGHT}
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
        >
          <View style={[styles.hud, { paddingTop: insets.top + space.sm }]}>
            <TodayChips level={level} xp={xp} streak={streak.data?.current_streak ?? 0} />

            <View style={styles.hudGap} />

            {/* Always rendered, Branch included: a label that appears at 2,500
                steps and not before reads as a rendering fault, and Branch is
                where KAIRO lives rather than a failure state. */}
            <Text scale="fixed" style={styles.location}>
              {locationName(mirror.motion.location)}
            </Text>

            {/* The day, in real units. One number per screen — never a score
                total (deviation #34). */}
            <TodayCount steps={steps} />
          </View>
        </Diorama>

        <View style={styles.page}>
          {/* One sentence, and the door to everything else.

              `ceilingLine` outranks the next step deliberately, and this is the
              one place the order matters. The crest changes the sky, and an
              unexplained change to the screen someone opens first is
              indistinguishable from a bug — so the crest is always paired with
              the line that explains it. A quest can still be open at the
              ceiling (`strong-steps-15000` against Motion's Gold band); it
              survives under More for today, which is where everything else on
              demand lives. The reaction sentence preempts both for
              `REACTION_HOLD_MS` and then returns, which is bounded and
              self-correcting. */}
          <TodayNextStep
            ref={detailsTriggerRef}
            sentence={
              reaction?.sentence ??
              (ceilingReached ? ceilingLine(characterName) : nextStepSentence(nextStep, characterName))
            }
            onDetails={openDetails}
            // Hidden, not disabled: a dead control with nothing explaining it
            // is the same false accusation `QUIET_GRACE_MS` exists to prevent,
            // and everything above it already renders from cached or neutral
            // state, so nothing is left behind.
            showDetails={Boolean(buckets.data)}
          />
        </View>

        {/* The four cards that land after onboarding, the last of them the
            flock ask. Mounted here because this is where onboarding drops you
            and because the dim is over *this* screen in the design. It leases
            the same modal host details and the permission asks do, so the
            three can never compete — which is also why the flock ask is a card
            in this run rather than a first-run sheet of its own.

            Both doors land on the Flock tab rather than acting from here: one
            screen owns joining, including the already-in-a-squad case, and one
            owns the share sheet. A player with no squad cannot invite anybody
            to nothing, so `invited` opens the create form for them. */}
        <WelcomePopups
          userId={userId}
          characterName={characterName}
          inviteCode={inviteCode}
          onJoin={() => router.push(flockPaneHref('join'))}
          // One predicate, read from the same value the card branches on: an
          // invite code *is* the squad, so `squad.data` here and
          // `inviteCode !== null` there could only agree by coincidence.
          onInvite={() => router.push(inviteCode ? '/flock' : flockPaneHref('create'))}
        />
      </Screen>

      {/* A sibling of `Screen`, not a child: a native `<Modal>` presents on the
          root view controller wherever it is mounted, and nesting it inside the
          scrolling page only makes that less obvious. */}
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

const styles = StyleSheet.create({
  /**
   * The HUD column over the sky. `flex: 1` so it fills the diorama, and spaced
   * by a flexible gap rather than by offsets — the 2026-08-14 rule this screen
   * is the original home of.
   */
  hud: { flex: 1, paddingBottom: 22 },
  hudGap: { flex: 1 },

  /**
   * Where KAIRO is standing, in a word.
   *
   * `scale="fixed"` because it sits in drawn geometry over a picture, and it is
   * the one place the Motion band is said in text — which is what lets
   * `MotionScenery` be entirely decorative and hidden from VoiceOver.
   */
  location: {
    ...font.display.label,
    fontSize: 13,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.subtle,
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },

  /** Everything below the sky, which is where the page's own padding lives. */
  page: { paddingHorizontal: space.lg },
});

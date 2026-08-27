import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  currentLocalDate,
  evolutionStageForLevel,
  ghostRivals,
  levelForXp,
  questTier,
  rankRacers,
  type CoreStat,
  type RacerInput,
} from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { Diorama } from '@/features/character/Diorama.tsx';
import { FirstSyncCallout } from '@/features/character/FirstSyncCallout.tsx';
import { SyncStatus } from '@/features/character/SyncStatus.tsx';
import { heroSentence, laneLine, sleepLine } from '@/features/character/kairo-voice.ts';
import { laneStat } from '@/features/character/lane.ts';
import { useTodayBuckets, useTodayVitals } from '@/features/character/buckets.ts';
import {
  useDominantStat,
  useScoredDayCount,
  useTodayScore,
} from '@/features/character/queries.ts';
import { useDisclosure } from '@/features/character/useDisclosure.ts';
import { useProfile, useStreak } from '@/features/profile/queries.ts';
import { xpProgress } from '@/features/profile/xp-progress.ts';
import { QuestList } from '@/features/quests/QuestList.tsx';
import { todayQuests, useQuestCompletions } from '@/features/quests/queries.ts';
import { ghostDayLabel } from '@/features/squad/ghost-day-label.ts';
import { useMySquad, useOwnRecentDays, useSquadLeaderboard } from '@/features/squad/queries.ts';
import { claimDaily, type DailyMarker } from '@/features/telemetry/daily-marker.ts';
import { track } from '@/features/telemetry/events.ts';
import {
  hasReached,
  markReached,
  markUnreached,
} from '@/features/telemetry/milestone-store.ts';
import { DailyWalkCard } from '@/features/train/DailyWalkCard.tsx';
import { TrainEntry } from '@/features/train/TrainEntry.tsx';
import { Meter, Numeral, Panel, Screen, Text } from '@/ui/index.ts';
import { colors, font, radius, ramp, space } from '@/theme.ts';

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
 * Small counts, spelled. "Two more active days" is a sentence; "2 more active
 * days" is a readout, and this line sits on a screen whose whole job is one
 * figure — a second numeral would compete with it.
 *
 * Only ever called with 1..DISCLOSURE_THRESHOLD_DAYS, so the fallback is for a
 * raised threshold rather than for real input.
 */
const COUNT_WORDS = ['zero', 'one', 'Two', 'Three', 'Four', 'Five', 'Six'] as const;

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/**
 * Today — the character and the day, on one screen (`Canvas.dc.html` 2b).
 *
 * The character tab and the Today tab merged here on 2026-08-27. They were
 * split by deviation #50 because the character screen's hero had a different
 * subject from everything below it; the redesign resolves that the other way,
 * by making the day *about* the character rather than a list beside it. The
 * hero is the bird, the one big number is the day in real units, and the rest
 * is the bird saying how its day went.
 *
 * **Every query here was already mounted by one of the two screens this
 * replaces, on the same key.** The merge adds no request and cannot disagree
 * with the Sky or Flock tab in one frame.
 *
 * **The race is a sentence, not a card.** The card is gone: the race has its
 * own tab now, and the hero sentence names the gap to the bird ahead, which is
 * the only part of it that belongs on a screen about your own day. The
 * `race_seen` marker moved to the Sky tab with the picture — it measures
 * looking at the race, and this screen no longer shows one.
 *
 * **The disclosure gate is unchanged** (deviation #37). Same constant, same
 * `total > 0` filter, same rule. The sleep and lane cards are the Strain/Sleep
 * rows in a new dress and keep their `full` gate; `TrainEntry` keeps its
 * wrapper; quests, the hero and the Daily Walk are ungated. A `core` account
 * meets the bird, its day, three quests and the walk. The stat rail and the
 * per-stat breakdown moved to You with the character screen's dissolution —
 * same gate, different file, and `useDisclosure`'s doc comment lists where
 * each one landed.
 */
export default function Today() {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const timeZone = profile.data?.timezone;

  const score = useTodayScore(userId, timeZone);
  const buckets = useTodayBuckets(userId, timeZone);
  const vitals = useTodayVitals(userId, timeZone);
  const dominance = useDominantStat(userId, timeZone);
  const streak = useStreak(userId);
  const squad = useMySquad(userId);
  const board = useSquadLeaderboard(squad.data?.id, 'current');
  const days = useOwnRecentDays(userId, timeZone);
  const disclosure = useDisclosure(userId);
  const scoredDays = useScoredDayCount(userId);

  const localToday = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;
  const completions = useQuestCompletions(userId, localToday);

  const totalXp = profile.data?.total_xp ?? 0;
  const level = profile.data?.level ?? levelForXp(totalXp);
  const stage = evolutionStageForLevel(level);
  const xp = xpProgress(totalXp);
  const totals = buckets.data?.totals;
  const steps = totals?.steps ?? 0;
  const characterName = profile.data?.character_name ?? 'Your Kairo';
  const today = score.data;

  // Lifetime rollups, for the presence ring. The rail that reads the same three
  // numbers lives on You now; the ring is the figure's own business and is not
  // gated, because it is shape rather than a readout.
  const lifetime: Record<CoreStat, number> | undefined = profile.data && {
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

  // The bird directly ahead of you, for the hero sentence. The same payload the
  // Sky tab ranks, ranked the same way — by capped steps, on the client,
  // because `squad_leaderboard()` orders by the program-weighted total and
  // ranking once in SQL would silently delete the program feature.
  const ranked = rankRacers(
    buildRacers({
      inSquad: Boolean(squad.data),
      rows: board.data ?? [],
      userId,
      characterName: profile.data?.character_name,
      species: profile.data?.species ?? null,
      steps,
      total: score.data?.total ?? 0,
      recentDays: days.data ?? [],
      localToday,
    }),
  );
  const me = ranked.find((r) => r.isSelf);
  const ahead = me ? ranked.find((r) => r.rank === me.rank - 1) : undefined;

  const sleep = sleepLine({
    characterName,
    // The night the score saw, not the raw column — a hand-typed night scores
    // no Mind at all, and `finalize-days` grades by the same rule.
    sleepMinutes: vitals.data?.sleepMinutes ?? null,
  });
  const lane = laneLine({ characterName, lane: laneStat(dominance.data) });

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

  return (
    <Screen>
      {/* The bird, in its sky. `Diorama` already owns the figure, the ground
          shadow, the habitat and the presence ring; this screen supplies the
          field it sits in and nothing else. `padding: 0` because the sky runs
          to the card's edge — it is a place, not a card with a margin. */}
      <Panel variant="sky" style={styles.stage}>
        <Diorama
          height={300}
          level={level}
          stage={stage}
          dominance={dominance.data}
          species={profile.data?.species}
          lifetimePoints={lifetime}
        />
      </Panel>

      {/* Level and streak, in flow rather than floating. They were an
          absolutely-positioned HUD over the diorama while it was full-bleed at
          the top of the screen; the sky is a card now, and a row under it says
          the same two things without the offsets that stacked pills on top of
          each other at large Dynamic Type. */}
      <View style={styles.pills}>
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
            <Text scale="fixed" style={styles.levelNumber}>
              {level}
            </Text>
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

        {/* "3 day streak", not "3-day": the hyphenated form is right on screen
            and wrong out loud, the same rule `row-label.ts` tests. */}
        {(streak.data?.current_streak ?? 0) > 0 && (
          <View
            accessible
            accessibilityLabel={`${streak.data?.current_streak} day streak`}
            style={styles.streakPill}
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

      {/* The day, in real units. One number per screen — never a score total
          (deviation #34), and `Numeral` is tabular so a live refetch does not
          make it jitter.

          One accessible element, not two: ungrouped, VoiceOver stops on the
          bare numeral and then on the unit. */}
      <View
        accessible
        accessibilityLabel={`${steps.toLocaleString()} steps today`}
        style={styles.hero}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.heroRow}
        >
          <Numeral value={steps} size="hero" color={colors.accentInk} animate />
          <Text scale="fixed" style={styles.heroUnit}>
            STEPS TODAY
          </Text>
        </View>
      </View>

      {/* The race, as a sentence. The picture is on the Sky tab. */}
      <Text style={styles.sentence}>
        {heroSentence({
          characterName,
          progress: me?.progress ?? 0,
          rival: ahead
            ? {
                name: ahead.characterName,
                stepsAhead: ahead.cappedSteps - (me?.cappedSteps ?? 0),
              }
            : null,
        })}
      </Text>

      {/* The Strain/Sleep rows, redrawn. **Still gated** — same rule, new
          dress. A `core` account has not produced the nights these read. */}
      {disclosure.stage === 'full' && (
        <>
          <VoiceCard tone="teal" eyebrow={sleep.eyebrow} body={sleep.body} />
          {lane && <VoiceCard tone="sage" eyebrow={lane.eyebrow} body={lane.body} />}
        </>
      )}

      {/* Deliberately outside any gate: "waiting for your first sync" or
          "couldn't sync" is most useful on exactly the account that has the
          least else on screen. */}
      <SyncStatus userId={userId} timeZone={timeZone} />

      {/* Three small things, reset at the player's own local midnight.
          **Derived, never stored** — `pickQuests()` hashes (account, date,
          tier), so tomorrow hashes to a different three and there is no job, no
          row and nothing for a retroactive Apple revision to invalidate.
          Ungated on purpose: this is what teaches the loop. */}
      <QuestList quests={quests} />

      {/* The one number in Kairo that never moves, and the run of days against
          it. It never scales with the user. */}
      <DailyWalkCard
        userId={userId}
        timeZone={timeZone}
        today={localToday}
        todaySteps={totals?.steps}
      />

      {/* The door to Challenges — **the one gated thing below the fold**. A
          Challenge target is a trailing median over workout sessions a `core`
          account may have none of, so offering it on day one offers depth to
          somebody who has not produced the data it reads.

          Last deliberately: a hidden card at the bottom leaves no hole, where
          one removed from the middle would.

          `stage`, not `resolved && stage` — this hides a card, it does not
          navigate. The redirect in `/train` is the one that has to wait. */}
      {disclosure.stage === 'full' && (
        <TrainEntry userId={userId} timeZone={timeZone} today={localToday} />
      )}

      {/* What the gate is building toward. An empty space where a card used to
          be reads as a missing feature, so `core` says what is coming —
          counted in "active days" rather than as a bare countdown, because
          that is the thing the gate actually counts.

          `resolved` here and nowhere else on this screen. The gated cards above
          act on the stage alone, which is right — hiding early then revealing
          is a reveal. This line makes an affirmative claim with a number in it,
          so an unresolved count would print "Three more active days…" to an
          established user for a frame, or permanently if the count query errors
          while the profile query succeeded. */}
      {disclosure.resolved && disclosure.stage === 'core' && (
        <Text style={styles.disclosureNote}>
          {disclosure.daysToGo === 1
            ? 'One more active day and challenges and your full stat breakdown open up.'
            : `${countWord(disclosure.daysToGo)} more active days and challenges ` +
              'and your full stat breakdown open up.'}
        </Text>
      )}

      {/* `/progress` is reached through the expanded stat block on You, which
          `core` does not have — leaving a first-time user with no explanation
          of anything on the screen they understand least. So the link renders
          here instead, at the one stage that needs it most. Same destination,
          not a second help surface. */}
      {disclosure.stage === 'core' && (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="How progress works"
          hitSlop={space.sm}
          onPress={() => router.push('/progress')}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Text style={styles.helpLink}>How progress works</Text>
        </Pressable>
      )}

      <FirstSyncCallout
        userId={userId}
        timeZone={timeZone}
        points={{
          AGI: today?.agi_points ?? 0,
          STR: today?.str_points ?? 0,
          MND: today?.mind_points ?? 0,
        }}
        hasScore={today != null}
      />
    </Screen>
  );
}

/**
 * One of the bird's observations, as a card.
 *
 * Two tones, and they are the two families that are not the accent: teal is
 * rest, sage is your lane. Neither is a call to action, which is why neither is
 * amber — the screen spends its one accent on the day's number.
 *
 * One accessibility element with both halves of the grouping fix: an eyebrow
 * and a sentence read as two stops otherwise, and the eyebrow alone is not a
 * sentence.
 */
function VoiceCard({
  tone,
  eyebrow,
  body,
}: {
  tone: 'teal' | 'sage';
  eyebrow: string;
  body: string;
}) {
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  } as const;

  return (
    <View
      accessible
      accessibilityLabel={`${eyebrow}. ${body}`}
      style={[styles.voiceCard, tone === 'teal' ? styles.voiceTeal : styles.voiceSage]}
    >
      <Text
        {...hidden}
        scale="chrome"
        style={[styles.voiceEyebrow, tone === 'teal' ? styles.inkTeal : styles.inkSage]}
      >
        {eyebrow.toUpperCase()}
      </Text>
      <Text
        {...hidden}
        style={[styles.voiceBody, tone === 'teal' ? styles.inkTeal : styles.inkSage]}
      >
        {body}
      </Text>
    </View>
  );
}

/**
 * Who is on the track, from whichever source this account has.
 *
 * In a squad the rivals are squadmates; alone they are the player's own recent
 * days. A squad row whose `steps` is null has not consented, on one side or the
 * other (deviation #47), and cannot be placed — it is dropped here rather than
 * drawn at zero, because a sentence has no room to explain a withheld lane and
 * the Sky tab does that job.
 */
function buildRacers(input: {
  inSquad: boolean;
  rows: readonly {
    user_id: string;
    character_name: string;
    species: string | null;
    steps: number | null;
    total: number;
    is_self: boolean;
  }[];
  userId: string | undefined;
  characterName: string | undefined;
  species: string | null;
  steps: number;
  total: number;
  recentDays: readonly { localDate: string; steps: number }[];
  localToday: string | undefined;
}): RacerInput[] {
  if (input.inSquad) {
    return input.rows
      .filter((r) => r.steps !== null)
      .map((r) => ({
        userId: r.user_id,
        characterName: r.character_name,
        species: r.species,
        steps: r.steps ?? 0,
        total: r.total,
        isSelf: r.is_self,
      }));
  }

  const me: RacerInput = {
    userId: input.userId ?? 'self',
    characterName: input.characterName ?? 'You',
    species: input.species,
    steps: input.steps,
    total: input.total,
    isSelf: true,
  };

  // `ghostRivals` drops days that scored nothing, so a new account does not
  // line up against three zeroes — which reads as the feature being broken
  // rather than as an easy win.
  const ghosts = ghostRivals(input.recentDays, 3).map((g) => ({
    ...g,
    // `race-label.ts` prefixes a ghost with "your", so this has to read
    // "your Saturday" — never "your 2026-08-22".
    characterName: input.localToday
      ? ghostDayLabel(g.characterName, input.localToday)
      : g.characterName,
    // Your own past days ran as you.
    species: input.species,
  }));

  return [me, ...ghosts];
}

const styles = StyleSheet.create({
  stage: { padding: 0, alignItems: 'center', justifyContent: 'flex-end' },

  pills: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.sm,
    marginTop: space.md,
  },
  // Two content-sized pills in a `space-between` row overflow rather than wrap,
  // and RN defaults `flexShrink` to 0. The level pill is the one that grows (a
  // long XP line), so it is the one that yields.
  levelPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  levelDisc: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ramp.accent[200],
  },
  levelNumber: { ...font.display.small, color: ramp.accent[800] },
  levelBody: { minWidth: 92, flexShrink: 1, gap: 3, paddingRight: space.xs },
  levelMeta: { ...font.body.strong, fontSize: 10.5, color: ramp.neutral[700] },

  streakPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: ramp.sage[200],
  },
  streakNumber: { ...font.display.small, color: ramp.sage[800] },
  streakUnit: { ...font.body.label, color: ramp.sage[800] },

  hero: { marginTop: space.lg },
  // `flexWrap`, because this row is the widest thing on the screen: six display
  // glyphs at hero size plus the unit already overflow a 320pt screen before
  // Dynamic Type touches it. Wrapping puts the unit on its own line.
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space.sm },
  heroUnit: { ...font.body.label, color: colors.muted, paddingBottom: space.sm },

  sentence: {
    ...font.body.body,
    fontSize: 16,
    lineHeight: 23,
    color: colors.subtle,
    marginTop: space.sm,
  },

  voiceCard: {
    marginTop: space.md,
    padding: space.lg,
    borderRadius: 24,
    borderCurve: 'continuous',
    gap: space.xs,
  },
  voiceTeal: { backgroundColor: colors.tealTint },
  voiceSage: { backgroundColor: ramp.sage[200] },
  inkTeal: { color: colors.tealInk },
  inkSage: { color: ramp.sage[800] },
  voiceEyebrow: { ...font.body.label },
  voiceBody: { ...font.body.body, fontSize: 14.5, lineHeight: 20 },

  disclosureNote: {
    ...font.body.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.muted,
    marginTop: space.lg,
    textAlign: 'center',
  },
  helpLink: {
    ...font.body.strong,
    color: colors.accentDeep,
    marginTop: space.md,
    textAlign: 'center',
  },
});

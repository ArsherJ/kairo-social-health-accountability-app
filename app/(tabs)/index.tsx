import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  DAILY_STEP_BASELINE,
  MAX_DAILY_SCORE_PHONE_ONLY,
  currentLocalDate,
  evolutionStageForLevel,
  ghostRivals,
  levelForXp,
  questTier,
  rankRacers,
  shiftedThreshold,
  spreadShift,
  type CoreStat,
  type RacerInput,
} from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { Diorama } from '@/features/character/Diorama.tsx';
import { FirstSyncCallout } from '@/features/character/FirstSyncCallout.tsx';
import { SyncStatus } from '@/features/character/SyncStatus.tsx';
import {
  heroSentence,
  laneLine,
  sleepLine,
  spreadLine,
  ceilingLine,
} from '@/features/character/kairo-voice.ts';
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
import { QuestRings } from '@/features/quests/QuestRings.tsx';
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
import { TodayChips, TodayCount, TodayStatCoins } from '@/features/character/TodayHud.tsx';
import { TodayTiles } from '@/features/character/TodayTiles.tsx';
import { RaceLine } from '@/features/squad/RaceLine.tsx';
import { WelcomePopups } from '@/features/onboarding/WelcomePopups.tsx';
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
 * How tall the sky is.
 *
 * Fixed rather than a fraction of the screen, because the figure inside it is
 * sized from this (`Diorama` draws the character at `height * 0.6`) and a bird
 * that changed size between a 320pt and a 440pt phone would read as a different
 * bird. 452 is the design's, and it leaves the quest rings half on screen at
 * the fold on the shortest supported device — which is the point: the rings are
 * what tell you the screen scrolls.
 */
const HERO_HEIGHT = 452;

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
  // Hoisted, because the tile needs the stat itself as well as the sentence
  // about it — calling `laneStat` twice would be two chances to disagree.
  const laneOf = laneStat(dominance.data);
  const lane = laneLine({ characterName, lane: laneOf });

  // The shift the scorer actually applied to Motion today, read through the
  // same `spreadShift` rather than restated — a sentence quoting a ladder the
  // engine stopped using is worse than no sentence. `DAILY_STEP_BASELINE` *is*
  // Motion's gold band by derivation, which is why no literal appears here.
  // The day has earned everything scoring can see. Read from the stored total
  // rather than recomputed — the ceiling is the same figure with or without a
  // wearable (normalization is what makes that true), so one comparison covers
  // both cohorts. **Read, never rendered**: deviation #34 bans printing a score
  // total, not consulting one.
  const ceilingReached = (today?.total ?? 0) >= MAX_DAILY_SCORE_PHONE_ONLY;

  const spread = totals
    ? spreadLine({
        activeHours: totals.activeHours,
        goldSteps: shiftedThreshold(DAILY_STEP_BASELINE, spreadShift(totals.activeHours)),
        baseSteps: DAILY_STEP_BASELINE,
      })
    : null;

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

  // The night as a figure, for the sleep tile. Read through the same
  // `vitals.sleepMinutes` the sentence beside it reads, so the two cannot
  // disagree — and `null` stays `null` all the way to the tile, which prints
  // no figure at all rather than "0h 00" on a night nothing measured.
  const sleepFigure =
    vitals.data?.sleepMinutes == null
      ? null
      : `${Math.floor(vitals.data.sleepMinutes / 60)}h ${String(
          Math.round(vitals.data.sleepMinutes % 60),
        ).padStart(2, '0')}`;

  return (
    <Screen bleed>
      {/* The bird, in its sky, running to the edge of the glass.

          `Diorama` owns the figure, the ground shadow, the sky and its fade;
          this screen supplies the HUD that floats over it. The HUD is a
          **flowing column** spaced by flex — the 2026-08-14 rule, and this
          screen is where it was learned: the pills were pinned at fixed offsets
          against heights nothing enforced, and at large Dynamic Type they grew
          past each other. No child here carries a `top`. */}
      <Diorama
        height={HERO_HEIGHT}
        level={level}
        stage={stage}
        dominance={dominance.data}
        species={profile.data?.species}
        lifetimePoints={lifetime}
        crest={ceilingReached}
      >
        <View style={[styles.hud, { paddingTop: insets.top + space.sm }]}>
          <TodayChips level={level} xp={xp} streak={streak.data?.current_streak ?? 0} />

          <View style={styles.hudGap} />

          {/* **Gated, same rule as the rail on You** (deviation #37). These are
              the same three masteries from the same lifetime rollups; an
              ungated copy on the screen a brand-new account opens first would
              undo the gate by the back door. */}
          {disclosure.stage === 'full' && (
            <TodayStatCoins
              ratings={
                profile.data && {
                  AGI: profile.data.agi_total,
                  STR: profile.data.str_total,
                  MND: profile.data.mnd_total,
                }
              }
            />
          )}

          <View style={styles.hudGap} />

          {/* The day, in real units. One number per screen — never a score
              total (deviation #34). */}
          <TodayCount steps={steps} />
        </View>
      </Diorama>

      <View style={styles.page}>
        {/* Three small things, reset at the player's own local midnight.
            **Derived, never stored** — `pickQuests()` hashes (account, date,
            tier), so tomorrow hashes to a different three and there is no job,
            no row and nothing for a retroactive Apple revision to invalidate.
            Ungated on purpose: this is what teaches the loop. */}
        <QuestRings quests={quests} />

        {/* The race, as a line and a door. The picture is on the Sky tab; this
            names the gap to the bird ahead and opens it. Renders nothing when
            there is nobody ahead. */}
        <RaceLine racers={ranked} me={me} ahead={ahead} />

        {/* The bird's reading of the day, under the figures it is about. The
            hero sentence sits here rather than over the sky: it is prose, and
            prose on a picture is the one thing `Glass` cannot rescue. */}
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

        {/* Why today's Motion is easier than the published number, when it is.
            **Ungated on purpose**: the shift applies from an account's very
            first day, and a difficulty change nobody explains reads as a broken
            score rather than as a gift. A plain line, not a card: it explains
            the figure above it and a panel would make it a separate subject. */}
        {spread && <Text style={styles.aside}>{spread}</Text>}

        {/* What the changed sky means. The crest is the one thing that alters
            the app's centrepiece, so it is also the one that most needs saying
            out loud — an unexplained change to the screen someone opens first
            is indistinguishable from a bug. */}
        {ceilingReached && <Text style={styles.sentence}>{ceilingLine(characterName)}</Text>}

        {/* The Strain/Sleep rows, redrawn as tiles. **Still gated** — same
            rule, new dress. A `core` account has not produced the nights these
            read. */}
        {disclosure.stage === 'full' && (
          <TodayTiles
            sleep={{ ...sleep, figure: sleepFigure }}
            // The lane's figure is the stat's own player-facing word, never
            // its engine key (deviation #51) and never a number — a lane has no
            // number, and inventing one is the readout these tiles replace.
            lane={lane && { ...lane, figure: laneOf ? STAT_NAMES[laneOf] : null }}
          />
        )}

        {/* Deliberately outside any gate: "waiting for your first sync" or
            "couldn't sync" is most useful on exactly the account that has the
            least else on screen. */}
        <SyncStatus userId={userId} timeZone={timeZone} />

        {/* The one number in Kairo that never moves, and the run of days
            against it. It never scales with the user. */}
        <DailyWalkCard
          userId={userId}
          timeZone={timeZone}
          today={localToday}
          todaySteps={totals?.steps}
        />

        {/* The door to Challenges — **the one gated thing below the fold**. A
            Challenge target is a trailing median over workout sessions a `core`
            account may have none of.

            Last deliberately: a hidden card at the bottom leaves no hole, where
            one removed from the middle would.

            `stage`, not `resolved && stage` — this hides a card, it does not
            navigate. The redirect in `/train` is the one that has to wait. */}
        {disclosure.stage === 'full' && (
          <TrainEntry userId={userId} timeZone={timeZone} today={localToday} />
        )}

        {/* What the gate is building toward. An empty space where a card used
            to be reads as a missing feature, so `core` says what is coming —
            counted in "active days" rather than as a bare countdown.

            `resolved` here and nowhere else on this screen. The gated cards
            above act on the stage alone, which is right — hiding early then
            revealing is a reveal. This line makes an affirmative claim with a
            number in it, so an unresolved count would print "Three more active
            days…" to an established user for a frame. */}
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
            here instead, at the one stage that needs it most. */}
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
      </View>

      {/* The three cards that land after onboarding. Mounted here because this
          is where onboarding drops you and because the dim is over *this*
          screen in the design — the sheet rises over a Today that already has
          your first numbers on it, which is the whole point of asking for
          Health before the name.

          Once ever, on an MMKV marker it claims itself; this screen passes the
          values and the invite action and knows nothing else about it. */}
      <WelcomePopups
        userId={userId}
        characterName={characterName}
        inviteCode={squad.data?.invite_code ?? null}
        onInvite={() => router.push('/flock')}
      />
    </Screen>
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
  /**
   * The HUD column over the sky. `flex: 1` so it fills the diorama, and spaced
   * by two flexible gaps rather than by offsets — the 2026-08-14 rule this
   * screen is the original home of.
   */
  hud: { flex: 1, paddingBottom: 22 },
  hudGap: { flex: 1 },

  /** Everything below the sky, which is where the page's own padding lives. */
  page: { paddingHorizontal: space.lg },

  sentence: {
    ...font.body.body,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.subtle,
    marginTop: 14,
  },

  /**
   * The spread line: subordinate to `sentence`, which is the day's headline.
   *
   * A step down in size rather than a colour change — `colors.muted` already
   * carries "supporting" here, and reaching for the accent would make a
   * footnote compete with the figure it is a footnote to. No card, no rule, no
   * icon: it is one clause attached to the number above it, and every container
   * considered made it look like a separate subject.
   */
  aside: {
    ...font.body.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    marginTop: space.xs,
  },

  disclosureNote: {
    ...font.body.body,
    fontSize: 13,
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

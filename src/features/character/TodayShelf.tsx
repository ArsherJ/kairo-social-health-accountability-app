import { useEffect } from 'react';
import { View } from 'react-native';
import { currentLocalDate, ghostRivals, questTier, type RacerInput } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { useTodayBuckets, useTodayVitals } from '@/features/character/buckets.ts';
import { useScoredDayCount, useTodayScore } from '@/features/character/queries.ts';
import { useDisclosure } from '@/features/character/useDisclosure.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { QuestList } from '@/features/quests/QuestList.tsx';
import { todayQuests, useQuestCompletions } from '@/features/quests/queries.ts';
import { ghostDayLabel } from '@/features/squad/ghost-day-label.ts';
import { RaceCard } from '@/features/squad/RaceCard.tsx';
import { useMySquad, useOwnRecentDays, useSquadLeaderboard } from '@/features/squad/queries.ts';
import { claimDaily, type DailyMarker } from '@/features/telemetry/daily-marker.ts';
import { track } from '@/features/telemetry/events.ts';
import { DailyWalkCard } from '@/features/train/DailyWalkCard.tsx';
import { TrainEntry } from '@/features/train/TrainEntry.tsx';
import { Label } from '@/ui/index.ts';

/**
 * **Interim shape (2026-08-27).** This was `app/(tabs)/today.tsx` until the
 * character tab dissolved. It is mounted at the foot of the Today tab so
 * quests, the Daily Walk and the `race_seen` / `quest_cleared` markers keep
 * working, and plan 2 dissolves it into that screen's real composition. Do not
 * build anything new on it.
 *
 * Today — the present moment (roadmap deviation #50).
 *
 * A tab rather than a shelf on the character screen, because the character
 * screen's subject is *the character* and everything below its hero was a
 * different subject sharing a scroll. Splitting them is what makes room for
 * quests without making the home screen longer than a thumb.
 *
 * **The tab is ungated; the Challenge door on it is not.** The disclosure gate
 * (deviation #37) is completely unchanged by this screen — same constant, same
 * threshold test, same `total > 0` filter, same list of gated surfaces.
 * Quests are simply *built* outside it: gating the thing that teaches the loop
 * is backwards, and a tab named for the present moment showing one card for
 * three days reads as a broken app rather than as a gentle one. A Challenge is
 * the opposite case — a trailing-median target derived from workout sessions a
 * new account may have none of — so `TrainEntry` keeps its `full` wrapper and
 * `/train` keeps its redirect.
 *
 * The race card, three quests and the Daily Walk are all ungated, so a day-one
 * account meets three live things here.
 *
 * **Every query below is already in TanStack's cache** from the character and
 * squad screens, and every hook resolves to the same key those screens use — so
 * this tab adds no requests, and it cannot disagree with them in one frame.
 */
export function TodayShelf() {
  const session = useSessionStore((s) => s.session);
  const userId = session?.user.id;
  const profile = useProfile(userId);
  const timeZone = profile.data?.timezone;

  const buckets = useTodayBuckets(userId, timeZone);
  const score = useTodayScore(userId, timeZone);
  const squad = useMySquad(userId);
  const board = useSquadLeaderboard(squad.data?.id, 'current');
  const days = useOwnRecentDays(userId, timeZone);
  const disclosure = useDisclosure(userId);
  // The same query the character screen mounts, on the same key — one request,
  // and the sleep quests read the night the score actually saw rather than the
  // raw column. `scoredSleepMinutes` gates a hand-typed night to null there,
  // which is the identical rule `finalize-days` applies when it grades.
  const vitals = useTodayVitals(userId, timeZone);
  const scoredDays = useScoredDayCount(userId);

  // The user's own calendar date. One computation the cards below share; none
  // of them reads the clock itself.
  const localToday = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  const completions = useQuestCompletions(userId, localToday);

  const totals = buckets.data?.totals;
  const quests = todayQuests({
    userId,
    localDate: localToday,
    // `?? 0` while the count is in flight puts a first-frame account on the
    // starter tier, which is the safe direction: showing an easy quest and
    // then a harder one is a correction, where the reverse is a bar
    // disappearing out from under someone mid-walk.
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

  const racers = buildRacers({
    inSquad: Boolean(squad.data),
    rows: board.data ?? [],
    userId,
    characterName: profile.data?.character_name,
    species: profile.data?.species ?? null,
    steps: totals?.steps ?? 0,
    total: score.data?.total ?? 0,
    recentDays: days.data ?? [],
    localToday,
  });

  // The two moments the post-pivot loop turns on (deviation #44), both once per
  // the user's own local day rather than per render — fired on render they
  // would measure scrolling rather than engagement.
  //
  // In an effect rather than inline in the body: `claimDaily` writes to MMKV
  // and `track` writes a row, and a render that does either is a render with a
  // side effect. React may call it twice.
  const sawRace = racers.length > 1;
  useEffect(() => {
    if (!userId || !localToday || !sawRace) return;
    if (claimDaily(userId, 'race_seen', localToday)) void track(userId, 'race_seen');
  }, [userId, localToday, sawRace]);

  // The tier is resolved again here rather than threaded out of `todayQuests`,
  // because it is the same pure call with the same two arguments — and the
  // payload carries the tier and **never the quest id**: a tier answers "are
  // the bars set right", where an id would make the table a per-quest
  // leaderboard nobody asked for. The slot index is the marker key for the same
  // reason.
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
    <View>
      <Label>Today</Label>

      {/* The race you are currently in, summarised. The full track is on the
          Squad tab and reads this same payload. */}
      {racers.length > 1 && <RaceCard racers={racers} />}

      {/* Three small things, reset at the player's own local midnight.
          **Derived, never stored** — `pickQuests()` hashes (account, date,
          tier), so tomorrow simply hashes to a different three and there is no
          job, no row and nothing for a retroactive Apple revision to
          invalidate. Ungated on purpose: this is what teaches the loop. */}
      <QuestList quests={quests} />

      {/* The one number in Kairo that never moves, and the run of days against
          it. It moved tabs; the number did not change and never scales with
          the user. It sits under the race because the race is *today* and the
          walk is the floor every day shares. */}
      <DailyWalkCard
        userId={userId}
        timeZone={timeZone}
        today={localToday}
        todaySteps={totals?.steps}
      />

      {/* The door to Challenges — **the one gated thing on this tab**, and it
          keeps the wrapper it had on the character screen. A Challenge target
          is a trailing median over workout sessions a `core` account may have
          none of, so offering it on day one offers depth to somebody who has
          not produced the data it reads.

          Last on the tab deliberately: a hidden card at the bottom leaves no
          hole, where one removed from the middle would.

          `stage`, not `resolved && stage` — this hides a card, it does not
          navigate. Hiding early and revealing is a reveal; the redirect in
          `/train` is the one that has to wait. */}
      {disclosure.stage === 'full' && (
        <TrainEntry userId={userId} timeZone={timeZone} today={localToday} />
      )}
    </View>
  );
}

/**
 * Who is on the track, from whichever source this account has.
 *
 * In a squad the rivals are squadmates; alone they are the player's own recent
 * days, exactly as `SoloBoard` composes them. Both paths produce `RacerInput`,
 * and the ranking happens once, inside `RaceCard`.
 *
 * A squad row whose `steps` is null has not consented, on one side or the other
 * (deviation #47), and cannot be placed on a track. It is dropped from the
 * *card* rather than drawn without a position, because a summary has no room to
 * explain a withheld lane — the full track on the Squad tab does that job.
 */
function buildRacers(input: {
  inSquad: boolean;
  rows: readonly { user_id: string; character_name: string; species: string | null;
    steps: number | null; total: number; is_self: boolean }[];
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
  // rather than as an easy win. With no qualifying history this returns
  // nothing, the racer count falls to one, and the card renders nothing at all
  // rather than an empty race.
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

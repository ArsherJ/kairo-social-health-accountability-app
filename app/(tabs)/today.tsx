import { currentLocalDate, ghostRivals, type RacerInput } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { useTodayBuckets } from '@/features/character/buckets.ts';
import { useTodayScore } from '@/features/character/queries.ts';
import { useDisclosure } from '@/features/character/useDisclosure.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { ghostDayLabel } from '@/features/squad/ghost-day-label.ts';
import { RaceCard } from '@/features/squad/RaceCard.tsx';
import { useMySquad, useOwnRecentDays, useSquadLeaderboard } from '@/features/squad/queries.ts';
import { DailyWalkCard } from '@/features/train/DailyWalkCard.tsx';
import { TrainEntry } from '@/features/train/TrainEntry.tsx';
import { Label, Screen } from '@/ui/index.ts';

/**
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
export default function Today() {
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

  // The user's own calendar date. One computation the cards below share; none
  // of them reads the clock itself.
  const localToday = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  const racers = buildRacers({
    inSquad: Boolean(squad.data),
    rows: board.data ?? [],
    userId,
    characterName: profile.data?.character_name,
    species: profile.data?.species ?? null,
    steps: buckets.data?.totals?.steps ?? 0,
    total: score.data?.total ?? 0,
    recentDays: days.data ?? [],
    localToday,
  });

  return (
    <Screen>
      <Label>Today</Label>

      {/* The race you are currently in, summarised. The full track is on the
          Squad tab and reads this same payload. */}
      {racers.length > 1 && <RaceCard racers={racers} />}

      {/* Quests go here — Task 7. */}

      {/* The one number in Kairo that never moves, and the run of days against
          it. It moved tabs; the number did not change and never scales with
          the user. It sits under the race because the race is *today* and the
          walk is the floor every day shares. */}
      <DailyWalkCard
        userId={userId}
        timeZone={timeZone}
        today={localToday}
        todaySteps={buckets.data?.totals?.steps}
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
    </Screen>
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

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
 */
export default function Today() {
  return (
    <Screen>
      <Label>Today</Label>
      {/* The race card, the quests, the Daily Walk and the Challenge door land
          here next. Every card on this tab is keyed to the player's own local
          date (§2), threaded down from `profiles.timezone` — none of them may
          read the clock itself. */}
    </Screen>
  );
}

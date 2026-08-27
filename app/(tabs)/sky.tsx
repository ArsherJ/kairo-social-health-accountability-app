import { RaceTrack } from '@/features/squad/RaceTrack.tsx';
import { useSessionStore } from '@/features/auth/session.ts';
import { useMySquad, useSquadLeaderboard } from '@/features/squad/queries.ts';
import { Screen } from '@/ui/index.ts';

/**
 * The Sky tab — the daily race, on a screen of its own.
 *
 * **This is the tab's foundation, not its design.** Plan 3 replaces
 * `RaceTrack` with the sky corridor from `Canvas.dc.html` screen 2c. Until
 * then it renders the track that was on the squad screen, moved rather than
 * redrawn, so the tab is real and navigable from the moment it exists.
 *
 * It reads the **same query** the Flock board reads, on the same key, so the
 * two cannot disagree in one frame and this tab adds no request. The re-rank by
 * capped steps happens inside `RaceTrack`; `squad_leaderboard()` orders by the
 * program-weighted total and must keep doing so (deviation #11).
 */
export default function Sky() {
  const session = useSessionStore((s) => s.session);
  const squad = useMySquad(session?.user.id);
  const board = useSquadLeaderboard(squad.data?.id, 'current');

  return (
    <Screen>
      {/* No eyebrow here. `RaceTrack` draws its own "TODAY'S RACE" heading,
          and adding one above it rendered the words twice — caught on the
          simulator, and invisible to every test in this repo. */}
      <RaceTrack rows={board.data ?? []} />
    </Screen>
  );
}

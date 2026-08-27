import { RaceTrack } from '@/features/squad/RaceTrack.tsx';
import { useSessionStore } from '@/features/auth/session.ts';
import { describeAge } from '@/features/health/sync-status.ts';
import { useSyncStatusStore } from '@/features/health/status-store.ts';
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
 * two cannot disagree in one frame and this tab adds no request. The freshness
 * line came with the track when the board dropped its mount (2026-08-27) — it
 * describes the track, so it belongs wherever the track is. The re-rank by
 * capped steps happens inside `RaceTrack`; `squad_leaderboard()` orders by the
 * program-weighted total and must keep doing so (deviation #11).
 */
export default function Sky() {
  const session = useSessionStore((s) => s.session);
  const squad = useMySquad(session?.user.id);
  const board = useSquadLeaderboard(squad.data?.id, 'current');

  // How old *your own* numbers are, and the line says "your" for a reason.
  // Squadmates' freshness is not knowable from here — the RPC projects totals,
  // not sync times — so this claims only what it can actually check. HealthKit
  // background delivery is opportunistic, and a track that reads as live while
  // it is hours old is the app making a promise it has no way to keep.
  const { lastSyncedAt } = useSyncStatusStore();
  const syncedLabel =
    lastSyncedAt === null
      ? "Your numbers haven't synced yet"
      : `Your numbers updated ${describeAge(Date.now() - lastSyncedAt)}`;

  return (
    <Screen>
      {/* No eyebrow here. `RaceTrack` draws its own "TODAY'S RACE" heading,
          and adding one above it rendered the words twice — caught on the
          simulator, and invisible to every test in this repo. */}
      <RaceTrack rows={board.data ?? []} syncedLabel={syncedLabel} />
    </Screen>
  );
}

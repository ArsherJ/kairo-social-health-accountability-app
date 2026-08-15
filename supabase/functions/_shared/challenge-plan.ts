import {
  CHALLENGE_COMPLETION_XP,
  challengeMet,
  clearingSession,
  resolveChallenge,
  type Challenge,
  type ChallengeArea,
  type WorkoutSession,
} from './core.ts';

/**
 * The decision half of the challenge pass in `finalize-days`, kept free of I/O
 * so it can be tested in plain Node with no Deno, no Docker and no database.
 *
 * The handler reads the user's opt-ins and their trailing window of sessions;
 * this module decides which areas just cleared. Nothing here writes, and
 * nothing here computes a target itself — `resolveChallenge()` in `@kairo/core`
 * is the single implementation of that arithmetic, exactly as `evaluateGoal()`
 * is for goals.
 */

/** Which areas this user has opted into (§7.9). Both default false. */
export interface ChallengeOptIn {
  run: boolean;
  strength: boolean;
}

/** The row `finalize-days` will insert when an area clears. */
export interface ChallengeCompletionRow {
  user_id: string;
  area: ChallengeArea;
  local_date: string;
  /**
   * The target as it stood. Snapshotted because the trailing median moves, so
   * it can no longer answer "what did I clear in March" after the fact.
   */
  target: Challenge;
  xp_awarded: number;
}

export interface ChallengeCompletion {
  row: ChallengeCompletionRow;
  /** Carried so the handler can build notification copy without re-deriving. */
  challenge: Challenge;
}

/**
 * Which of this user's areas cleared on `localDate`.
 *
 * The challenge for that day is resolved from sessions **strictly before** it,
 * which `resolveChallenge` enforces — so the session being judged cannot move
 * its own bar, and nothing stateful has to be stored for a retroactive Apple
 * revision to flow through correctly.
 *
 * Areas the user has not opted into are skipped entirely: a non-runner has no
 * Run challenge to fail, which is the whole point of the opt-in.
 *
 * `alreadyCleared` skips an area already latched for this day. The insert also
 * carries `ignoreDuplicates`, so this is the cheap half of the guard rather
 * than the correct half — two overlapping cron runs are stopped by the primary
 * key, not by this set.
 */
export function planChallengeCompletions({
  userId,
  localDate,
  optIn,
  sessions,
  alreadyCleared,
}: {
  userId: string;
  localDate: string;
  optIn: ChallengeOptIn;
  /** The trailing window, including `localDate`'s own sessions. */
  sessions: readonly WorkoutSession[];
  alreadyCleared: ReadonlySet<ChallengeArea>;
}): ChallengeCompletion[] {
  const completions: ChallengeCompletion[] = [];

  for (const area of ['run', 'strength'] as const) {
    if (!optIn[area]) continue;
    if (alreadyCleared.has(area)) continue;

    const challenge = resolveChallenge(area, sessions, localDate);
    const cleared = clearingSession(challenge, sessions, localDate);
    if (!cleared) continue;

    completions.push({
      challenge,
      row: {
        user_id: userId,
        area,
        local_date: localDate,
        target: challenge,
        xp_awarded: CHALLENGE_COMPLETION_XP,
      },
    });
  }

  return completions;
}

export { challengeMet, resolveChallenge };
export type { Challenge, ChallengeArea, WorkoutSession };

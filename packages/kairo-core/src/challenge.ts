/**
 * Challenges — the personal difficulty curve (roadmap deviation #33).
 *
 * A Challenge is a target that **moves as the user moves**: the median of their
 * own recent qualifying sessions, nudged about 3%. That is deliberately the
 * opposite of a Goal, whose target is fixed at creation because changing it
 * mid-window would silently re-grade every day already counted (§8). A moving
 * target is a different concept, not a `GoalKind` variant — so this module is a
 * sibling of `goal.ts` and does not touch it.
 *
 * Pure, zero-dependency, no clock reads, no randomness, like everything else in
 * this package. Both consumers import this same file: the Expo app via
 * `@kairo/core`, `finalize-days` via `_shared/core.ts`.
 */

import { addDays } from './day.ts';

/**
 * Apple's HKWorkoutActivityType raw values. A stable ABI, documented by Apple.
 *
 * `as const` is load-bearing, not tidiness: the compile-time guard in
 * `src/features/health/activity-types.ts` assigns these to the library's own
 * enum members, and a widened `number` would satisfy that assignment while
 * checking nothing.
 *
 * They live here rather than in `read.ts` because deciding which numbers *mean*
 * something is a decision, and `read.ts` is the module where nothing decides
 * anything. `kairo-core` is zero-dependency and cannot import the HealthKit
 * library to check itself, and neither can a test — anything importing
 * `@kingstinct/react-native-healthkit` drags in React Native's Flow syntax that
 * root Vitest cannot parse, the same constraint that made `read-types.ts` and
 * `sync-state.ts` separate files. Hence a compile-time guard rather than a
 * runtime one; proposing a runtime check here is the obvious mistake.
 */
export const RUN_ACTIVITY_TYPE = 37 as const;

/** functionalStrengthTraining, traditionalStrengthTraining, coreTraining. */
export const STRENGTH_ACTIVITY_TYPES = [20, 50, 59] as const;

/** How far back qualifying sessions are drawn from. */
export const CHALLENGE_WINDOW_DAYS = 90;

/**
 * How many recent sessions the median is taken over — **at most**, not exactly.
 *
 * With 1–4 qualifying sessions the median is taken over however many exist,
 * rather than waiting for five. A user who has run three times gets a real
 * target on their fourth run, not a fourth establish-a-baseline prompt.
 */
export const CHALLENGE_BASELINE_SESSIONS = 5;

/** The overload step. About 3% — a nudge, not a leap. */
export const CHALLENGE_STEP = 0.03;

/** Below this, a run is a walk with ambition and does not qualify. */
export const RUN_MIN_DISTANCE_M = 1_000;

/**
 * What clearing a challenge pays. About a fifth of a strong day
 * (`MAX_REALISTIC_DAILY_XP` is 200): a real nudge that cannot substitute for
 * showing up, the same posture `goalCompletionXp`'s cap takes.
 */
export const CHALLENGE_COMPLETION_XP = 40;

/** The distance floor moves in half-kilometre steps. */
const DISTANCE_FLOOR_STEP_M = 500;

/** Strength targets land on a round number of calories. */
const KCAL_ROUNDING = 5;

export type ChallengeArea = 'run' | 'strength';

export interface WorkoutSession {
  localDate: string;
  /** HKWorkoutActivityType raw value — untranslated. */
  activityType: number;
  durationS: number;
  distanceM: number;
  activeKcal: number;
}

/**
 * The live challenge for one area.
 *
 * `establish` carries **no bar to beat** — the first challenge's job is to
 * establish a baseline, not to test the user, so it is impossible to fail on
 * fitness. The second challenge is the first real one.
 */
export type Challenge =
  | { area: 'run'; kind: 'establish'; minDistanceM: number }
  | { area: 'run'; kind: 'target'; minDistanceM: number; paceSecPerKm: number }
  | { area: 'strength'; kind: 'establish' }
  | { area: 'strength'; kind: 'target'; activeKcal: number };

function qualifies(area: ChallengeArea, session: WorkoutSession): boolean {
  if (area === 'run') {
    return (
      session.activityType === RUN_ACTIVITY_TYPE &&
      session.distanceM >= RUN_MIN_DISTANCE_M &&
      session.durationS > 0
    );
  }
  return (
    (STRENGTH_ACTIVITY_TYPES as readonly number[]).includes(session.activityType) &&
    session.activeKcal > 0
  );
}

/** Seconds per kilometre. Lower is better — the one metric here that inverts. */
function paceOf(session: WorkoutSession): number {
  return session.durationS / (session.distanceM / 1_000);
}

/**
 * The ordinary median: the middle value, or the mean of the two middle values
 * on an even count.
 *
 * Worth stating rather than assuming, because a 2- or 4-session window is the
 * *common* early case here, not an edge case.
 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Qualifying sessions inside the window and **strictly before** `before`,
 * most recent first, capped at the baseline size.
 *
 * "Strictly before" is load-bearing twice over. It stops the session being
 * judged from moving its own bar — without it, a great run raises the median
 * that decides whether that same run cleared anything. And it makes the whole
 * mechanism replay-safe: nothing stateful is stored, so a retroactive HealthKit
 * revision flows through for free, the same property that made goal progress a
 * read-time projection.
 */
function baselineSessions(
  area: ChallengeArea,
  sessions: readonly WorkoutSession[],
  before: string,
): WorkoutSession[] {
  const from = addDays(before, -CHALLENGE_WINDOW_DAYS);

  return sessions
    .filter(
      (s) => s.localDate < before && s.localDate >= from && qualifies(area, s),
    )
    .sort((a, b) => (a.localDate < b.localDate ? 1 : a.localDate > b.localDate ? -1 : 0))
    .slice(0, CHALLENGE_BASELINE_SESSIONS);
}

export function resolveChallenge(
  area: ChallengeArea,
  sessions: readonly WorkoutSession[],
  before: string,
): Challenge {
  const baseline = baselineSessions(area, sessions, before);

  if (area === 'run') {
    if (baseline.length === 0) {
      return { area: 'run', kind: 'establish', minDistanceM: RUN_MIN_DISTANCE_M };
    }

    // Lower is better, so the target is *below* the median.
    const paceSecPerKm = median(baseline.map(paceOf)) * (1 - CHALLENGE_STEP);

    // The floor rises with the user rather than becoming meaningless at 10 km,
    // but it never drops below what qualifies a run at all.
    const minDistanceM = Math.max(
      RUN_MIN_DISTANCE_M,
      Math.floor(median(baseline.map((s) => s.distanceM)) / DISTANCE_FLOOR_STEP_M) *
        DISTANCE_FLOOR_STEP_M,
    );

    return { area: 'run', kind: 'target', minDistanceM, paceSecPerKm };
  }

  if (baseline.length === 0) return { area: 'strength', kind: 'establish' };

  const activeKcal =
    Math.round(
      (median(baseline.map((s) => s.activeKcal)) * (1 + CHALLENGE_STEP)) / KCAL_ROUNDING,
    ) * KCAL_ROUNDING;

  return { area: 'strength', kind: 'target', activeKcal };
}

/**
 * A pace as `m:ss`, e.g. `4:51`. Always per kilometre.
 *
 * Here rather than in either consumer because **both** need it and they must
 * agree: a push saying "4:51/km" beside a card saying "4:52/km" describes two
 * different targets for the same challenge. The same argument that keeps
 * `evaluateGoal` single-implementation.
 *
 * Rounds to the nearest second, then carries — 4:59.6 is `5:00`, not `4:60`.
 */
export function paceLabel(secPerKm: number): string {
  const total = Math.round(secPerKm);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** A distance as `5 km` or `1.5 km`. Trailing zeros trimmed. */
export function distanceLabel(metres: number): string {
  const km = metres / 1_000;
  // One decimal at most: a floor that lands on 7,500 m reads as 7.5 km, and
  // one that lands on 7,000 m must not read as 7.0 km.
  return `${Number(km.toFixed(1))} km`;
}

export function challengeMet(challenge: Challenge, session: WorkoutSession): boolean {
  if (!qualifies(challenge.area, session)) return false;

  if (challenge.area === 'run') {
    if (challenge.kind === 'establish') return true;
    return (
      session.distanceM >= challenge.minDistanceM &&
      paceOf(session) <= challenge.paceSecPerKm
    );
  }

  if (challenge.kind === 'establish') return true;
  return session.activeKcal >= challenge.activeKcal;
}

/**
 * The session on `localDate` that cleared the challenge, or null.
 *
 * The first one found, not the best: the latch is one clear per area per local
 * day, so which qualifying session gets the credit changes nothing. Two
 * qualifying sessions on one day clear the challenge once — correct rather than
 * stingy, because both have already moved tomorrow's median.
 */
export function clearingSession(
  challenge: Challenge,
  sessions: readonly WorkoutSession[],
  localDate: string,
): WorkoutSession | null {
  for (const session of sessions) {
    if (session.localDate !== localDate) continue;
    if (challengeMet(challenge, session)) return session;
  }
  return null;
}

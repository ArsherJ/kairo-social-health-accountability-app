import type { DayStatus } from './compute.ts';

/**
 * Events — Battle and Adventure (roadmap deviations #45, #48, #49).
 *
 * An Event is a **pooled** target over a window of days. It replaces the Goal,
 * and the two differ on three axes that all matter:
 *
 * - **Pooled, not per-member.** A squad goal was N-of-M: everyone had to hit it.
 *   An Event sums everyone's contribution into one bar. That reversal is the
 *   point — cooperation means the strong member carries, and carrying somebody
 *   is a reason to invite them. N-of-M made a weak member a liability.
 * - **Raw units, not points.** Battle counts active calories and Adventure
 *   counts metres. A target you can go outside and produce is one you can judge
 *   before committing to it, which points never were.
 * - **The target is snapshotted at creation, and a Challenge target is not.**
 *   See `bossHp` below — the asymmetry is deliberate and is the thing most
 *   likely to be "fixed" wrongly.
 *
 * Progress is a **read-time projection** and this module stores nothing: a day
 * Apple revises after the fact flows through by replay, exactly as it does for
 * scores. Only the completion is recorded, because it pays XP and must fire
 * once.
 *
 * Pure, like everything in this package: `today` is an argument, never a clock
 * read, so window boundaries are table-driven tests with no time mocking.
 */

export type EventKind = 'battle' | 'adventure';
export const EVENT_KINDS: readonly EventKind[] = ['battle', 'adventure'];

/**
 * What an Event counts.
 *
 * Both are raw figures already in `health_buckets`. Neither reaches hourly
 * movement, heart rate or workout sessions — `event_progress()` sums a day and
 * never groups by hour, which is the difference between a total and a routine.
 */
export type EventMetric = 'active_kcal' | 'distance_m';
export const EVENT_METRICS: readonly EventMetric[] = ['active_kcal', 'distance_m'];

export interface KairoEvent {
  id: string;
  kind: EventKind;
  metric: EventMetric;
  /**
   * The bar. **Snapshotted at creation and never recomputed** — see `bossHp`.
   */
  target: number;
  /** Inclusive. Both bounds count. */
  startsOn: string;
  /**
   * Inclusive, and **never null**, unlike a Goal's.
   *
   * A Goal could be open-ended because "reach 500,000 points, however long it
   * takes" is a coherent commitment. A boss with no deadline is not a fight —
   * it is a slowly filling bar that can never be lost, so there is nothing at
   * stake and no reason to push this week rather than next. The database
   * enforces `not null`.
   */
  endsOn: string;
}

/**
 * One day of the fight, as `pooledDays()` builds it from `event_progress()`.
 *
 * The value is the **squad's** figure for that date, not one member's:
 * completion is decided on the pooled bar, so the day list this module
 * evaluates is already pooled by the time it arrives.
 */
export interface EventDay {
  localDate: string;
  /** The metric's raw value for that date. */
  value: number;
  status: DayStatus;
}

export interface EventProgress {
  /**
   * What the squad sees. Includes today's provisional day, because a bar that
   * ignored this morning's run would be wrong on the screen it matters on.
   */
  progress: number;
  /**
   * The same number counting **final days only** — what completion is decided
   * from. Kept separate rather than chosen by a flag so both are always
   * available to a caller that needs to explain the difference.
   */
  finalProgress: number;
  target: number;
  /** 0–1, clamped. What the bar draws. */
  fraction: number;
  /** Today included when it is still inside the window; zero once past it. */
  daysRemaining: number;
  /** Days inside the window with no final score yet — days that can still contribute. */
  daysUnresolved: number;
  /** True once the end date is behind us. */
  expired: boolean;
  /**
   * Progress is keeping up with elapsed time. True whenever `met`, and true
   * before the window opens — there is nothing to be behind on yet.
   */
  onPace: boolean | null;
  /** **Final days only.** A provisional day can never complete an Event. */
  met: boolean;
}

/** Inclusive length of an Event's window, in days. Always at least 1. */
export function eventWindowDays(event: KairoEvent): number {
  return Math.max(1, daysBetween(event.startsOn, event.endsOn) + 1);
}

/** Whole days from `from` to `to`. Date-only, so DST cannot shift the count. */
function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / 86_400_000);
}

/**
 * A date-only string as a UTC instant.
 *
 * UTC deliberately, not local: these are calendar dates already resolved in the
 * user's timezone upstream (§2), so re-interpreting them in any zone would be
 * the one thing that could move a window boundary by a day.
 */
function utcOf(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function withinWindow(event: KairoEvent, localDate: string): boolean {
  // Lexicographic comparison is correct and cheap for zero-padded ISO dates.
  return localDate >= event.startsOn && localDate <= event.endsOn;
}

export function evaluateEvent(
  event: KairoEvent,
  days: readonly EventDay[],
  today: string,
): EventProgress {
  let progress = 0;
  let finalProgress = 0;
  const finalDates = new Set<string>();

  for (const day of days) {
    if (!withinWindow(event, day.localDate)) continue;
    const value = Number.isFinite(day.value) && day.value > 0 ? day.value : 0;
    progress += value;
    if (day.status === 'final') {
      finalProgress += value;
      finalDates.add(day.localDate);
    }
  }

  const windowDays = eventWindowDays(event);
  const expired = today > event.endsOn;

  // Today counts as remaining — it is still playable. Before the event starts
  // the whole window is ahead, which is why this clamps at both ends rather
  // than trusting the subtraction.
  const daysRemaining = expired
    ? 0
    : today < event.startsOn
      ? windowDays
      : daysBetween(today, event.endsOn) + 1;

  // Distinct *dates* that have finalized, not rows: an Event pools several
  // participants, so counting rows would report a six-person squad's first day
  // as six finalized days and declare the window spent on day one. `pooledDays`
  // already collapses to one row per date, and this Set is what keeps the
  // count right even if a caller hands over raw per-participant rows.
  const daysUnresolved = Math.max(0, windowDays - finalDates.size);

  const met = event.target > 0 && finalProgress >= event.target;

  // Pace needs a schedule and an Event always has one. Before the first day
  // there is nothing to be behind on, so `elapsed <= 0` reports true rather
  // than dividing by zero.
  const elapsed = windowDays - daysRemaining;
  const onPace =
    met || elapsed <= 0 ? true : progress / elapsed >= event.target / windowDays;

  return {
    progress,
    finalProgress,
    target: event.target,
    fraction: event.target > 0 ? Math.min(1, progress / event.target) : 0,
    daysRemaining,
    daysUnresolved,
    expired,
    onPace,
    met,
  };
}

/**
 * The middle value. Zero for no history — the caller applies the floor.
 *
 * A median rather than a mean, and for the reason `challenge.ts` gives: one
 * marathon in a fortnight would drag a mean far enough to set a boss the squad
 * cannot beat, and "the app punished me for a good day" is the worst thing a
 * cooperative mechanic can say.
 */
export function trailingMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type EventDifficulty = 'skirmish' | 'standard' | 'raid';

/**
 * What share of the squad's normal pooled output the boss costs.
 *
 * `standard` is deliberately **under 1**. A cooperative mechanic that most
 * squads lose is a mechanic most squads stop using, and a first Battle is the
 * moment a squad learns that pooling works at all — so the default is winnable
 * by carrying on as they already were, and `raid` is where pushing is required.
 */
export const EVENT_DIFFICULTIES: Readonly<Record<EventDifficulty, number>> = {
  skirmish: 0.6,
  standard: 0.85,
  raid: 1.15,
};

/**
 * Floor, per member per day, so a squad with no history still gets a fight.
 *
 * Without it a brand-new squad's pooled median is 0 and the boss is defeated in
 * the same second it is created, which reads as the feature being broken rather
 * than as a gift. 150 kcal is roughly half an hour's brisk walk.
 */
export const BOSS_HP_FLOOR_PER_MEMBER_DAY = 150;

/**
 * The boss's HP. **Derived once, at creation, and stored on the row.**
 *
 * This is the deliberate asymmetry with `challenge.ts`, and it is the question
 * the next reader will have. A Challenge derives its target fresh on every read,
 * and that is correct *there*: nothing stateful exists for a retroactive Apple
 * revision to invalidate, and the trailing median moving is the mechanic — you
 * clear one and the next is harder.
 *
 * An Event is the opposite case and inherits §8's Goal invariant instead. A
 * target that moves mid-window silently re-grades every day already counted,
 * which is precisely why a Challenge had to be a sibling concept rather than a
 * `GoalKind`. **A boss whose HP rises because the squad got fitter mid-fight is
 * that bug wearing a hat.** So the number is computed once here, written to
 * `challenge_events.target`, and thereafter is a constant — while *progress*
 * against it stays a read-time projection, so revisions still flow through. The
 * target is fixed; the progress is replayed.
 *
 * `pooledMedianDaily` is the median of the squad's **summed** daily output over
 * the trailing 14 days — one figure per date, summed across participants first,
 * then the median of those. Taking a median per member and adding them would
 * describe a squad nobody has ever been in.
 */
export function bossHp(input: {
  pooledMedianDaily: number;
  windowDays: number;
  members: number;
  difficulty: EventDifficulty;
}): number {
  const windowDays = Math.max(1, Math.floor(input.windowDays));
  const members = Math.max(1, Math.floor(input.members));
  const median = Number.isFinite(input.pooledMedianDaily)
    ? Math.max(0, input.pooledMedianDaily)
    : 0;

  const scaled = median * windowDays * EVENT_DIFFICULTIES[input.difficulty];
  const floor = BOSS_HP_FLOOR_PER_MEMBER_DAY * members * windowDays;

  // Rounded to the nearest hundred: this number is printed on a card and read
  // aloud, and "4,317 HP" claims a precision a trailing median does not have.
  return Math.max(100, Math.round(Math.max(scaled, floor) / 100) * 100);
}

/** XP for a one-day Event. Longer windows scale from here, sub-linearly. */
export const BASE_EVENT_COMPLETION_XP = 30;

/**
 * The ceiling on a single Event's XP.
 *
 * `MAX_REALISTIC_DAILY_XP` is 200, so a heavy year of daily play is on the
 * order of 70,000 XP. 500 keeps the largest possible Event worth about two and
 * a half strong days — a real reward that cannot substitute for showing up.
 */
export const MAX_EVENT_COMPLETION_XP = 500;

/**
 * XP for completing an Event, scaled by how long it ran.
 *
 * Square-root scaling, so a 30-day Event pays more than a 7-day one without a
 * year-long one paying fifty times a week-long one. Capped regardless: the
 * cheapest possible exploit is an Event with an absurd window and a trivial
 * target, and the cap is what makes that not worth doing.
 *
 * **Scaled by the window committed to, not by when it landed.** An Event
 * cleared on day two of a month-long window pays the month's XP, because the
 * reward is a property of the commitment made. `completedOn` is taken so the
 * signature matches `goalCompletionXp`'s, which it replaces, and so a future
 * open-ended variant has somewhere to put the span — it is deliberately unused.
 */
export function eventCompletionXp(event: KairoEvent, _completedOn: string): number {
  const scaled = BASE_EVENT_COMPLETION_XP * Math.sqrt(eventWindowDays(event));
  return Math.min(MAX_EVENT_COMPLETION_XP, Math.round(scaled));
}

/**
 * One row of `event_progress()`, as PostgREST hands it over.
 *
 * Numeric columns arrive as strings, and `value` arrives as null behind the
 * reciprocal consent gate — which is why both are widened here rather than
 * asserted away at the call site.
 */
export interface EventProgressRow {
  user_id: string;
  character_name: string;
  species: string | null;
  local_date: string;
  /** This member's own contribution, or null behind the consent gate. */
  value: number | string | null;
  /** The whole squad's figure for that date. Never withheld. */
  pooled_value: number | string;
  status: string;
}

/**
 * The squad's day list, from the RPC's per-participant rows.
 *
 * Lives here, in the keystone, rather than beside either caller: the client's
 * bar and `finalize-days`' grading must agree exactly, and a second copy is a
 * second chance to get the two rules below wrong.
 *
 * **Take each date once.** `event_progress()` repeats `pooled_value` on every
 * participant's row — it is a window function over the date — so summing it
 * naively multiplies every day by the squad size and reports a six-person squad
 * as six times fitter than it is. That is the single easiest mistake to make
 * against this RPC.
 *
 * **Read the pooled column, never `value`.** `value` is behind the consent
 * gate, and the gate keys off the *viewer's* profile rather than off their
 * role — so `finalize-days`, which is service-role but passes a candidate who
 * may never have consented, would see null on every row, pool the whole fight
 * to zero and silently never complete anything.
 *
 * **A date is final only when every participant's day is.** The pooled figure
 * for a date mixes contributions whose statuses can differ — a squad spans
 * timezones, so one member's day finalizes hours before another's. Taking the
 * first row's status would let a still-revisable contribution pay XP, which is
 * the one thing `met`'s final-days-only rule exists to prevent. Conservative in
 * the safe direction: the date resolves when the last member's does.
 */
export function pooledDays(rows: readonly EventProgressRow[]): EventDay[] {
  const byDate = new Map<string, EventDay>();

  for (const row of rows) {
    const isFinal = row.status === 'final';
    const seen = byDate.get(row.local_date);
    if (seen === undefined) {
      byDate.set(row.local_date, {
        localDate: row.local_date,
        value: Number(row.pooled_value ?? 0),
        status: isFinal ? 'final' : 'provisional',
      });
      continue;
    }
    if (!isFinal) seen.status = 'provisional';
  }

  return [...byDate.values()];
}

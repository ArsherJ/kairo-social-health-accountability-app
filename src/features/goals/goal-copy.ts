// Relative imports, not `@/`: this module is exercised by vitest, whose config
// does not carry Metro's path alias. Every other pure module under test does the
// same.
import type { GoalProgress } from '../../../packages/kairo-core/src/goal.ts';

/**
 * What a goal says about itself.
 *
 * Pure and separate from the components, on the `program-copy.ts` precedent: the
 * wording is what a person actually reads, it has more edge cases than the
 * layout does (one day left, already done, window not open yet, mathematically
 * dead), and every one of them is a sentence that can be wrong without anything
 * throwing.
 */

export type GoalKind = 'cumulative' | 'consistency';

/** Thousands separators, matching the server's push copy. */
function num(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The progress line: where you are against what you promised.
 *
 * A consistency goal counts days and a cumulative goal counts points, and the
 * unit has to be said — "18 of 25" alone is ambiguous between the two, and this
 * is the only place either number appears.
 */
export function progressLine(kind: GoalKind, progress: GoalProgress): string {
  return kind === 'consistency'
    ? `${num(progress.progress)} of ${num(progress.target)} days`
    : `${num(progress.progress)} of ${num(progress.target)}`;
}

/**
 * The status line under the meter.
 *
 * Ordered by what the reader most needs to know, which is not the same as the
 * order the fields appear in `GoalProgress`: done beats everything, then whether
 * it can still be reached at all, then how long is left.
 */
export function statusLine(progress: GoalProgress): string {
  if (progress.met) return 'Done.';
  if (!progress.stillPossible) return 'Out of reach for this window.';

  const days = progress.daysRemaining;
  // Open-ended: no deadline to count down and no pace to be behind, so the line
  // says the one true thing about it rather than inventing a race.
  if (days === null) return 'No deadline · keep going';
  if (days === 0) return 'Window closed.';

  const left = days === 1 ? 'Last day' : `${num(days)} days left`;
  // "On pace" is only worth saying while there is still a race. Naming the
  // shortfall is more use than a verdict, so behind-pace gets the number.
  return progress.onPace ? `${left} · on pace` : `${left} · behind pace`;
}

/**
 * The tone the status line and the meter fill should carry.
 *
 * Three values because the app has three colour families with one job each
 * (`src/theme.ts`): sage for a goal that is fine, accent for one that is done
 * and therefore yours, burnt for one slipping away. Returning a token name
 * rather than a colour keeps the mapping in the component that owns the palette.
 */
export function goalTone(progress: GoalProgress): 'done' | 'ok' | 'behind' {
  if (progress.met) return 'done';
  if (!progress.stillPossible) return 'behind';
  if (progress.daysRemaining === 0) return 'behind';
  // `onPace` is null only for an open-ended goal, which cannot be behind
  // anything — so the absence of a verdict reads as 'ok', not as a failure.
  return progress.onPace !== false ? 'ok' : 'behind';
}

/**
 * How full the meter is, 0–1.
 *
 * Clamped at 1: overshooting a target is common and a bar wider than its track
 * renders as a layout bug. The overshoot is not hidden — `progressLine` still
 * states the real number.
 */
export function fillFraction(progress: GoalProgress): number {
  if (progress.target <= 0) return 0;
  return Math.min(1, progress.progress / progress.target);
}

/**
 * Where the pace marker goes, 0–1, or null when there is nothing to mark.
 *
 * Null before the window opens and after it closes: a marker at 0 or 1 says
 * nothing, and a marker on a finished goal invites a comparison that no longer
 * matters. Null once met, for the same reason.
 *
 * Null for an open-ended goal too, and that is the mechanic rather than a gap:
 * the marker is "where the fill should be by today", which is exactly the
 * question a goal with no deadline declines to ask. `windowDays` arrives null
 * from `goalWindowDays()` in that case.
 */
export function paceFraction(
  progress: GoalProgress,
  windowDays: number | null,
): number | null {
  if (progress.met || windowDays === null || windowDays <= 0) return null;
  if (progress.daysRemaining === null) return null;
  const elapsed = windowDays - progress.daysRemaining;
  if (elapsed <= 0 || elapsed >= windowDays) return null;
  return elapsed / windowDays;
}

/** "31 Jan" — short, and the year only when it is not the window's own. */
export function shortDate(localDate: string, todayLocalDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const month = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][m - 1];
  const sameYear = todayLocalDate.slice(0, 4) === String(y);
  return sameYear ? `${d} ${month}` : `${d} ${month} ${y}`;
}

/**
 * The deadline chip on a goal card: "by 30 Jan", "ended 12 Jan", "no deadline".
 *
 * One function rather than a ternary in each card, because a null `ends_on` has
 * to be handled at every one of those sites and a missed one is a crash
 * (`localeCompare` on null) rather than a wrong word.
 */
export function deadlineLine(endsOn: string | null, today: string): string {
  if (endsOn === null) return 'no deadline';
  if (endsOn < today) return `ended ${shortDate(endsOn, today)}`;
  return `by ${shortDate(endsOn, today)}`;
}

/**
 * The window line on the goal detail screen: the span, its length, and the daily
 * bar when there is one.
 *
 * An open-ended goal states its start and says so, rather than pretending to a
 * length it does not have — `windowDays` arrives null for exactly that case.
 */
export function windowLine(input: {
  startsOn: string;
  endsOn: string | null;
  today: string;
  windowDays: number | null;
  dailyTarget: number | null;
}): string {
  const daily =
    input.dailyTarget === null ? '' : ` · ${num(input.dailyTarget)} a day`;

  if (input.endsOn === null || input.windowDays === null) {
    return `From ${shortDate(input.startsOn, input.today)} · no end date${daily}`;
  }

  const span = `${shortDate(input.startsOn, input.today)} – ${shortDate(input.endsOn, input.today)}`;
  return `${span} · ${num(input.windowDays)} days${daily}`;
}

/** "Everyone" reads better than "3 of 3" when the requirement is the whole roster. */
export function squadRequirementLine(
  membersMet: number,
  requiredMembers: number,
  rosterSize: number,
): string {
  const whole = requiredMembers >= rosterSize;
  const need = whole ? 'everyone' : `${num(requiredMembers)} of ${num(rosterSize)}`;
  return `${num(membersMet)} hit it · needs ${need}`;
}

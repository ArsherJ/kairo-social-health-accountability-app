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
  return progress.onPace ? 'ok' : 'behind';
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
 */
export function paceFraction(progress: GoalProgress, windowDays: number): number | null {
  if (progress.met || windowDays <= 0) return null;
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

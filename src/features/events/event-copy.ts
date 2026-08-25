// Relative imports, not `@/`: this module is exercised by vitest, whose config
// does not carry Metro's path alias. Every other pure module under test does the
// same, and `goal-copy.ts` reached kairo-core exactly this way before it.
import type {
  EventMetric,
  EventProgress,
  KairoEvent,
} from '../../../packages/kairo-core/src/event.ts';

/**
 * What an Event says about itself.
 *
 * Pure and separate from the components, on the `program-copy.ts` precedent:
 * the wording is what a person actually reads, it has more edge cases than the
 * layout does (one day left, already beaten, window closed short), and every
 * one of them is a sentence that can be wrong without anything throwing.
 *
 * Named in the unit the squad **produces**, never in points. That is not only
 * the points rule (deviation #30): a Battle's target *is* a number of calories,
 * so points would be a translation away from the thing itself.
 */

/**
 * Thousands separators, matching the server's push copy.
 *
 * Hand-rolled rather than `toLocaleString()`, which `goal-copy.ts` also
 * declined: the result would depend on the device's locale and on whether the
 * Node running the tests was built with full ICU, so the string under test
 * would not be the string on the screen.
 */
function num(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Metres as kilometres, trimmed. 42,000 is "42 km", 7,500 is "7.5 km". */
function distanceWords(metres: number): string {
  const km = metres / 1_000;
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

/** A figure in the Event's own unit — kilometres for distance, bare for kcal. */
function amount(metric: EventMetric, value: number): string {
  return metric === 'distance_m' ? distanceWords(value) : num(value);
}

export function eventHeadline(event: Pick<KairoEvent, 'kind' | 'metric' | 'target'>): string {
  return event.kind === 'adventure'
    ? `${amount(event.metric, event.target)} to cover`
    : `${amount(event.metric, event.target)} kcal to beat`;
}

/**
 * The line under the bar.
 *
 * Clause · clause, matching the home screen's standing and detail lines and the
 * race card — one rhetorical pattern and one glyph across the app.
 *
 * **Pace is named only when it is bad.** "On pace" is not actionable and adds a
 * clause to every card in the ordinary case; "behind pace" is the one state
 * that tells the squad to do something. Once `met`, nothing else is said at
 * all — a win with a pace note attached reads as a caveat.
 *
 * `metric` is optional and defaults to calories, so the common caller says
 * nothing. A distance Event has to pass it or the line prints metres, which is
 * a different-looking number for the same fact.
 */
export function eventStatusLine(
  progress: EventProgress,
  options: { metric?: EventMetric } = {},
): string {
  if (progress.met) return 'Beaten';

  const metric = options.metric ?? 'active_kcal';
  const where = `${amount(metric, progress.progress)} of ${amount(metric, progress.target)}`;
  if (progress.expired) return `${where} · time up`;

  const days = `${num(progress.daysRemaining)} ${progress.daysRemaining === 1 ? 'day' : 'days'} left`;
  return progress.onPace === false ? `${where} · behind pace, ${days}` : `${where} · ${days}`;
}

/**
 * The whole card as one utterance.
 *
 * An Event card draws a name, a target, a bar, a figure and a countdown. Left
 * as separate accessibility elements that is five stops for a card whose
 * content is two sentences — the leaderboard's failure in miniature, which is
 * why `row-label.ts` exists and why this does too.
 */
export function eventLabel(
  title: string,
  event: KairoEvent,
  progress: EventProgress,
): string {
  return `${title}. ${eventHeadline(event)}. ${eventStatusLine(progress, { metric: event.metric })}.`;
}

/** "31 Jan" — short, and the year only when it is not the reader's own. */
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
 * The deadline chip on an Event card: "by 7 Sep", "ended 7 Sep".
 *
 * No "no deadline" branch, unlike the Goal version it replaces: `events_need_end`
 * makes an Event's end date NOT NULL, because a boss with no deadline is a bar
 * that can never be lost.
 */
export function deadlineLine(endsOn: string, today: string): string {
  return endsOn < today ? `ended ${shortDate(endsOn, today)}` : `by ${shortDate(endsOn, today)}`;
}

/** The window line on the detail screen: the span and its length. */
export function eventWindowLine(
  event: Pick<KairoEvent, 'startsOn' | 'endsOn'>,
  today: string,
): string {
  const span = `${shortDate(event.startsOn, today)} – ${shortDate(event.endsOn, today)}`;
  const days = Math.round(
    (Date.parse(`${event.endsOn}T00:00:00Z`) - Date.parse(`${event.startsOn}T00:00:00Z`)) /
      86_400_000,
  ) + 1;
  return `${span} · ${num(Math.max(1, days))} days`;
}

/**
 * How full the meter is, 0–1.
 *
 * Reads `fraction`, which `evaluateEvent` already clamps: overshooting a boss is
 * common and a bar wider than its track renders as a layout bug. The overshoot
 * is not hidden — `eventStatusLine` still states the real number.
 */
export function fillFraction(progress: EventProgress): number {
  return Math.min(1, Math.max(0, progress.fraction));
}

/**
 * Where the pace marker goes, 0–1, or null when there is nothing to mark.
 *
 * Null before the window opens and after it closes: a marker at 0 or 1 says
 * nothing, and a marker on a beaten boss invites a comparison that no longer
 * matters. Null once met, for the same reason.
 */
export function paceFraction(
  progress: EventProgress,
  windowDays: number,
): number | null {
  if (progress.met || windowDays <= 0) return null;
  const elapsed = windowDays - progress.daysRemaining;
  if (elapsed <= 0 || elapsed >= windowDays) return null;
  return elapsed / windowDays;
}

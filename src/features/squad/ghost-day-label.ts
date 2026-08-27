/**
 * What to call one of your own past days on the race track.
 *
 * `race-label.ts` prefixes a ghost with "your", so this has to produce
 * something that reads after it: "your Saturday", never "your 2026-08-22".
 *
 * **A weekday only while it is unambiguous.** Inside a week there is exactly
 * one Saturday and naming it is warmer and shorter than a date. Past that,
 * `ghostRivals` can hand back two days a week apart — it takes the three most
 * recent days that *scored*, and a quiet stretch puts gaps between them — so
 * two lanes would both read "your Saturday" and the track would be describing
 * one day twice. Beyond six days it falls back to the date, which is never
 * ambiguous.
 *
 * Pure and tested in Node: it takes `today` rather than reading a clock, for
 * the same reason nothing in `@kairo/core` does. It lives here rather than
 * there because it does locale work, and that package imports nothing.
 */

/** Days back within which a weekday name still names exactly one day. */
const WEEKDAY_WINDOW = 6;

/** `YYYY-MM-DD` parsed as UTC, so the device's own offset cannot shift it. */
function parse(localDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function ghostDayLabel(localDate: string, today: string): string {
  const day = parse(localDate);
  const now = parse(today);
  // Unparseable in, unparseable out — never a guess. The lane still draws.
  if (!day || !now) return localDate;

  const daysAgo = Math.round((now.getTime() - day.getTime()) / 86_400_000);

  if (daysAgo >= 1 && daysAgo <= WEEKDAY_WINDOW) {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(day);
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(day);
}

/**
 * The IANA zone the device is currently in.
 *
 * profiles.timezone defaults to Asia/Manila, and every local-day boundary,
 * finalization window and leaderboard date keys off it (§2). An OFW in Dubai
 * whose zone is never captured would have their day close eight hours early,
 * silently and permanently — which is precisely the case the per-user-day
 * design exists to serve. So it is written at profile creation and re-checked
 * on foreground.
 */
export function deviceTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && zone.length > 0 ? zone : 'Asia/Manila';
}

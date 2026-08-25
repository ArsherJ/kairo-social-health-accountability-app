/**
 * Where a notification tap should land.
 *
 * The decision half of push routing, split from the performing half for the
 * same reason `auth/route.ts` is split from the gate that navigates and
 * `ask-policy.ts` is split from `permission.ts`: this file imports nothing, so
 * it runs in plain Node under the root Vitest config. Nothing here may import
 * `expo-router`, `expo-notifications` or the `@/` alias — none of the three
 * resolve there.
 *
 * **The payload is not ours.** It arrives from whatever version of the Edge
 * Functions is deployed, which is not necessarily the version in this repo —
 * that mismatch already took scoring down for two days in August 2026. So
 * every field is treated as untrusted input and an unrecognised payload
 * returns `null` rather than throwing. A push from a future server must not
 * crash a beta build on tap.
 *
 * Two senders exist today:
 *   dispatch-notifications → { trigger, localDate, screen: 'squad' | 'character' }
 *   finalize-days          → { trigger: 'event_completed', screen: 'events', eventId }
 *                          → { trigger: 'challenge_cleared', screen: 'train', localDate }
 *
 * A third shape is **historical** and still routed: pushes sent before the
 * 2026-08-25 Goals → Events rename carry `{ screen: 'goals', goalId }`, and one
 * sent minutes before the deploy can be tapped minutes after it.
 */

/**
 * The routes a push may address, as literals rather than `string`.
 *
 * Typed routes are on (`app.config.ts`, `experiments.typedRoutes`), so this
 * union is what lets the hook hand the result straight to the router without a
 * cast that would defeat the checking.
 */
export type NotificationDestination = '/' | '/squad' | '/train' | `/event/${string}`;

/**
 * The character tab, and the fallback for anything addressable but underspecified.
 *
 * Note it is `/` — the tabs group's index — and emphatically **not**
 * `/character`, which is the onboarding body picker in `app/(onboard)/`. The
 * two names invite exactly one confusion and it is silent: `redirectTarget()`
 * would bounce a ready user straight back out of onboarding, so the bug shows
 * up as a flash on tap rather than as an error.
 */
const CHARACTER_TAB = '/' as const;

/**
 * An event id we are willing to interpolate into a path.
 *
 * The ids are uuids, but this deliberately does not test for a uuid: the check
 * that matters is that the value cannot alter the shape of the route it is
 * being spliced into. A slash, whitespace or an unbounded length are the ways
 * that happens, and rejecting them keeps a malformed payload landing on a real
 * screen instead of a fabricated one.
 */
function isAddressableId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 && /^[\w-]+$/.test(value);
}

export function notificationTarget(data: unknown): NotificationDestination | null {
  if (typeof data !== 'object' || data === null) return null;

  const { screen, eventId } = data as { screen?: unknown; eventId?: unknown };

  switch (screen) {
    case 'squad':
      return '/squad';
    case 'character':
      return CHARACTER_TAB;
    case 'train':
      // The Challenges route. A stacked route rather than a tab, so this is a
      // push onto the shell — which is exactly what a tap should do.
      return '/train';
    case 'events':
      // The most specific destination the product has — the boss that just went
      // down. Without a usable id there is still something worth showing, so
      // this degrades to the character tab rather than swallowing the tap: the
      // notification already promised the user that something happened, and
      // `/event/undefined` renders an error where the tab renders the app.
      return isAddressableId(eventId) ? `/event/${eventId}` : CHARACTER_TAB;
    case 'goals':
      // **Historical.** Pushes sent before the 2026-08-25 rename (deviation
      // #45). The goal routes are gone, so this lands on the character tab
      // rather than nowhere — a tap that goes nowhere is indistinguishable from
      // push being broken, and `notification_log.kind` is free text, so these
      // payloads genuinely still exist.
      return CHARACTER_TAB;
    default:
      return null;
  }
}

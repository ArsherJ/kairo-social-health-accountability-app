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
 *   dispatch-notifications → { trigger: 'daily_digest', localDate, screen: 'today' }
 *   finalize-days          → { trigger: 'challenge_cleared', screen: 'train', localDate }
 *
 * Four shapes are **historical** and still routed, because a push sent minutes
 * before a deploy can be tapped minutes after it: `{ screen: 'goals', goalId }`
 * from before the 2026-08-25 Goals → Events rename, `{ screen: 'events' }` from
 * before the Battle was retired on 2026-09-06 (deviation #66), and
 * `{ screen: 'squad' }` and `{ screen: 'character' }` from the three scheduled
 * pushes deviation #52 retired. `'today'` is not historical — it is live — but
 * its *route* moved on 2026-08-27 and the payload did not.
 */

/**
 * The routes a push may address, as literals rather than `string`.
 *
 * Typed routes are on (`app.config.ts`, `experiments.typedRoutes`), so this
 * union is what lets the hook hand the result straight to the router without a
 * cast that would defeat the checking.
 */
export type NotificationDestination = '/' | '/flock' | '/sky' | '/train';

/**
 * The Today tab, and the fallback for anything addressable but underspecified.
 *
 * It is `/` — the tabs group's index. Today *became* the index on 2026-08-27
 * when the character tab dissolved, so this constant changed meaning without
 * changing value, and the historical `screen: 'character'` payloads kept
 * working for free.
 *
 * Emphatically **not** `/character`, which does not exist any more either: it
 * was the onboarding species picker, retired with the one-Kairo change. A
 * future route by that name would inherit exactly one silent confusion.
 */
const HOME_TAB = '/' as const;

export function notificationTarget(data: unknown): NotificationDestination | null {
  if (typeof data !== 'object' || data === null) return null;

  const { screen } = data as { screen?: unknown };

  switch (screen) {
    case 'today':
      // The digest's destination (deviation #52). Today is the index tab since
      // 2026-08-27; `/today` no longer resolves and must not be returned.
      return HOME_TAB;
    case 'squad':
      // **Historical**, from the retired evening loop. The squad tab is the
      // Flock tab now, and a tap that goes nowhere is indistinguishable from
      // push being broken.
      return '/flock';
    case 'character':
      // **Historical**, from the retired mid-morning nudge. The character tab
      // is gone and its hero is the first thing on Today.
      return HOME_TAB;
    case 'train':
      // The Challenges route. A stacked route rather than a tab, so this is a
      // push onto the shell — which is exactly what a tap should do.
      return '/train';
    case 'events':
      // **Historical.** The Battle was retired on 2026-09-06 (deviation #66)
      // and both event routes went with it, so the `eventId` this payload
      // carries no longer addresses anything. It lands on the Flock tab —
      // the squad the fight belonged to — rather than nowhere, because a tap
      // that goes nowhere is indistinguishable from push being broken.
      return '/flock';
    case 'goals':
      // **Historical.** Pushes sent before the 2026-08-25 rename (deviation
      // #45). The goal routes are gone, so this lands on the Today tab rather
      // than nowhere — a tap that goes nowhere is indistinguishable from push
      // being broken, and `notification_log.kind` is free text, so these
      // payloads genuinely still exist.
      return HOME_TAB;
    default:
      return null;
  }
}

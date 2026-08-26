import { createMMKV } from 'react-native-mmkv';

/**
 * Once per account per local day, for the events that measure *engagement*
 * rather than a funnel step.
 *
 * `milestone-store.ts` answers a different question — once **ever**, for the
 * activation funnel — and `useAppOpenTelemetry`'s marker answers a third, once
 * per session. Reusing either here would be wrong in opposite directions: a
 * once-ever marker would record `race_seen` for one day and never again, and a
 * per-session one would count relaunches. Neither answers "did this account see
 * a race today", which is the cohort split the pivot exists to measure.
 *
 * Not a render guard either. A `race_seen` fired on every render would measure
 * scrolling.
 *
 * **One key per marker, holding the last local date it fired on** — not one key
 * per day, which would grow without bound and could not be enumerated for
 * `clearDailyMarkers` (MMKV has no prefix-delete). The date is the *user's own*
 * local date, never the device's: the whole app is keyed that way, and a
 * traveller crossing a date line would otherwise record two days or none.
 *
 * The same storage id as the milestone store, because the two have the same
 * lifetime and sign-out has to reach both.
 */
const storage = createMMKV({ id: 'kairo.telemetry' });

/**
 * A quest's slot on the Today tab, rather than its id.
 *
 * Three a day, so three keys — where keying by quest id would put a key per
 * catalogue entry in storage and, worse, invite the id into the payload, which
 * would make `app_events` a per-quest leaderboard nobody asked for.
 */
export type DailyMarker = 'race_seen' | `quest_cleared.${0 | 1 | 2}`;

/** Everything this store knows about, so `clearDailyMarkers` can enumerate it. */
const ALL_MARKERS: readonly DailyMarker[] = [
  'race_seen',
  'quest_cleared.0',
  'quest_cleared.1',
  'quest_cleared.2',
];

function key(userId: string, marker: DailyMarker): string {
  return `daily.v1.${userId}.${marker}`;
}

/**
 * Claim today for `marker`, returning whether this call is the one that got it.
 *
 * Claim-then-act rather than act-then-mark, the same order `milestone-store`
 * uses: two cards resolving in the same frame must not both fire. The cost is
 * that a failed write is not retried today — one row missing from an analysis,
 * against a double count in every one.
 */
export function claimDaily(
  userId: string,
  marker: DailyMarker,
  localDate: string,
): boolean {
  const k = key(userId, marker);
  if (storage.getString(k) === localDate) return false;
  storage.set(k, localDate);
  return true;
}

/**
 * Clear one account's daily markers, so the next account to sign in on this
 * device starts its own day fresh rather than inheriting one.
 *
 * Called from `signOut()`, beside `clearMilestones`.
 */
export function clearDailyMarkers(userId: string): void {
  for (const marker of ALL_MARKERS) storage.remove(key(userId, marker));
}

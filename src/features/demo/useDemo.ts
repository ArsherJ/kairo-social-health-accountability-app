import type { UseQueryResult } from '@tanstack/react-query';
import { useDemoStore } from './store.ts';

/**
 * The dev demo override, applied at the *hook* layer.
 *
 * **Why not `queryClient.setQueryData`:** `lib/query-client.ts` sets
 * `staleTime: 30_000`, and `useSquadRealtime` invalidates on every broadcast,
 * reconnect and foreground while `useHealthSync` invalidates the profile, all
 * boards and the score key on every sync. `invalidateQueries` refetches
 * *active* queries regardless of `staleTime`, so injected data is wiped within
 * about half a minute. Overriding here is the only durable option short of
 * mocking the Supabase client, for which this repo has no pattern
 * (`docs/roadmap.md`, Phase 1 follow-up #5).
 *
 * **The subtlety that would otherwise cost an hour:** every screen guards on
 * *status*, not on data — `{!score.isPending && …}`, `standing.kind ===
 * 'unknown'` when `board.data` is undefined, `hasSquad === undefined`. So the
 * override has to report a settled, successful query, or the fixtures would be
 * supplied correctly and rendered nowhere.
 */

/** True only in a dev build with the toggle on. Compiled out of release. */
export function useDemoOn(): boolean {
  const on = useDemoStore((s) => s.on);
  return __DEV__ && on;
}

/** When the toggle was switched on — the anchor for the fixtures' timestamps. */
export function useDemoSince(): number {
  return useDemoStore((s) => s.since);
}

const noopRefetch = () => Promise.resolve(undefined as never);

/**
 * A settled, successful query result carrying `data`.
 *
 * Cast rather than assembled field-by-field against the exact union member:
 * `UseQueryResult` gains properties across TanStack minor versions, and a dev
 * affordance is not worth a build break on an upgrade. Everything the app
 * actually reads — the status booleans, `data`, `error`, `refetch` — is set
 * explicitly above the cast.
 */
export function demoResult<T>(data: T): UseQueryResult<T, Error> {
  return {
    data,
    error: null,
    status: 'success',
    fetchStatus: 'idle',
    isPending: false,
    isLoading: false,
    isSuccess: true,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isFetching: false,
    isRefetching: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isPlaceholderData: false,
    isPaused: false,
    isStale: false,
    dataUpdatedAt: Date.now(),
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    errorUpdateCount: 0,
    promise: Promise.resolve(data),
    refetch: noopRefetch,
  } as unknown as UseQueryResult<T, Error>;
}

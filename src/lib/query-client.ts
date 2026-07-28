import { QueryClient } from '@tanstack/react-query';

/**
 * Server-cache defaults tuned for a leaderboard that also receives Realtime
 * pushes: queries are the cold-start path, broadcasts keep them fresh, so
 * aggressive background polling would just burn a mobile data plan.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      // React Native has no window focus; refetch is driven by AppState and
      // Realtime instead.
      refetchOnWindowFocus: false,
    },
  },
});

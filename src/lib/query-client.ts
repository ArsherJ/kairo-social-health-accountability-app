import NetInfo from '@react-native-community/netinfo';
import { onlineManager, QueryClient } from '@tanstack/react-query';

/**
 * Teach TanStack Query what "offline" means on a phone.
 *
 * Its default online detection is the browser's — `window.addEventListener`
 * on `online`/`offline` — which React Native does not have, so without this
 * the client believes it is **permanently online**. The cost is not theoretical:
 * a query fired on the subway spends its `retry: 2` immediately and lands in
 * an error state, where the honest behaviour is to pause and run when the
 * connection returns. The character screen's retry affordance and the
 * `profile-error` cover in `app/_layout.tsx` were both absorbing that.
 *
 * `isInternetReachable` is deliberately preferred over `isConnected`, with a
 * fallback for the null it reports before the first reachability probe
 * resolves: a phone attached to a captive-portal wifi is `isConnected` and
 * cannot reach Supabase.
 */
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isInternetReachable ?? state.isConnected));
  }),
);

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

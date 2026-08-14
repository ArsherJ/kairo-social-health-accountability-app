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
 * This is TanStack's documented React Native recipe, unmodified. It first
 * shipped here reading `isInternetReachable` instead, reasoning that a phone on
 * a captive-portal wifi is `isConnected` and still cannot reach Supabase. That
 * reasoning is true and the trade is still wrong, because the two failures are
 * not symmetrical: `isInternetReachable` is NetInfo's own probe against an
 * unrelated third-party endpoint, so a network that blocks *that* — while
 * Supabase is perfectly reachable — reports offline forever. Queries then
 * `pause()` rather than run, which never errors, which the gate renders as an
 * endless spinner. A captive portal, by contrast, produces an ordinary failed
 * request that the retry panel already handles.
 *
 * Prefer the false positive that fails loudly over the false negative that
 * hangs. `fetch-timeout.ts` is what catches the captive-portal case.
 */
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected));
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

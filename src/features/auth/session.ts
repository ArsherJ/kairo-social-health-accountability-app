import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { clearSyncState } from '@/features/health/storage.ts';
import { unregisterDeviceToken } from '@/features/notifications/permission.ts';
import { queryClient } from '@/lib/query-client.ts';
import { supabase } from '@/lib/supabase.ts';

type SessionState = {
  session: Session | null;
  /** True until the persisted session has been read from the Keychain. */
  loading: boolean;
};

export const useSessionStore = create<SessionState>(() => ({
  session: null,
  loading: true,
}));

/**
 * Starts one listener for the app's lifetime. Called from the root layout.
 *
 * getSession() resolves the Keychain-restored session; onAuthStateChange
 * covers everything after. Both write the same slice, so a cold start and a
 * later sign-in are indistinguishable to consumers.
 */
export function startSessionListener(): () => void {
  void supabase.auth.getSession().then(({ data }) => {
    useSessionStore.setState({ session: data.session, loading: false });
  });

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    useSessionStore.setState({ session, loading: false });
  });

  return () => data.subscription.unsubscribe();
}

/**
 * Clearing the query cache is not optional: profile and score rows are cached
 * per user id, and a second sign-in on the same device would otherwise render
 * the previous account's data until each query refetched.
 *
 * The clear runs in `finally` because `signOut()` can throw: GoTrueClient
 * catches auth-domain errors and returns them as `{ error }`, but a genuine
 * network failure (device offline mid-request) is rethrown. If the clear only
 * ran after a successful await, that rethrow would skip it and leave the
 * previous user's rows — including profile height, weight and birth year —
 * resident in the cache for the next sign-in on the same device.
 */
export async function signOut(): Promise<void> {
  // Captured before the sign-out clears it. The health sync state is keyed per
  // user and holds local dates in *that* user's timezone, so inheriting it
  // would make the next account re-read someone else's window.
  const userId = useSessionStore.getState().session?.user.id;

  try {
    // Before the token goes, while the RLS policy still recognises this user as
    // the row's owner. Left registered, the next account on this phone would
    // keep receiving the previous one's notifications — and nothing would
    // ever report an error, because the token is perfectly alive.
    await unregisterDeviceToken();
    await supabase.auth.signOut();
  } finally {
    queryClient.clear();
    if (userId) clearSyncState(userId);
  }
}

import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
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
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  queryClient.clear();
}

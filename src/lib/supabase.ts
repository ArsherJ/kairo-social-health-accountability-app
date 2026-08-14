import Constants from 'expo-constants';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { fetchWithTimeout } from './fetch-timeout.ts';
import { secureStorage } from './secure-storage.ts';

/**
 * The Supabase client.
 *
 * Uses the publishable key, which is designed to ship inside the app binary —
 * Row Level Security is what actually protects the data, which is why the
 * migrations revoke write grants rather than relying on the client behaving.
 * The secret key never appears in this codebase; Edge Functions receive it as
 * an injected environment variable.
 *
 * Types: once the project is linked, regenerate with
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 * and pass the Database generic to createClient.
 */

const extra = Constants.expoConfig?.extra ?? {};

const supabaseUrl = (extra['supabaseUrl'] as string | undefined) ?? '';
const supabasePublishableKey =
  (extra['supabasePublishableKey'] as string | undefined) ?? '';

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Supabase config missing. Copy .env.example to .env, or add the EXPO_PUBLIC_SUPABASE_* variables to EAS for cloud builds.',
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There is no browser redirect flow here; native deep links carry the session.
    detectSessionInUrl: false,
  },
  global: {
    // supabase-js sets no timeout and neither does fetch, so a black-holed
    // host — DNS resolves, the connection never completes — produces a promise
    // that never settles. A WiFi network blocking *.supabase.co did exactly
    // that on 2026-08-14 and left the app on the KAIRO hold overlay
    // permanently, through relaunches and a reinstall, because a query with no
    // data reads as 'loading' and nothing ever errored. See fetch-timeout.ts.
    fetch: fetchWithTimeout(fetch),
  },
});

/**
 * Supabase's timer-based refresh does not survive backgrounding on iOS. Without
 * this, a user who leaves the app overnight returns to an expired token and a
 * leaderboard that fails to load — on the morning-FOMO open that §2 depends on.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});

import { supabase } from '@/lib/supabase.ts';

/**
 * How a Supabase session is obtained.
 *
 * Deliberately thin: Supabase already normalizes the session, so the only
 * thing that varies between providers is how the credential is produced.
 * Sign in with Apple lands as one more entry here, touching no screen.
 */
export type SignInProviderId = 'apple' | 'anonymous';

export type SignInProvider = {
  id: SignInProviderId;
  label: string;
  signIn: () => Promise<{ error: string | null }>;
};

/**
 * Development stand-in for Sign in with Apple, which needs the capability on
 * the App ID and so the paid Developer Program.
 *
 * Anonymous rather than an email/password form because it is one tap with no
 * fields — structurally the same shape Apple's flow will have. A password form
 * would mean rehearsing a flow that never ships, and §5's "name and character
 * on screen within 60 seconds" is exactly what this phase exists to test.
 */
export const anonymousProvider: SignInProvider = {
  id: 'anonymous',
  label: 'Enter the gate',
  signIn: async () => {
    const { error } = await supabase.auth.signInAnonymously();
    return { error: error?.message ?? null };
  },
};

/**
 * Compiled down to an empty list in release builds. This — not the project's
 * anonymous-sign-in setting — is what guarantees an anonymous path cannot
 * reach TestFlight.
 */
export function availableProviders(): SignInProvider[] {
  return __DEV__ ? [anonymousProvider] : [];
}

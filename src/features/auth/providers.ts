import * as AppleAuthentication from 'expo-apple-authentication';
import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from 'expo-crypto';
import { supabase } from '@/lib/supabase.ts';
import { appleErrorMessage } from './apple-error.ts';

/**
 * How a Supabase session is obtained.
 *
 * Deliberately thin: Supabase already normalizes the session, so the only
 * thing that varies between providers is how the credential is produced.
 *
 * This file used to claim Apple would land here "touching no screen". That was
 * wrong, and the reason is worth keeping: Apple's Human Interface Guidelines
 * require their own button, so the sign-in screen renders `apple` through
 * `AppleAuthenticationButton` rather than through Kairo's `Button`. `label` is
 * still carried for every provider — the native button supplies its own text,
 * but the label is what accessibility and any future provider read.
 */
export type SignInProviderId = 'apple' | 'anonymous';

export type SignInProvider = {
  id: SignInProviderId;
  label: string;
  signIn: () => Promise<{ error: string | null }>;
};

/**
 * A fresh nonce per attempt. Apple signs the SHA-256 of it into the identity
 * token and Supabase verifies the raw value against that claim, which is what
 * stops a token captured from another app being replayed at Kairo's project.
 *
 * Hex rather than base64url because that is the encoding `digestStringAsync`
 * returns by default and the encoding gotrue hashes to — the two halves have to
 * agree, and matching the defaults on both sides is the version of that which
 * cannot silently drift.
 */
function randomNonce(): string {
  return Array.from(getRandomBytes(32), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const appleProvider: SignInProvider = {
  id: 'apple',
  label: 'Sign in with Apple',
  signIn: async () => {
    try {
      const raw = randomNonce();
      const hashed = await digestStringAsync(CryptoDigestAlgorithm.SHA256, raw);

      const credential = await AppleAuthentication.signInAsync({
        // Requested, but not depended on. Apple returns name and email exactly
        // once — on the very first authorization — and null forever after, so
        // anything that needs them must capture them on that call. Kairo needs
        // neither: the character is named in onboarding. Asking anyway keeps
        // the option open without building a dependency on a one-shot value.
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashed,
      });

      if (!credential.identityToken) {
        return { error: 'Apple did not return an identity token. Try again.' };
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        // Raw, not hashed. Supabase does the hashing to compare against the
        // token's claim; sending the hash would make it hash a hash.
        nonce: raw,
      });
      return { error: error?.message ?? null };
    } catch (failure) {
      // Cancelling maps to null here, so backing out of the sheet leaves the
      // screen exactly as it was rather than accusing it of an error.
      return { error: appleErrorMessage(failure) };
    }
  },
};

/**
 * The simulator's way in.
 *
 * It began as a stand-in for Sign in with Apple while the Developer Program was
 * unpurchased. Apple shipped on 2026-08-12 and this survives for a different
 * reason: Apple's flow wants a real device signed into an Apple ID and throws
 * `ERR_REQUEST_UNKNOWN` on a simulator, so without this there is no way to
 * reach the app on the machine most of the work happens on.
 *
 * Anonymous rather than an email/password form because it is one tap with no
 * fields — structurally the same shape as Apple's flow. A password form would
 * mean rehearsing a flow that never ships, and §5's "name and character on
 * screen within 60 seconds" is what this path exists to keep testable.
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
 * Apple first, and anonymous only in development. The `__DEV__` guard — not
 * the project's anonymous-sign-in setting — is what guarantees an anonymous
 * path cannot reach TestFlight.
 *
 * Apple is listed unconditionally rather than behind
 * `AppleAuthentication.isAvailableAsync()`, which is async and would make this
 * a hook. `AppleAuthenticationButton` already renders nothing where the system
 * does not support Apple authentication, so the unsupported case is handled one
 * level down — and on iOS 13+, which is every device Kairo builds for, it is
 * always supported anyway.
 */
export function availableProviders(): SignInProvider[] {
  return [appleProvider, ...(__DEV__ ? [anonymousProvider] : [])];
}

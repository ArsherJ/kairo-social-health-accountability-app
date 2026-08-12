/**
 * What to tell the user when Sign in with Apple does not return a credential.
 *
 * Pure and free of imports on purpose: anything that pulls in
 * `expo-apple-authentication` drags in expo-modules-core and React Native's
 * Flow syntax, which root Vitest cannot parse — the same constraint
 * `src/features/health/read-types.ts` and `sync-state.ts` record.
 *
 * The codes are not guesses. expo-modules-core derives them from the Swift
 * exception class name (`RequestCanceledException` → `ERR_REQUEST_CANCELED`,
 * see `errorCodeFromString` in CodedError.swift), and the classes are listed
 * in `expo-apple-authentication/ios/AppleAuthenticationExceptions.swift`.
 */

/** A raw thrown value, narrowed to what we can actually read off it. */
export type AppleAuthFailure = {
  code?: unknown;
  message?: unknown;
};

/**
 * `null` means "say nothing" — the flow ended without a session, but not
 * because anything went wrong. Cancelling is a choice, and rendering it as an
 * error next to the sign-in button reads as a broken app.
 */
export function appleErrorMessage(failure: unknown): string | null {
  const code = codeOf(failure);

  switch (code) {
    case 'ERR_REQUEST_CANCELED':
      return null;

    // The device has no Apple ID signed in, or Sign in with Apple is
    // restricted (Screen Time, a managed device, or a simulator without an
    // Apple ID). This is the one every simulator run hits, so it says what to
    // do rather than what happened.
    case 'ERR_REQUEST_UNKNOWN':
    case 'ERR_REQUEST_NOT_HANDLED':
    case 'ERR_REQUEST_NOT_INTERACTIVE':
      return 'Apple could not sign you in. Check that this device is signed into an Apple ID, then try again.';

    // A credential the request explicitly excluded. Cannot happen today —
    // Kairo passes no `excludedCredentials` — but the code exists, and an
    // unmapped code falls through to the generic line below anyway.
    case 'ERR_REQUEST_MATCHED_EXCLUDED_CREDENTIAL':
      return 'That Apple ID cannot be used to sign in here.';

    case 'ERR_REQUEST_FAILED':
    case 'ERR_INVALID_RESPONSE':
      return 'Apple sign-in failed. Try again in a moment.';

    default:
      return messageOf(failure) ?? 'Apple sign-in failed. Try again in a moment.';
  }
}

/** True when the user backed out, so the caller can leave the screen alone. */
export function isAppleCancellation(failure: unknown): boolean {
  return codeOf(failure) === 'ERR_REQUEST_CANCELED';
}

function codeOf(failure: unknown): string | null {
  if (typeof failure !== 'object' || failure === null) return null;
  const code = (failure as AppleAuthFailure).code;
  return typeof code === 'string' ? code : null;
}

function messageOf(failure: unknown): string | null {
  if (typeof failure !== 'object' || failure === null) return null;
  const message = (failure as AppleAuthFailure).message;
  return typeof message === 'string' && message.trim() !== '' ? message : null;
}

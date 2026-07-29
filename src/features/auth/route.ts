/**
 * Which of the app's three shells the user belongs in.
 *
 * A pure function so the ordering is testable in Node — the ordering is the
 * whole point, and getting it wrong strands users on a spinner rather than
 * failing loudly.
 */
export type AppRoute =
  | 'loading'
  | 'signed-out'
  | 'needs-profile'
  | 'profile-error'
  | 'ready';

export function resolveRoute(input: {
  sessionLoading: boolean;
  hasSession: boolean;
  profileLoading: boolean;
  profileError: boolean;
  hasProfile: boolean;
}): AppRoute {
  if (input.sessionLoading) return 'loading';
  if (!input.hasSession) return 'signed-out';
  // Checked before profileLoading, not after: in TanStack v5 a query's status
  // is 'pending' | 'error' | 'success', so isPending and isError should never
  // both be true. But resolveRoute doesn't get to assume the caller always
  // hands it a state machine that respects that — it's cheap for this check
  // to not depend on it, so an errored profile always wins over a stale
  // "loading" reading rather than silently falling through to a spinner.
  if (input.profileError) return 'profile-error';
  if (input.profileLoading) return 'loading';
  return input.hasProfile ? 'ready' : 'needs-profile';
}

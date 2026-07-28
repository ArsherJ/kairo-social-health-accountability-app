/**
 * Which of the app's three shells the user belongs in.
 *
 * A pure function so the ordering is testable in Node — the ordering is the
 * whole point, and getting it wrong strands users on a spinner rather than
 * failing loudly.
 */
export type AppRoute = 'loading' | 'signed-out' | 'needs-profile' | 'ready';

export function resolveRoute(input: {
  sessionLoading: boolean;
  hasSession: boolean;
  profileLoading: boolean;
  hasProfile: boolean;
}): AppRoute {
  if (input.sessionLoading) return 'loading';
  if (!input.hasSession) return 'signed-out';
  if (input.profileLoading) return 'loading';
  return input.hasProfile ? 'ready' : 'needs-profile';
}

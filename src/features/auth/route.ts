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

/** The Expo Router groups the app's shells live in. */
export type RouteGroup = '(auth)' | '(onboard)' | '(tabs)';

/**
 * Where the gate should send someone, or `null` to leave them alone.
 *
 * Split out of the layout's effect so the one rule that can strand a user on
 * the wrong screen is testable in Node rather than only observable by hand on a
 * simulator.
 *
 * `finishingOnboarding` is the one subtlety. The profile row exists the instant
 * the name step commits, so `resolveRoute` reads 'ready' while the focus
 * question (§5) is still on screen — without this flag the gate would yank the
 * user into the tabs mid-question. The flag is deliberately in-memory: a
 * force-quit between the two steps resumes into the tabs with focus unset,
 * which is why profile-row existence can stay the onboarding marker.
 */
export function redirectTarget(input: {
  route: AppRoute;
  group: string | undefined;
  finishingOnboarding: boolean;
}): '/sign-in' | '/name' | '/' | null {
  switch (input.route) {
    case 'loading':
    case 'profile-error':
      // Both render in place, so the user lands back where they were once the
      // state resolves.
      return null;
    case 'signed-out':
      return input.group === '(auth)' ? null : '/sign-in';
    case 'needs-profile':
      return input.group === '(onboard)' ? null : '/name';
    case 'ready':
      if (input.group === '(tabs)') return null;
      if (input.group === '(onboard)' && input.finishingOnboarding) return null;
      return '/';
  }
}

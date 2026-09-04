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
 * This used to take a `finishingOnboarding` flag. Onboarding had two steps and
 * the profile row committed on the first, so `resolveRoute` read 'ready' while
 * the focus question was still on screen and the gate had to be held off. The
 * focus step is gone (2026-08-10, with `profiles.focus`), onboarding is one
 * step again, and profile-row existence is now a sufficient marker on its own —
 * so the flag and the store behind it went with it rather than staying as a
 * parameter that is always false.
 */
export function redirectTarget(input: {
  route: AppRoute;
  group: string | undefined;
}): '/sign-in' | '/welcome' | '/connect' | '/name' | '/' | null {
  switch (input.route) {
    case 'loading':
    case 'profile-error':
      // Both render in place, so the user lands back where they were once the
      // state resolves.
      return null;
    case 'signed-out':
      return input.group === '(auth)' ? null : '/sign-in';
    case 'needs-profile':
      // The *first* onboarding screen. The run is seven beats: `/welcome` →
      // `/one-sky` → `/mirror` → `/connect` → `/difficulty` → `/privacy` →
      // `/name`. Only the first is named here; the rest are
      // reached by pushing, and this gate only knows "has no profile row yet".
      //
      // **The entry moved from `/connect` to `/welcome`**, which is the point
      // of the two value cards: the very first thing a brand-new account saw
      // used to be a permission request, before anything had said what it was
      // for — the worst possible order for the one dialog whose refusal cannot
      // be undone from inside the app.
      //
      // Every step stays *before* the name screen on purpose. The profile row
      // commits exactly once, there; anything **asked** after that INSERT flips
      // resolveRoute to 'ready' under an unfinished screen and needs deviation
      // #22's deleted `finishingOnboarding` flag back. The difficulty and
      // privacy beats ask early and are *written* by the name screen — see
      // `useOnboardingAnswers` for why that is the only arrangement that
      // satisfies both that rule and the column-level grants.
      return input.group === '(onboard)' ? null : '/welcome';
    case 'ready':
      // Anywhere except the two shells a ready user has finished with. Written
      // as a denylist rather than `group === '(tabs)'` on purpose: stacked
      // routes outside any group — `/event/[id]`, `/event/new` — are legitimate
      // destinations for a signed-in user, and an allowlist of one bounced them
      // straight back to the home tab the instant they were pushed.
      if (input.group === '(auth)') return '/';
      if (input.group === '(onboard)') return '/';
      return null;
  }
}

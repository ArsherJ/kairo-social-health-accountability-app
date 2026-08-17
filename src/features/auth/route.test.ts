import { describe, expect, it } from 'vitest';
import { redirectTarget, resolveRoute } from './route.ts';

const base = {
  sessionLoading: false,
  hasSession: false,
  profileLoading: false,
  profileError: false,
  hasProfile: false,
};

describe('resolveRoute', () => {
  it('waits while the persisted session is being read', () => {
    expect(resolveRoute({ ...base, sessionLoading: true })).toBe('loading');
  });

  it('sends a user with no session to sign-in', () => {
    expect(resolveRoute(base)).toBe('signed-out');
  });

  it('sends a signed-in user with no profile to onboarding', () => {
    expect(resolveRoute({ ...base, hasSession: true })).toBe('needs-profile');
  });

  it('sends a signed-in user with a profile to the app', () => {
    expect(resolveRoute({ ...base, hasSession: true, hasProfile: true })).toBe('ready');
  });

  it('waits while the profile is being fetched', () => {
    expect(resolveRoute({ ...base, hasSession: true, profileLoading: true })).toBe(
      'loading',
    );
  });

  it('ignores profile loading when there is no session', () => {
    // The profile query is disabled without a user id, so TanStack reports it
    // as pending forever. Checking the session first is what stops a signed-out
    // user staring at a spinner that will never resolve.
    expect(resolveRoute({ ...base, profileLoading: true })).toBe('signed-out');
  });

  it('prefers the session check over everything else', () => {
    expect(
      resolveRoute({
        sessionLoading: true,
        hasSession: true,
        profileLoading: true,
        profileError: true,
        hasProfile: true,
      }),
    ).toBe('loading');
  });

  it('sends a signed-in user whose profile fetch errored to a retry screen', () => {
    expect(resolveRoute({ ...base, hasSession: true, profileError: true })).toBe(
      'profile-error',
    );
  });

  it('sends a signed-out user to sign-in even if a stale profile error is set', () => {
    // The session check wins, same as it does for profileLoading above:
    // there is nothing to retry without a session.
    expect(resolveRoute({ ...base, profileError: true })).toBe('signed-out');
  });

  it('does not treat a profile error as "no profile yet"', () => {
    // Distinguishing these matters: needs-profile sends an existing character to
    // the onboarding screen, which is the bug this route resolves.
    expect(
      resolveRoute({ ...base, hasSession: true, profileError: true, hasProfile: false }),
    ).not.toBe('needs-profile');
  });
});

describe('redirectTarget', () => {
  const at = (
    route: Parameters<typeof redirectTarget>[0]['route'],
    group: string | undefined,
  ) => redirectTarget({ route, group });

  it('navigates nowhere while loading or retrying', () => {
    expect(at('loading', '(tabs)')).toBeNull();
    expect(at('profile-error', '(tabs)')).toBeNull();
  });

  it('sends a signed-out user to sign-in, and leaves them there', () => {
    expect(at('signed-out', '(tabs)')).toBe('/sign-in');
    expect(at('signed-out', '(auth)')).toBeNull();
  });

  it('sends a user with no profile to the connect screen, the first onboarding step', () => {
    // Onboarding is /connect -> /character -> /name. The gate only ever knows
    // "has no profile row yet", so it targets the first, and the (onboard)
    // branch covers all three.
    //
    // Health moved to the front on 2026-08-17 so the name screen lands on a
    // home tab with real numbers rather than a dashboard of zeroes.
    expect(at('needs-profile', '(auth)')).toBe('/connect');
    expect(at('needs-profile', '(tabs)')).toBe('/connect');
    expect(at('needs-profile', undefined)).toBe('/connect');
  });

  it('leaves a user already inside the onboarding group alone', () => {
    // /connect pushes to /character which pushes to /name. The gate must not
    // bounce anyone back to step one mid-flow.
    //
    // Every step stays *before* the name screen, where the profile row commits
    // exactly once. Deviation #22 deleted the `finishingOnboarding` flag
    // because a row committing on step 1 flipped resolveRoute to 'ready'
    // underneath a later screen; asking anything after the INSERT needs that
    // flag back.
    expect(at('needs-profile', '(onboard)')).toBeNull();
  });

  it('sends a ready user to the tabs', () => {
    expect(at('ready', '(auth)')).toBe('/');
    expect(at('ready', '(tabs)')).toBeNull();
  });

  it('evicts a ready user from onboarding the moment the profile row exists', () => {
    // Onboarding is one step again. It used to be two — name, then focus — and
    // because the row commits on the first, the gate needed a flag to know not
    // to yank the user out mid-question. The focus step is gone, so profile-row
    // existence is a sufficient marker on its own and there is nothing left to
    // wait for.
    expect(at('ready', '(onboard)')).toBe('/');
  });

  it('still sends a signed-out user standing in onboarding to sign-in', () => {
    // Route wins over group: being on an onboarding screen is not a claim to
    // stay there once the session is gone.
    expect(at('signed-out', '(onboard)')).toBe('/sign-in');
  });
});

describe('a ready user may stand outside the tabs', () => {
  // The bug this covers: `ready` used to allowlist `(tabs)` and redirect
  // everything else to '/'. A stacked route belongs to no group, so pushing
  // /goal/[id] bounced back to home before it rendered.
  const ready = { route: 'ready' as const };

  it('leaves a stacked route alone', () => {
    expect(redirectTarget({ ...ready, group: 'goal' })).toBe(null);
  });

  it('leaves an ungrouped root alone', () => {
    expect(redirectTarget({ ...ready, group: undefined })).toBe(null);
  });

  it('still keeps the tabs', () => {
    expect(redirectTarget({ ...ready, group: '(tabs)' })).toBe(null);
  });

  it('still evicts a ready user from the auth shell', () => {
    expect(redirectTarget({ ...ready, group: '(auth)' })).toBe('/');
  });

  it('still evicts a ready user from onboarding', () => {
    expect(redirectTarget({ ...ready, group: '(onboard)' })).toBe('/');
  });
});

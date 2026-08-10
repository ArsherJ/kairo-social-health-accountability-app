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
    // Distinguishing these matters: needs-profile sends an existing Hunter to
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
    finishingOnboarding = false,
  ) => redirectTarget({ route, group, finishingOnboarding });

  it('navigates nowhere while loading or retrying', () => {
    expect(at('loading', '(tabs)')).toBeNull();
    expect(at('profile-error', '(tabs)')).toBeNull();
  });

  it('sends a signed-out user to sign-in, and leaves them there', () => {
    expect(at('signed-out', '(tabs)')).toBe('/sign-in');
    expect(at('signed-out', '(auth)')).toBeNull();
  });

  it('sends a user with no profile to the name step, and leaves them there', () => {
    expect(at('needs-profile', '(auth)')).toBe('/name');
    expect(at('needs-profile', '(onboard)')).toBeNull();
  });

  it('sends a ready user to the tabs', () => {
    expect(at('ready', '(auth)')).toBe('/');
    expect(at('ready', '(tabs)')).toBeNull();
  });

  it('lets the onboarding group finish the focus step before the tabs take over', () => {
    // The profile row exists the moment the name step commits, so the gate
    // reads 'ready' while the focus question is still on screen. Without this
    // the user would be yanked to the tabs mid-question.
    expect(at('ready', '(onboard)', true)).toBeNull();
  });

  it('does not strand a ready user in onboarding once the flow is done', () => {
    // The flag is in-memory only. A force-quit between name and focus therefore
    // resumes into the tabs with focus unset — acceptable by design, and the
    // reason profile-row existence stays the onboarding marker.
    expect(at('ready', '(onboard)', false)).toBe('/');
  });

  it('never holds a signed-out or profileless user in onboarding on that flag', () => {
    expect(at('signed-out', '(onboard)', true)).toBe('/sign-in');
  });
});

describe('a ready user may stand outside the tabs', () => {
  // The bug this covers: `ready` used to allowlist `(tabs)` and redirect
  // everything else to '/'. A stacked route belongs to no group, so pushing
  // /goal/[id] bounced back to home before it rendered.
  const ready = { route: 'ready' as const, finishingOnboarding: false };

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

  it('still evicts a ready user from onboarding once the flow is done', () => {
    expect(redirectTarget({ ...ready, group: '(onboard)' })).toBe('/');
    expect(
      redirectTarget({ ...ready, group: '(onboard)', finishingOnboarding: true }),
    ).toBe(null);
  });
});

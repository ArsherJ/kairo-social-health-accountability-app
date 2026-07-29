import { describe, expect, it } from 'vitest';
import { resolveRoute } from './route.ts';

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

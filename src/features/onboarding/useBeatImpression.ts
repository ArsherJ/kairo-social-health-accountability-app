import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/features/auth/session.ts';
import { track } from '@/features/telemetry/events.ts';
import { beatRoute, onboardingBeat, type BeatName } from './beats.ts';

/**
 * Record that a beat of the onboarding run was shown.
 *
 * **One emitter, taking a beat name and nothing else.** That is what makes
 * "the route name and nothing else" true by construction rather than by
 * review: no screen can reach the payload, so no screen can attach the step
 * figure it happens to be holding. `/connect` reads today's steps and the
 * difficulty beat prints a step median — both are health figures, and both sit
 * on beats that report an impression.
 *
 * Fires on mount, unguarded, for the reasons on `onboarding_beat_seen` — the
 * run happens once per account, so the funnel needs no marker store and a
 * back-and-forward duplicate is absorbed by counting distinct beats.
 *
 * `userId` is read here rather than passed, because a beat that had to thread
 * a session id through to report an impression is a beat that will be added
 * without one. It may be undefined for a frame; `track` buffers those and
 * `flushTelemetryBuffer` attributes them with their own timestamps, which is
 * the interval this measurement is about.
 *
 * **It is therefore held in a ref and kept out of the effect's deps.** Reading
 * it as a dependency looks harmless and fires the beat *twice* whenever the
 * session resolves a frame late: once buffered against no user, then again
 * live. Both rows land, on the same beat, in the same visit — which is the one
 * duplicate distinct-beat counting was not meant to have to absorb, since it
 * is not a person navigating.
 */
export function useBeatImpression(name: BeatName): void {
  const userId = useSessionStore((s) => s.session)?.user.id;
  const latestUserId = useRef(userId);
  latestUserId.current = userId;

  const route = beatRoute(onboardingBeat(name));

  // `route` is fixed for a screen, so this is once per mount.
  useEffect(() => {
    void track(latestUserId.current, 'onboarding_beat_seen', { route });
  }, [route]);
}

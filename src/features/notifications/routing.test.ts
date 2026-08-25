import { describe, expect, it } from 'vitest';
import { notificationTarget } from './routing.ts';

/**
 * The payloads under test are copied from the two senders rather than invented:
 * `dispatch-notifications/index.ts` sends the three scheduled triggers, and
 * `finalize-days/index.ts` sends `event_completed`. If either changes shape,
 * these tests are where it should hurt.
 */

describe('where a notification tap lands', () => {
  it('sends a squad push to the squad tab', () => {
    expect(
      notificationTarget({
        trigger: 'day_ending_soon',
        localDate: '2026-08-14',
        screen: 'squad',
      }),
    ).toBe('/squad');
  });

  it('sends a solo push to the character tab, which is `/` and not `/character`', () => {
    // The trap this test exists for. `/character` is the *onboarding* body
    // picker (`app/(onboard)/character.tsx`); the character tab is the tabs
    // group's index. Routing a signed-in user to `/character` would drop them
    // into onboarding, and `redirectTarget` would then bounce them back to `/`
    // — a visible flash on every solo notification tap.
    expect(
      notificationTarget({
        trigger: 'day_ends',
        localDate: '2026-08-14',
        screen: 'character',
      }),
    ).toBe('/');
  });

  it('sends a completed event to that event, not to a list', () => {
    // `finalize-days` is the only sender that carries an id, and it is the
    // most specific destination the product has: the boss you just beat.
    expect(
      notificationTarget({
        trigger: 'event_completed',
        screen: 'events',
        eventId: '7f3c1e2a-0000-4000-8000-000000000001',
      }),
    ).toBe('/event/7f3c1e2a-0000-4000-8000-000000000001');
  });

  it('falls back to the character tab when an event push has lost its id', () => {
    // Rather than null. The push already told the user something happened; the
    // honest failure is landing them somewhere real, not swallowing the tap —
    // and `/event/undefined` renders an error, which is a fabricated screen.
    expect(notificationTarget({ trigger: 'event_completed', screen: 'events' })).toBe('/');
  });

  it('still lands a goal push sent before the 2026-08-25 rename', () => {
    // `notification_log.kind` is free text with no check constraint, so
    // historical rows say this and a push sent minutes before the deploy can be
    // tapped minutes after it. The goal routes are gone, so it lands on the
    // character tab — a tap that goes nowhere is indistinguishable from push
    // being broken.
    expect(
      notificationTarget({ trigger: 'goal_completed', screen: 'goals', goalId: 'g1' }),
    ).toBe('/');
    expect(notificationTarget({ trigger: 'goal_completed', screen: 'goals' })).toBe('/');
  });

  it('ignores a payload from a server that knows a screen this build does not', () => {
    // Forward compatibility, and the reason this returns null rather than
    // throwing: a V1 server adding `screen: 'shop'` must not crash a beta
    // build on tap.
    expect(notificationTarget({ trigger: 'weekly_recap', screen: 'shop' })).toBeNull();
  });

  it('ignores anything that is not a payload at all', () => {
    for (const junk of [null, undefined, 'squad', 42, [], {}, { screen: 7 }]) {
      expect(notificationTarget(junk)).toBeNull();
    }
  });

  it('ignores a goalId that is not a plausible id', () => {
    // The id is interpolated into a path. Anything with a slash or a space in
    // it is not an id, and building a route out of it would navigate somewhere
    // nobody intended.
    for (const goalId of ['', '../../profile', 'a b', 'x'.repeat(200)]) {
      expect(notificationTarget({ trigger: 'goal_completed', screen: 'goals', goalId })).toBe(
        '/',
      );
    }
  });
});

describe('notificationTarget — challenges', () => {
  it('routes a cleared challenge to the train route', () => {
    expect(
      notificationTarget({ trigger: 'challenge_cleared', screen: 'train', localDate: '2026-08-15' }),
    ).toBe('/train');
  });

  it('needs no id, unlike an event', () => {
    // There is one live challenge per area, so the route itself is the whole
    // address — nothing to interpolate and nothing to validate.
    expect(notificationTarget({ screen: 'train' })).toBe('/train');
  });
});

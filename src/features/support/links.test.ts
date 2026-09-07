import { describe, expect, it } from 'vitest';
import { INVITE_HOST } from '../squad/invite-link.ts';
import { feedbackMailto, PRIVACY_POLICY_URL, SUPPORT_EMAIL } from './links.ts';

describe('support links', () => {
  it('serves the policy from the invite host', () => {
    expect(PRIVACY_POLICY_URL).toBe(`https://${INVITE_HOST}/privacy`);
  });

  it('opens mail to the monitored address with a subject', () => {
    expect(feedbackMailto()).toBe(`mailto:${SUPPORT_EMAIL}?subject=Kairo%20feedback`);
  });
});

/*
  The policy page's own claims are **not** asserted here any more.

  They were, and that was one of three scans of one rule — this file, the
  invite message's, and the HealthKit disclosure's — which is how a fourth
  surface making the claim ended up with nowhere obvious to be registered.
  `src/features/privacy/claim-surfaces.test.ts` owns the claim across every
  surface now, `web/privacy.html` included. What stays here is what this file
  is actually named after: the two links, checked against the constants they
  are built from.
*/

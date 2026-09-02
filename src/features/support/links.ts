import { INVITE_HOST } from '../squad/invite-link.ts';

/**
 * The two addresses a person can reach Kairo at from outside the app, and the
 * links that carry them there.
 *
 * Zero-runtime-import beyond `INVITE_HOST`, and reached by relative path, so
 * root Vitest can load it — the same split `invite-message.ts` uses. It exists
 * because the contact address and the policy URL are each about to be written
 * in four places (App Store Connect, the policy page, the Settings row and
 * TestFlight's test information) and only the two in this repo can be guarded.
 * `links.test.ts` reads `web/privacy.html` off disk and asserts the page names
 * the same address this module does, which is the same structural answer
 * `invite-message.test.ts` gives for the privacy claim.
 */

/**
 * The monitored address. Founder decision 2026-09-02. An iCloud address is
 * fine for Apple and for testers; what matters is that it is read.
 */
export const SUPPORT_EMAIL = 'arsherjames25@icloud.com';

/**
 * The policy lives on the invite host on purpose: it is the one origin a
 * stranger already reaches before installing, and `INVITE_HOST` is already a
 * one-way door, so this adds no second one. `cleanUrls` on that host serves
 * `web/privacy.html` at `/privacy`.
 */
export const PRIVACY_POLICY_URL = `https://${INVITE_HOST}/privacy`;

/**
 * A `mailto:` that lands with a subject already filled, so a tester who taps
 * it with nothing particular to say still sends something we can sort.
 * `encodeURIComponent` because a subject with a space is a broken link on
 * some mail clients and a fine one on others.
 */
export function feedbackMailto(subject = 'Kairo feedback'): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

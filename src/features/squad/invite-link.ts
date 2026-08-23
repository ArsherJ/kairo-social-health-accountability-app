/**
 * The one place the invite domain is written down.
 *
 * It has to appear in two places that must never disagree: `applinks:<host>` in
 * `ios.associatedDomains`, which the entitlement is generated from, and the URL
 * in the share message. If they drift, the link opens Safari instead of the app
 * and **nothing anywhere reports an error** — the same silent failure class as
 * `aps-environment`. So both sides import this rather than each holding a
 * string, and `invite-message.test.ts` asserts the message's host is this one.
 *
 * **A bare host: no scheme, no trailing slash.** Apple's format is
 * `applinks:<host>`, and including `https://` is the documented mistake that
 * makes links fall back to Safari. `inviteUrl()` adds the scheme instead.
 *
 * **Changing it is a one-way door.** The host is baked into every invite
 * already sent, and an old link has no way to find a new one — so moving off
 * `*.vercel.app` breaks every message already in somebody's chat history.
 * Decide on a real domain before a public launch, not after. What must move
 * with it: the deploy in `web/` and this constant. EAS CNG generates the
 * associated-domain entitlement from `app.config.ts`; never patch a generated
 * native project instead.
 *
 * Zero imports, deliberately. `app.config.ts` is evaluated by Expo's config
 * loader in plain Node, long before Metro exists — anything this file pulled in
 * would have to survive that too.
 */

export const INVITE_HOST = 'kairo-teal-nine.vercel.app';

/** The path universal links claim. Mirrors `paths` in `web/.well-known/apple-app-site-association`. */
export const INVITE_PATH_PREFIX = '/join';

/**
 * The link that opens a squad invite.
 *
 * The code is not escaped and does not need to be: `invite-code.ts` pins it to
 * `^[A-Z0-9]{6}$`, every character of which is URL-safe. Encoding it anyway
 * would be harmless but would imply this accepts arbitrary input, which it
 * must not — a code is validated before it reaches here.
 */
export function inviteUrl(code: string): string {
  return `https://${INVITE_HOST}${INVITE_PATH_PREFIX}/${code}`;
}

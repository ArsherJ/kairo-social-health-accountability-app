# `web/` — the universal-links site

Three served files on a free static host. They exist so that tapping
`https://kairo-teal-nine.vercel.app/join/AB12CD` opens Kairo with the invite
code already filled in, instead of dropping the reader into Safari.

**Live at `kairo-teal-nine.vercel.app` since 2026-08-17.** The host is not
written here as the source of truth — `INVITE_HOST` in
`src/features/squad/invite-link.ts` is, and both `app.config.ts` (which
generates the entitlement) and `invite-message.ts` (which builds the shared
URL) import it, so the two cannot drift.

| File | Job |
| --- | --- |
| `.well-known/apple-app-site-association` | The file Apple's CDN fetches to learn which app owns which paths. **No extension**, valid JSON. |
| `vercel.json` | Forces its `Content-Type`, and rewrites `/join/:code` to the landing page. The rewrite destination is `/`, **not** `/index.html` — with `cleanUrls: true` the latter 308s, and Apple follows no redirects. |
| `index.html` | What somebody without the app sees. Self-contained: no fonts, no scripts, no external requests. |

## The four things that break this silently

Every one of them leaves the link resolving to Safari with nothing reporting an
error — the same failure class as `aps-environment`, recorded in `CLAUDE.md`.

1. **The `appID` drifting from the app.** It is
   `<appleTeamId>.<bundleIdentifier>` — `8C53KVSFWK.com.arsherj.kairo` — and both
   halves live in `app.config.ts`. Changing either one here without changing it
   there, or the reverse, breaks every link.
2. **The content type.** The file is extensionless, so a static host serves it
   as `application/octet-stream` by default and Apple ignores it. That is what
   `vercel.json` is for.
3. **A redirect.** Apple follows none. The file must be a `200` at exactly
   `https://kairo-teal-nine.vercel.app/.well-known/apple-app-site-association`, which is why the
   site has to own the domain **root** — a project path like
   `user.github.io/kairo/` cannot satisfy it.
4. **The Associated Domains capability on the App ID**, in the Apple Developer
   portal. Outside this repository and outside git. Without it the entitlement
   ships, the link opens Safari, and nothing anywhere says why.

**This is why GitHub Pages cannot host it:** no custom MIME types, and a
project-path repository cannot serve the domain root.

## Verifying a deploy

```bash
curl -I https://kairo-teal-nine.vercel.app/.well-known/apple-app-site-association
```

Expect `200`, `content-type: application/json`, and **no** `location` header.
A `301` to a trailing slash or to `www.` is a failure, not a detail.

Apple's CDN caches the file. A change to `paths` can take up to 24 hours to
reach devices that have already fetched it; reinstalling the app forces a fresh
fetch on that device.

## Changing the domain

**Every invite link already shared stops working.** The domain is baked into
`INVITE_HOST` (which builds the share message) and into `ios.associatedDomains`
(which the entitlement is generated from), and an old link has no way to find
the new host. `<project>.vercel.app` is fine for a beta; decide on a real
domain before any public launch, not after.

## Scope

`paths` is `/join/*` and deliberately nothing broader. A wildcard would make
every path on the domain open the app — including this landing page, whose
entire job is to be readable in a browser by somebody who has not installed it.

Android App Links would put an `assetlinks.json` beside the association file.
iOS first; not built.

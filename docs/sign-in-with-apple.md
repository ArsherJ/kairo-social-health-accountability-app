# Sign in with Apple

**Status (2026-08-12): the app side is built. What remains is portal
configuration and a device test.**

Apple Developer Program enrolment came through, which was the blocker. This
document was a plan; it is now a runbook, and the checklist at the bottom is the
thing to work through.

## What is done

| | |
|---|---|
| `expo-apple-authentication`, `expo-crypto` | installed (SDK 57 pinned versions) |
| `usesAppleSignIn: true` | `app.config.ts`, writes the entitlement |
| `appleProvider` with the nonce flow | `src/features/auth/providers.ts` |
| `availableProviders()` returns Apple in Release | same file; anonymous stays `__DEV__`-only |
| Apple's branded button on the sign-in screen | `app/(auth)/sign-in.tsx` |
| Error copy, cancellation handling | `src/features/auth/apple-error.ts` (+6 tests) |
| Client-secret minting | `npm run apple-secret` |
| Account deletion, which Apple requires | `delete_account()`, `app/delete-account.tsx` |

## What is left

### 1. Register the App ID, with all three capabilities

Fresh enrolment starts with no App IDs at all, so this is a registration rather
than an edit. Developer portal → Certificates, Identifiers & Profiles →
Identifiers → **+**.

| Field | Value |
|---|---|
| Type | **App** (not App Clip) |
| Description | `Kairo` — alphanumerics and spaces only |
| Bundle ID | **Explicit** → `com.arsherj.kairo` |

Explicit, not Wildcard: a wildcard App ID cannot carry any of the three
capabilities below. The bundle ID is permanent and must match `app.config.ts`
exactly.

Under **Capabilities**, tick **HealthKit**, **Sign in with Apple** (leave the
Configure default, "Enable as a primary App ID") and **Push Notifications**.
That is precisely what `npm run prebuild` writes into
`ios/Kairo/Kairo.entitlements`:

```
com.apple.developer.applesignin                   → Sign in with Apple
com.apple.developer.healthkit                     → HealthKit
com.apple.developer.healthkit.background-delivery → no portal toggle; covered by HealthKit
aps-environment                                   → Push Notifications
```

Ignore the **App Services** and **Additional Capabilities** tabs. Those cover
entitlements needing Apple's written approval; Kairo uses none of them, so
there is no request to file.

**Do all three in one pass.** A missing capability does not fail the build — it
installs fine and the feature silently does nothing. HealthKit returns no data.
Apple throws `ERR_REQUEST_UNKNOWN`, which is indistinguishable from a device
not signed into an Apple ID. Push cannot have an APNs key attached by
`eas credentials`.

### 2. A key for the client secret

Developer portal → Keys → **+** → tick **Sign in with Apple** → configure it
against the `com.arsherj.kairo` primary App ID → Continue → Register.

**The `.p8` downloads exactly once.** Losing it means revoking that key and
making another. Keep it outside the repo — it is a signing key, and a
`.p8` committed to git is a credential leak.

Note the **Key ID** (also in the filename Apple gives you,
`AuthKey_<KEYID>.p8`) and your **Team ID** (portal → Membership details).

### 3. Mint the secret and install it on Supabase

Apple does not issue a client secret. It is an ES256 JWT you sign yourself, and
**it expires — Apple's ceiling is 15,777,000 seconds, about 182 days.**

```bash
npm run apple-secret -- \
  --key ~/Downloads/AuthKey_ABC123DEFG.p8 \
  --team-id YOUR_TEAM_ID \
  --push
```

`--push` sends it straight to the Supabase project over the Management API
(same Keychain token as `remote-sql.sh`), setting `external_apple_enabled`,
`external_apple_client_id` and `external_apple_secret` in one call. Without
`--push` the JWT is printed for pasting into the dashboard, which puts a live
credential in your scrollback.

The client id is the **bundle ID**, `com.arsherj.kairo`, because this is the
native iOS flow. A Services ID is only needed for web or Android.

The script prints the expiry date and refuses to mint anything Apple would
reject. **Put that date in a calendar.** An expired secret takes sign-in down
for every user at once with no code change to blame — structurally the same
silent failure as the August 2026 deployment gap, and just as hard to attribute
after the fact. Re-running the script with the same key mints a fresh one.

### 4. Rebuild natively

```bash
npm run prebuild        # regenerates ios/, writes the entitlement, rewrites .xcode.env.local
npm run ios
```

The entitlement is native. A JS reload will not pick it up.

### 5. Verify on a real device

Sign in with Apple wants a device signed into an Apple ID; the simulator
generally throws `ERR_REQUEST_UNKNOWN`, which `apple-error.ts` renders as
"Check that this device is signed into an Apple ID". That message is the
expected simulator result, not a bug.

## How the flow works, and the one part that is easy to get wrong

The nonce is not decoration. Apple signs the **SHA-256 hash** of it into the
identity token; Supabase hashes the **raw** value it is given and compares. So
`signInAsync` gets the hash and `signInWithIdToken` gets the raw string —
sending the hash to both would make gotrue hash a hash, and the token would be
rejected. Both sides use hex, which is `digestStringAsync`'s default and
gotrue's encoding; matching the defaults is the version of this that cannot
silently drift.

This is what stops an identity token captured from another app being replayed
against Kairo's Supabase project.

## Things that will bite

- **Name and email arrive exactly once**, on the very first authorization, and
  are `null` on every sign-in after. Kairo asks for both and depends on
  neither — the character is named in onboarding — so there is nothing to
  persist today. Do not add a dependency on them later without capturing them
  on that first call. To rehearse the first-run path, revoke Kairo under
  Settings → Apple ID → Password & Security → Apps Using Apple ID.
- **Hide My Email** gives a relay address. Anything that ever emails a user has
  to tolerate it.
- **`external_anonymous_users_enabled` is still `true` on the project**, and
  that is fine: the `__DEV__` guard in `availableProviders()` — not the project
  setting — is what keeps an anonymous path out of TestFlight. Turning the
  project setting off would break the dev sign-in without making Release any
  safer.
- **Apple requires account deletion** from any app offering Sign in with Apple.
  That half is done: `delete_account()` and `app/delete-account.tsx`, migration
  `20260811140000`.

## Verify before calling it done

On a real device, in a Release build:

- [ ] First sign-in, granting name and email.
- [ ] Force-quit and relaunch — the session restores.
- [ ] Token refresh across an expiry.
- [ ] Sign out, then sign in again — the same `auth.users` row, the same character.
- [ ] Cancel the Apple sheet — the screen is unchanged, with no error shown.
- [ ] Revoke Kairo from the Apple ID settings, then sign in again.
- [ ] Delete the account in-app, then sign in again — a *new* character, not the
      old one resurrected.
- [ ] Confirm the anonymous provider does not appear, and neither does the
      "Development build" label above it.

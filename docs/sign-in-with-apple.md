# Sign in with Apple — implementation spec

**Status:** not built. Blocked on Apple Developer Program enrolment (2026-08-11).

This is the last thing between Kairo and a TestFlight build. `availableProviders()`
returns an empty list in Release, so a release build has **no way to obtain a
session at all** — the working anonymous path is compiled out by `__DEV__`. That
is deliberate (`src/features/auth/providers.ts`), and it is why the QA pass rated
onboarding 3/10 and called this the single release blocker.

Everything here is written down now so that enrolment is the only slow part.

## What already exists

`src/features/auth/providers.ts` was built for this. `SignInProviderId` is
already `'apple' | 'anonymous'`, and a provider is just an id, a label and a
`signIn()` returning `{ error }` — Supabase normalises the session, so nothing
downstream changes. The sign-in screen renders whatever `availableProviders()`
returns; it needs no edit.

## What is missing, in order

### 1. Apple Developer Program — external, and the actual blocker

Enrolment is US$99/year and takes anywhere from a day to a couple of weeks if
Apple asks for identity verification. Nothing below can be tested without it.

### 2. App ID capability

In the Apple Developer portal, on the App ID for `com.arsherj.kairo`, enable
**Sign in with Apple**. This is what makes the native flow return an identity
token at all.

### 3. A key for the client secret

Supabase needs a client secret, and Apple does not issue one — it is a JWT you
sign yourself:

- Create a **Sign in with Apple** key (`.p8`). It downloads once; losing it means
  making another.
- Note the **Key ID**, your **Team ID**, and the bundle ID `com.arsherj.kairo`.
- Mint the client secret JWT (ES256, `iss` = Team ID, `sub` = bundle ID,
  `aud` = `https://appleid.apple.com`, `kid` = Key ID). **It expires — six
  months maximum**, so put a calendar reminder next to it. A silently expired
  secret takes sign-in down for everyone with no code change to blame, which is
  the same failure mode as the August deployment gap.

### 4. Supabase provider

Currently `external_apple_enabled: false`, with no client id or secret. Set:

- **Client ID:** `com.arsherj.kairo` — the bundle ID, because this is the native
  iOS flow. A Services ID is only needed for web or Android.
- **Secret:** the JWT from step 3.

### 5. The app

```bash
npx expo install expo-apple-authentication
npm run prebuild          # regenerates ios/ and rewrites .xcode.env.local
```

In `app.config.ts`, add `usesAppleSignIn: true` to the `ios` block — that writes
the entitlement. It requires a native rebuild, not a JS reload.

Then in `providers.ts`:

```ts
export const appleProvider: SignInProvider = {
  id: 'apple',
  label: 'Sign in with Apple',
  signIn: async () => {
    // The nonce is not optional. Apple signs the SHA-256 of it into the
    // identity token, and Supabase verifies the raw value against that claim —
    // it is what stops a token captured from another app being replayed here.
    const raw = randomNonce();
    const hashed = await digestStringAsync(CryptoDigestAlgorithm.SHA256, raw);

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed,
    });
    if (!credential.identityToken) return { error: 'No identity token returned' };

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: raw,      // raw, not hashed — Supabase does the hashing to compare
    });
    return { error: error?.message ?? null };
  },
};

export function availableProviders(): SignInProvider[] {
  return [appleProvider, ...(__DEV__ ? [anonymousProvider] : [])];
}
```

Keep `anonymousProvider` under `__DEV__`. Its comment explains why it exists and
that reasoning still holds — it is one tap with no fields, structurally the same
shape as the Apple flow, which is what makes §5's "name and character on screen
within 60 seconds" testable on a simulator.

## Things that will bite

- **`ERR_REQUEST_UNKNOWN` on the simulator.** Sign in with Apple wants a real
  device signed into an Apple ID. Budget for device testing.
- **Name and email arrive exactly once**, on the very first authorisation, and
  are `null` on every subsequent sign-in. Kairo does not currently use either —
  the character name is chosen in onboarding — so there is nothing to persist,
  but do not add a dependency on them later without capturing them on that first
  call. To rehearse the first-run path again, revoke Kairo under Settings →
  Apple ID → Password & Security → Apps Using Apple ID.
- **Hide My Email** gives a relay address. Anything that ever emails a user has
  to tolerate it.
- **Apple requires account deletion** for any app offering Sign in with Apple.
  That half is done — `delete_account()` and `app/delete-account.tsx`, migration
  `20260811140000`.

## Verify before calling it done

On a real device, in a Release build:

1. First sign-in, granting name and email.
2. Force-quit and relaunch — the session restores.
3. Token refresh across an expiry.
4. Sign out, then sign in again — the same `auth.users` row, the same character.
5. Revoke Kairo from the Apple ID settings, then sign in again.
6. Delete the account in-app, then sign in again — a *new* character, not the
   old one resurrected.
7. Confirm the anonymous provider does not appear.

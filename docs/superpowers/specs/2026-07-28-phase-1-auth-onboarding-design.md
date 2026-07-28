# Phase 1 — Auth and character-first onboarding

Status: approved 2026-07-28. Implements roadmap Phase 1 (35–45h).

## Goal

Take the app from its single wiring-proof screen to a real signed-in experience:
a user signs in, names their Hunter, and lands on a character screen — with the
HealthKit permission asked in context afterwards, not as a gate.

Spec anchor is §5's onboarding philosophy: **name + character on screen within
the first 60 seconds**, then the HealthKit ask framed as "power your character
with real life", notifications deferred until a squad or sabotage event gives
them a reason to exist, and body metrics deferred to a soft prompt. Every ask
has a visible why.

## Constraint shaping this phase

The Apple Developer Program is not yet purchased, so Sign in with Apple cannot
be enabled on the App ID. Onboarding is therefore built against **anonymous
sign-in** behind a provider abstraction, and Apple drops in as one more provider
without touching any onboarding screen.

Anonymous is chosen over an email/password dev screen precisely because it is
one tap with no form — structurally the same shape as Sign in with Apple. A
password form would mean testing a flow that will never ship, and §5's 60-second
claim is exactly the thing this phase exists to validate.

Anonymous sign-ins must be re-enabled on the project for development, and
**disabled again when Apple Sign-In lands**. The provider list is compiled out
under `__DEV__`, so an anonymous path cannot reach TestFlight even if the
project setting is left on.

---

## 1. Security fix: `profiles` INSERT is granted table-wide

Verified against the live project on 2026-07-28:

```
select privilege_type from information_schema.table_privileges
where table_name = 'profiles' and grantee = 'authenticated';
→ DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE
```

`UPDATE` is correctly absent — revoked and re-granted per column. `INSERT` is
the identical hole, still open. The `profiles_insert_own` policy checks only
`id = auth.uid()`; RLS policies constrain **rows, not columns**. A client can
therefore create its own profile with `level`, `total_xp` and `is_legendary`
set to anything.

Severity: `is_legendary` is the paid-subscription flag and nothing recomputes
it. `total_xp` self-corrects once the rollup trigger fires, but only after the
user's first `daily_scores` row exists.

This has been unreachable so far because nothing has ever inserted a profile.
Phase 1 makes it reachable — profile creation is the client's first write — so
it is fixed here.

**Fix**, symmetric with the existing UPDATE remedy and for the same Postgres
reason (a column-level `REVOKE` against a table-level `GRANT` is silently a
no-op):

```sql
revoke insert on public.profiles from anon, authenticated;

grant insert (
  id, character_name, class, timezone,
  height_cm, weight_kg, birth_year, sex,
  has_wearable, exclude_from_recap
) on public.profiles to authenticated;
```

`level`, `total_xp` and `is_legendary` fall to their column defaults (1, 0,
false) and remain server-awarded.

`DELETE` is also granted, but `profiles` has no DELETE policy, so RLS denies it
regardless. Left alone — account deletion goes through its own path.

---

## 2. Auth abstraction

Deliberately thin. Supabase already normalizes the session, so the only thing
that varies between providers is **how the credential is produced**.

```ts
// src/features/auth/providers.ts
export type SignInProvider = {
  id: 'apple' | 'anonymous';
  label: string;
  signIn: () => Promise<{ error: string | null }>;
};
```

- `anonymousProvider` → `supabase.auth.signInAnonymously()`
- `appleProvider` (later) → `supabase.auth.signInWithIdToken({ provider: 'apple', token })`
- `availableProviders()` → `[anonymous]` under `__DEV__`, `[apple]` otherwise

Session state lives in a Zustand store fed by `supabase.auth.onAuthStateChange`,
following the roadmap's split: Zustand owns session and UI state, TanStack Query
owns server cache. Sign-out clears both the session and the query cache, so a
second account cannot read the first one's cached rows.

## 3. Routing and the onboarding gate

```
app/
  _layout.tsx           providers + gate
  (auth)/sign-in.tsx
  (onboard)/name.tsx
  (tabs)/_layout.tsx
  (tabs)/index.tsx      character
  (tabs)/squad.tsx      stub
  (tabs)/profile.tsx    stub
```

A single `useAppRoute()` hook resolves one of `loading | signed-out |
needs-profile | ready`, and the root layout redirects on it.

**Profile-row existence is the onboarding marker.** `profiles.character_name`
is `NOT NULL`, so the row exists if and only if the name step completed. No new
column, and no local flag that can desync from the server.

The existing `app/index.tsx` wiring placeholder is deleted.

## 4. HealthKit ask placement

The ask is **not** an onboarding route. It is a sheet presented over the
character screen once the profile exists.

§5 orders it this way — character first, permission second — and a sheet over
the character means the prompt literally overlays the thing it will power. It
also keeps the router gate at three states instead of four.

State comes from `getRequestStatusForAuthorization`, not `authorizationStatusFor`.
HealthKit deliberately never reveals **read** authorization (doing so would leak
whether a user has a given condition), so `authorizationStatusFor` cannot answer
"have I asked yet" for read types. If `isHealthDataAvailable()` returns false,
the sheet never appears.

Phase 1 requests authorization only. Reading, anchoring and bucketing remain
Phase 3. Simulator builds skip entitlement validation, so the real prompt can be
seen — and its usage-description copy judged — without the paid account. Zero
data comes back, which is fine because nothing reads any yet.

Declared read types: steps, walking/running distance, active energy, exercise
time, sleep analysis, heart rate, workouts.

## 5. Timezone capture

`profiles.timezone` is set from `Intl.DateTimeFormat().resolvedOptions().timeZone`
at profile creation, and re-checked when the app foregrounds; a change patches
the column.

Not cosmetic. Every local-day boundary, finalization window and leaderboard date
keys off this column, and it defaults to `Asia/Manila`. An OFW in Dubai whose
timezone is never set would have their day close eight hours early, silently and
permanently — which is precisely the §2 case the whole per-user-day design
exists to serve.

## 6. Character screen

Reads `profiles` (name, level, total_xp) and the `daily_scores` row for the
device-local date via `currentLocalDate()` from `@kairo/core`.

With no health data every value is zero, so **the empty state is the designed
state**: level 1, four stat bars at zero, and a line pointing at the HealthKit
ask. This is what every new user sees for their first minutes, and it is what
the whole phase will be judged on.

The Hunter is a code-drawn silhouette — no asset pipeline, and one component to
replace when Phase 7's generated art arrives. Evolution stage comes from
`evolutionStageForLevel()`, already in `kairo-core`.

Squad and profile tabs are stubs. Squad is deliberately not designed here;
that is Phase 4's job.

## 7. `kairo-core` changes

One addition: `isValidCharacterName()`, mirroring the DB `CHECK`
(`char_length(btrim(...)) between 2 and 20`), so the name field's inline
validation and the constraint are one rule rather than two that drift.

Everything else needed already exists: `currentLocalDate`, `levelForXp`,
`evolutionStageForLevel`.

## 8. Testing

Following the repo's stated posture — strict TDD on logic, UI by hand on device.

- **Schema (PGlite):** an `authenticated` user cannot insert a profile carrying
  `total_xp` or `is_legendary`; can insert one with the permitted columns; the
  inserted row lands with `level = 1`, `total_xp = 0`, `is_legendary = false`.
  The symmetric twin of the existing UPDATE-grant test.
- **`kairo-core`:** `isValidCharacterName` boundaries — 1, 2, 20, 21 characters,
  whitespace-only, leading/trailing whitespace.
- **By hand on the simulator:** sign in → name → character screen inside 60
  seconds; the HealthKit prompt renders with the intended copy; force-quit
  mid-onboarding resumes at the right step; sign out and back in reaches the
  same profile.

## 9. Out of scope

Push notifications (§14 defers them until a squad or sabotage event exists),
body-metric collection (soft prompt, Phase 7 settings), class selection (MVP is
Hunter-only per §6), squad UI (Phase 4), and any HealthKit **reads** (Phase 3).

## 10. Follow-ups this creates

- Re-enable anonymous sign-ins on the project for development; disable when
  Apple Sign-In lands.
- Enrolling in the Apple Developer Program unblocks: Sign in with Apple, the
  HealthKit capability on the App ID, and device testing.
- Audit the remaining tables for the same table-level INSERT pattern. Not done
  here — `profiles` is the only table Phase 1 makes the client write to, and a
  full grant audit deserves its own pass rather than riding along.

# Phase 1 — Auth and Character-First Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Kairo from a single wiring-proof screen to a real signed-in experience — sign in, name your Hunter, land on a character screen — with the HealthKit permission asked in context afterwards rather than as a gate.

**Architecture:** A thin provider abstraction over Supabase auth (anonymous today, Apple later) feeds a Zustand session store. A single pure `resolveRoute()` function drives an Expo Router gate across three states, using profile-row existence as the onboarding marker. All decision logic is pure and unit-tested in Node; native and rendering code stays thin — the same split the Edge Functions use with their `*-plan.ts` modules.

**Tech Stack:** Expo SDK 57 · Expo Router (typed routes) · React Native 0.86 · Zustand (session/UI) · TanStack Query (server cache) · `@kingstinct/react-native-healthkit` · Supabase (Postgres + RLS) · Vitest + PGlite

## Global Constraints

- **Spec source of truth:** `Kairo_Master_Summary.md` v1.3. `§` references in code point there. Deviations go in `docs/roadmap.md`'s table, not into code silently.
- **Design source of truth:** `docs/superpowers/specs/2026-07-28-phase-1-auth-onboarding-design.md`.
- **No new npm dependencies.** Everything needed is already installed. The Hunter placeholder is drawn with plain `View`s — `react-native-svg` is not a dependency and must not become one.
- **`packages/kairo-core` stays pure:** zero dependencies, no I/O, no clock reads, no randomness. Anything app-specific (routing, native permissions) belongs in `src/`, never in core.
- **Imports use explicit `.ts` extensions** — Deno requires them, Metro and Vite accept them.
- **Pure modules must not import native or aliased modules.** Root Vitest has no `@/` alias and cannot load Nitro native modules, so every unit-tested file imports only relative paths and plain TypeScript.
- **Client writes are column-scoped.** `level`, `total_xp` and `is_legendary` are server-awarded. Never name them in a client insert or update.
- **Migrations cannot be pushed with the CLI** (port 5432 blocked, direct host IPv6-only, no Docker). Apply with `./supabase/scripts/remote-sql.sh -f <file>`, then insert the `supabase_migrations.schema_migrations` row by hand.
- **Anonymous sign-in is development-only.** It must be unreachable in release builds via `__DEV__`, and disabled on the project when Apple Sign-In lands.
- **Palette** (already established by the screen being replaced): background `#08080C`, surface `#12121A`, border `#22223040`, text `#F5F5FF`, muted `#6E6E85`, subtle `#9A9AB0`, accent `#8B7CFF`.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260728170000_profiles_insert_grant.sql` | Column-scopes the client's INSERT on `profiles` |
| `packages/kairo-core/src/profile.ts` | Character-name rules shared by client and DB |
| `packages/kairo-core/src/profile.test.ts` | Name boundary tests |
| `src/theme.ts` | Colour, spacing and radius tokens |
| `src/features/auth/providers.ts` | `SignInProvider` abstraction; anonymous implementation |
| `src/features/auth/session.ts` | Zustand session store, listener, sign-out |
| `src/features/auth/route.ts` | Pure `resolveRoute()` gate logic |
| `src/features/auth/route.test.ts` | Gate ordering tests |
| `src/features/profile/queries.ts` | `useProfile()` and the shared query key |
| `src/features/profile/device-timezone.ts` | Device IANA zone |
| `src/features/profile/create-profile.ts` | `useCreateProfile()` mutation |
| `src/features/profile/timezone-sync.ts` | Pure `shouldUpdateTimezone()` + `useTimezoneSync()` |
| `src/features/profile/timezone-sync.test.ts` | Timezone drift tests |
| `src/features/character/queries.ts` | `useTodayScore()` for the device-local date |
| `src/features/character/StatBar.tsx` | One stat row |
| `src/features/character/HunterSilhouette.tsx` | Code-drawn placeholder art |
| `src/features/health/permission-state.ts` | Pure permission-state mapper |
| `src/features/health/permission-state.test.ts` | Mapper tests |
| `src/features/health/permission.ts` | Native HealthKit adapter (thin) |
| `src/features/health/HealthPermissionSheet.tsx` | The in-context ask |
| `app/(auth)/sign-in.tsx` | Sign-in screen |
| `app/(onboard)/name.tsx` | Name entry |
| `app/(tabs)/_layout.tsx` | Tab bar |
| `app/(tabs)/index.tsx` | Character screen |
| `app/(tabs)/squad.tsx` | Stub (Phase 4) |
| `app/(tabs)/profile.tsx` | Stub + sign-out |

**Modified:** `supabase/tests/schema.test.ts` · `packages/kairo-core/src/index.ts` · `vitest.config.ts` · `app/_layout.tsx` · `docs/roadmap.md`

**Deleted:** `app/index.tsx` (the wiring placeholder)

---

## Task 1: Column-scope the client's INSERT on `profiles`

Closes a live privilege hole that Phase 1 is about to make reachable. `profiles_insert_own` checks `id = auth.uid()`, but an RLS policy constrains **rows, not columns** — and `INSERT` is granted table-wide. A client can create its own profile with `level`, `total_xp` and `is_legendary` set to anything. This is the exact twin of the UPDATE hole closed in `20260727120400_rls.sql`.

**Files:**
- Create: `supabase/migrations/20260728170000_profiles_insert_grant.sql`
- Modify: `supabase/tests/schema.test.ts` (add to the existing grant `describe` block, near the current "blocks clients from awarding themselves XP" test at ~line 595)

**Interfaces:**
- Consumes: nothing
- Produces: an `authenticated` role that may insert only `id, character_name, class, timezone, height_cm, weight_kg, birth_year, sex, has_wearable, exclude_from_recap` into `public.profiles`. Task 5's insert depends on exactly this column list.

- [ ] **Step 1: Write the failing tests**

Add to `supabase/tests/schema.test.ts`, immediately after the existing `it('blocks clients from awarding themselves XP or Legendary status', ...)`:

```ts
  it('blocks clients from inserting a profile with server-awarded columns', async () => {
    // A bare auth user with no profile yet — h.createUser() would create one.
    const seeded = await h.asService<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      ['insert-grant-probe@example.test'],
    );
    const id = seeded[0]!.id;

    await rejects(
      h.asUser(
        id,
        `insert into public.profiles (id, character_name, total_xp)
         values ($1, 'Cheater', 999999)`,
        [id],
      ),
      /permission denied/i,
    );

    await rejects(
      h.asUser(
        id,
        `insert into public.profiles (id, character_name, is_legendary)
         values ($1, 'Cheater', true)`,
        [id],
      ),
      /permission denied/i,
    );

    await rejects(
      h.asUser(
        id,
        `insert into public.profiles (id, character_name, level)
         values ($1, 'Cheater', 99)`,
        [id],
      ),
      /permission denied/i,
    );
  });

  it('lets a client create its own profile with the permitted columns', async () => {
    const seeded = await h.asService<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      ['onboarding-probe@example.test'],
    );
    const id = seeded[0]!.id;

    await h.asUser(
      id,
      `insert into public.profiles (id, character_name, timezone)
       values ($1, 'Aeon', 'Asia/Dubai')`,
      [id],
    );

    const created = await h.asService<{
      character_name: string;
      timezone: string;
      level: number;
      total_xp: number;
      is_legendary: boolean;
    }>(
      `select character_name, timezone, level, total_xp, is_legendary
       from public.profiles where id = $1`,
      [id],
    );

    expect(created[0]).toMatchObject({
      character_name: 'Aeon',
      timezone: 'Asia/Dubai',
      level: 1,
      total_xp: 0,
      is_legendary: false,
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts -t "server-awarded columns"
```

Expected: FAIL. The insert succeeds instead of raising, so the `rejects()` assertion reports that the promise resolved.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260728170000_profiles_insert_grant.sql`:

```sql
-- Column-scope the client's INSERT on profiles.
--
-- profiles_insert_own checks `id = auth.uid()`, but an RLS policy constrains
-- ROWS, not columns. INSERT is granted table-wide — Supabase's default
-- privilege for every new table — so a client could create its own profile
-- carrying level, total_xp and is_legendary set to anything. is_legendary is
-- the paid-subscription flag and nothing recomputes it.
--
-- This is the same hole 20260727120400_rls.sql closed for UPDATE. INSERT was
-- missed because nothing inserted a profile until onboarding shipped.
--
-- The same Postgres caveat applies: a column-level REVOKE against a
-- table-level GRANT is silently a no-op, because the table grant already
-- covers every column and you cannot subtract from it. Revoke the table grant
-- first, then re-grant the allowed columns.

begin;

revoke insert on public.profiles from anon, authenticated;

grant insert (
  id,
  character_name,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  has_wearable,
  exclude_from_recap
) on public.profiles to authenticated;

commit;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts
```

Expected: PASS, all suites. The whole file is run because the migration changes grants every other test sits on top of.

- [ ] **Step 5: Apply to the live project**

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260728170000_profiles_insert_grant.sql
```

Then record it, or the CLI will try to re-apply it later:

```bash
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version, name) values ('20260728170000', 'profiles_insert_grant')"
```

- [ ] **Step 6: Verify against the live project**

```bash
./supabase/scripts/remote-sql.sh "select privilege_type from information_schema.table_privileges where table_name='profiles' and grantee='authenticated' order by 1"
```

Expected: `INSERT` is **gone** from the list (only `DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE` remain — `DELETE` is harmless, `profiles` has no DELETE policy so RLS denies it).

```bash
./supabase/scripts/remote-sql.sh "select column_name from information_schema.column_privileges where table_name='profiles' and grantee='authenticated' and privilege_type='INSERT' order by 1"
```

Expected: exactly the ten granted columns, with no `level`, `total_xp` or `is_legendary`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260728170000_profiles_insert_grant.sql supabase/tests/schema.test.ts
git commit -m "Column-scope the client INSERT grant on profiles

RLS constrains rows, not columns, so profiles_insert_own left level,
total_xp and is_legendary writable by any client creating its own
profile. Same hole the UPDATE grant closed; INSERT was missed because
nothing inserted a profile until onboarding."
```

---

## Task 2: Character-name rules in `kairo-core`

One rule, not two that drift. The DB `CHECK` is `char_length(btrim(character_name)) between 2 and 20`; the name field needs the identical rule for inline validation.

**Files:**
- Create: `packages/kairo-core/src/profile.ts`
- Create: `packages/kairo-core/src/profile.test.ts`
- Modify: `packages/kairo-core/src/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `CHARACTER_NAME_MIN: 2`, `CHARACTER_NAME_MAX: 20`, `normalizeCharacterName(raw: string): string`, `isValidCharacterName(raw: string): boolean`. Tasks 5 uses both functions.

- [ ] **Step 1: Write the failing tests**

Create `packages/kairo-core/src/profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_NAME_MAX,
  CHARACTER_NAME_MIN,
  isValidCharacterName,
  normalizeCharacterName,
} from './profile.ts';

describe('normalizeCharacterName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeCharacterName('  Aeon  ')).toBe('Aeon');
  });

  it('leaves inner spacing alone', () => {
    expect(normalizeCharacterName('Shadow Monarch')).toBe('Shadow Monarch');
  });
});

describe('isValidCharacterName', () => {
  it('rejects an empty name', () => {
    expect(isValidCharacterName('')).toBe(false);
  });

  it('rejects whitespace only', () => {
    expect(isValidCharacterName('     ')).toBe(false);
  });

  it('rejects one character', () => {
    expect(isValidCharacterName('A')).toBe(false);
  });

  it('accepts exactly the minimum', () => {
    expect(isValidCharacterName('A'.repeat(CHARACTER_NAME_MIN))).toBe(true);
  });

  it('accepts exactly the maximum', () => {
    expect(isValidCharacterName('A'.repeat(CHARACTER_NAME_MAX))).toBe(true);
  });

  it('rejects one past the maximum', () => {
    expect(isValidCharacterName('A'.repeat(CHARACTER_NAME_MAX + 1))).toBe(false);
  });

  it('measures the trimmed length, matching the database CHECK', () => {
    // btrim() in the constraint means padding cannot buy length...
    expect(isValidCharacterName(' A ')).toBe(false);
    // ...nor cost it.
    expect(isValidCharacterName(`  ${'A'.repeat(CHARACTER_NAME_MAX)}  `)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:core -- --run src/profile.test.ts
```

Expected: FAIL — cannot resolve `./profile.ts`.

- [ ] **Step 3: Write the implementation**

Create `packages/kairo-core/src/profile.ts`:

```ts
/**
 * Character-name rules, shared by the client's inline validation and the
 * database CHECK on profiles.character_name.
 *
 * The constraint is `char_length(btrim(character_name)) between 2 and 20`, so
 * length is measured after trimming. Clients should store the normalized form
 * — the database would accept padding, but then two players could hold names
 * that render identically.
 */

export const CHARACTER_NAME_MIN = 2;
export const CHARACTER_NAME_MAX = 20;

export function normalizeCharacterName(raw: string): string {
  return raw.trim();
}

export function isValidCharacterName(raw: string): boolean {
  const length = normalizeCharacterName(raw).length;
  return length >= CHARACTER_NAME_MIN && length <= CHARACTER_NAME_MAX;
}
```

- [ ] **Step 4: Export it**

Add to `packages/kairo-core/src/index.ts`, after the `export * from './day.ts';` line:

```ts
export * from './profile.ts';
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run test:core -- --run src/profile.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/kairo-core/src/profile.ts packages/kairo-core/src/profile.test.ts packages/kairo-core/src/index.ts
git commit -m "Add character-name rules to kairo-core

One definition shared by the name field's inline validation and the
database CHECK, rather than two that drift."
```

---

## Task 3: Theme tokens, session store and the provider abstraction

**Files:**
- Create: `src/theme.ts`
- Create: `src/features/auth/providers.ts`
- Create: `src/features/auth/session.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`, `queryClient` from `src/lib/query-client.ts`
- Produces:
  - `colors`, `space`, `radius`, `font` from `src/theme.ts`
  - `type SignInProvider = { id: 'apple' | 'anonymous'; label: string; signIn: () => Promise<{ error: string | null }> }`
  - `availableProviders(): SignInProvider[]`
  - `useSessionStore` — Zustand store of `{ session: Session | null; loading: boolean }`
  - `startSessionListener(): () => void`
  - `signOut(): Promise<void>`

- [ ] **Step 1: Let Vitest see `src/`**

There are no tests under `src/` today. Modify `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Schema tests plus the pure halves of the Edge Functions. The Deno
    // handlers themselves are thin and excluded; everything that makes a
    // decision lives in _shared and runs here in plain Node.
    //
    // The app's pure modules run here too — routing and permission decisions
    // are plain functions for exactly that reason. They must not import
    // native modules or the `@/` alias, neither of which resolves here.
    include: [
      'supabase/tests/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
      'src/**/*.test.ts',
    ],
    // PGlite boots a WASM Postgres and replays every migration per suite.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
```

- [ ] **Step 2: Write the theme tokens**

Create `src/theme.ts`:

```ts
/**
 * Design tokens. The palette is the one the wiring-proof screen established —
 * near-black surfaces with a single violet accent, matching §6's dark-fantasy
 * hunter aesthetic.
 */

export const colors = {
  bg: '#08080C',
  surface: '#12121A',
  border: '#22223040',
  text: '#F5F5FF',
  subtle: '#9A9AB0',
  muted: '#6E6E85',
  accent: '#8B7CFF',
  danger: '#FF6B6B',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const font = {
  brand: { fontSize: 34, fontWeight: '800', letterSpacing: 6 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 1.5 },
} as const;
```

- [ ] **Step 3: Write the provider abstraction**

Create `src/features/auth/providers.ts`:

```ts
import { supabase } from '@/lib/supabase.ts';

/**
 * How a Supabase session is obtained.
 *
 * Deliberately thin: Supabase already normalizes the session, so the only
 * thing that varies between providers is how the credential is produced.
 * Sign in with Apple lands as one more entry here, touching no screen.
 */
export type SignInProviderId = 'apple' | 'anonymous';

export type SignInProvider = {
  id: SignInProviderId;
  label: string;
  signIn: () => Promise<{ error: string | null }>;
};

/**
 * Development stand-in for Sign in with Apple, which needs the capability on
 * the App ID and so the paid Developer Program.
 *
 * Anonymous rather than an email/password form because it is one tap with no
 * fields — structurally the same shape Apple's flow will have. A password form
 * would mean rehearsing a flow that never ships, and §5's "name and character
 * on screen within 60 seconds" is exactly what this phase exists to test.
 */
export const anonymousProvider: SignInProvider = {
  id: 'anonymous',
  label: 'Enter the gate',
  signIn: async () => {
    const { error } = await supabase.auth.signInAnonymously();
    return { error: error?.message ?? null };
  },
};

/**
 * Compiled down to an empty list in release builds. This — not the project's
 * anonymous-sign-in setting — is what guarantees an anonymous path cannot
 * reach TestFlight.
 */
export function availableProviders(): SignInProvider[] {
  return __DEV__ ? [anonymousProvider] : [];
}
```

- [ ] **Step 4: Write the session store**

Create `src/features/auth/session.ts`:

```ts
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { queryClient } from '@/lib/query-client.ts';
import { supabase } from '@/lib/supabase.ts';

type SessionState = {
  session: Session | null;
  /** True until the persisted session has been read from the Keychain. */
  loading: boolean;
};

export const useSessionStore = create<SessionState>(() => ({
  session: null,
  loading: true,
}));

/**
 * Starts one listener for the app's lifetime. Called from the root layout.
 *
 * getSession() resolves the Keychain-restored session; onAuthStateChange
 * covers everything after. Both write the same slice, so a cold start and a
 * later sign-in are indistinguishable to consumers.
 */
export function startSessionListener(): () => void {
  void supabase.auth.getSession().then(({ data }) => {
    useSessionStore.setState({ session: data.session, loading: false });
  });

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    useSessionStore.setState({ session, loading: false });
  });

  return () => data.subscription.unsubscribe();
}

/**
 * Clearing the query cache is not optional: profile and score rows are cached
 * per user id, and a second sign-in on the same device would otherwise render
 * the previous account's data until each query refetched.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  queryClient.clear();
}
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: clean. If `__DEV__` is reported as undefined, confirm `@types/react-native` types are reaching `tsconfig.json` — `expo/tsconfig.base` supplies the global.

- [ ] **Step 6: Commit**

```bash
git add src/theme.ts src/features/auth/providers.ts src/features/auth/session.ts vitest.config.ts
git commit -m "Add theme tokens, session store and sign-in provider abstraction

Anonymous sign-in stands in for Sign in with Apple until the Developer
Program is purchased, and is compiled out of release builds."
```

---

## Task 4: The routing gate and sign-in screen

**Files:**
- Create: `src/features/auth/route.ts`
- Create: `src/features/auth/route.test.ts`
- Create: `src/features/profile/queries.ts`
- Create: `app/(auth)/sign-in.tsx`
- Modify: `app/_layout.tsx`
- Delete: `app/index.tsx`

**Interfaces:**
- Consumes: `useSessionStore`, `startSessionListener` (Task 3); `colors`, `space`, `radius`, `font` (Task 3); `availableProviders` (Task 3)
- Produces:
  - `type AppRoute = 'loading' | 'signed-out' | 'needs-profile' | 'ready'`
  - `resolveRoute(input: { sessionLoading: boolean; hasSession: boolean; profileLoading: boolean; hasProfile: boolean }): AppRoute`
  - `type Profile` and `useProfile(userId: string | undefined)` returning a TanStack query of `Profile | null`
  - `profileKey(userId: string | undefined)` — Task 5 invalidates with it

- [ ] **Step 1: Write the failing gate tests**

Create `src/features/auth/route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveRoute } from './route.ts';

const base = {
  sessionLoading: false,
  hasSession: false,
  profileLoading: false,
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
        hasProfile: true,
      }),
    ).toBe('loading');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --config vitest.config.ts src/features/auth/route.test.ts
```

Expected: FAIL — cannot resolve `./route.ts`.

- [ ] **Step 3: Write the gate logic**

Create `src/features/auth/route.ts`:

```ts
/**
 * Which of the app's three shells the user belongs in.
 *
 * A pure function so the ordering is testable in Node — the ordering is the
 * whole point, and getting it wrong strands users on a spinner rather than
 * failing loudly.
 */
export type AppRoute = 'loading' | 'signed-out' | 'needs-profile' | 'ready';

export function resolveRoute(input: {
  sessionLoading: boolean;
  hasSession: boolean;
  profileLoading: boolean;
  hasProfile: boolean;
}): AppRoute {
  if (input.sessionLoading) return 'loading';
  if (!input.hasSession) return 'signed-out';
  if (input.profileLoading) return 'loading';
  return input.hasProfile ? 'ready' : 'needs-profile';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run --config vitest.config.ts src/features/auth/route.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Write the profile query**

Create `src/features/profile/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';

/**
 * The owner-readable profile. `profiles` is deliberately not readable by
 * squadmates — the row carries height, weight and birth year — so this is only
 * ever the signed-in user's own row.
 */
export type Profile = {
  id: string;
  character_name: string;
  class: string;
  timezone: string;
  level: number;
  total_xp: number;
  has_wearable: boolean;
};

export function profileKey(userId: string | undefined) {
  return ['profile', userId ?? 'none'] as const;
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: profileKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, character_name, class, timezone, level, total_xp, has_wearable')
        .eq('id', userId as string)
        .maybeSingle();

      if (error) throw new Error(error.message);
      // null is meaningful: it is what "onboarding not finished" looks like.
      return (data as Profile | null) ?? null;
    },
  });
}
```

- [ ] **Step 6: Write the sign-in screen**

Create `app/(auth)/sign-in.tsx`:

```tsx
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { availableProviders, type SignInProvider } from '@/features/auth/providers.ts';
import { colors, font, radius, space } from '@/theme.ts';

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providers = availableProviders();

  async function run(provider: SignInProvider) {
    setBusy(true);
    setError(null);
    const result = await provider.signIn();
    if (result.error) setError(result.error);
    // On success the session listener flips the gate; this screen unmounts.
    setBusy(false);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.xl }]}>
      <View style={styles.hero}>
        <Text style={styles.brand}>KAIRO</Text>
        <Text style={styles.tagline}>Every day is a Kairo moment.</Text>
      </View>

      <View style={{ paddingBottom: insets.bottom + space.xl }}>
        {providers.map((provider) => (
          <Pressable
            key={provider.id}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void run(provider)}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.buttonLabel}>{provider.label}</Text>
            )}
          </Pressable>
        ))}

        {providers.length === 0 && (
          <Text style={styles.error}>
            No sign-in method is configured for this build. Sign in with Apple needs
            the capability enabled on the App ID.
          </Text>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
  },
  hero: { flex: 1, justifyContent: 'center' },
  brand: { color: colors.text, ...font.brand },
  tagline: { color: colors.muted, ...font.body, marginTop: space.sm },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  error: { color: colors.danger, ...font.body, marginTop: space.md, textAlign: 'center' },
});
```

- [ ] **Step 7: Wire the gate into the root layout**

Replace `app/_layout.tsx` entirely:

```tsx
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resolveRoute } from '@/features/auth/route.ts';
import { startSessionListener, useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { queryClient } from '@/lib/query-client.ts';
import { colors } from '@/theme.ts';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Gate />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/**
 * Sends the user to the shell they belong in.
 *
 * Profile-row existence is the onboarding marker: character_name is NOT NULL,
 * so the row exists if and only if the name step completed. No extra column,
 * and no local flag that can desync from the server.
 */
function Gate() {
  const router = useRouter();
  const segments = useSegments();
  const session = useSessionStore((s) => s.session);
  const sessionLoading = useSessionStore((s) => s.loading);
  const profile = useProfile(session?.user.id);

  useEffect(() => startSessionListener(), []);

  const route = resolveRoute({
    sessionLoading,
    hasSession: Boolean(session),
    profileLoading: profile.isPending,
    hasProfile: Boolean(profile.data),
  });

  useEffect(() => {
    if (route === 'loading') return;

    const group = segments[0];
    if (route === 'signed-out' && group !== '(auth)') router.replace('/sign-in');
    else if (route === 'needs-profile' && group !== '(onboard)') router.replace('/name');
    else if (route === 'ready' && group !== '(tabs)') router.replace('/');
  }, [route, segments, router]);

  if (route === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <Slot />;
}
```

- [ ] **Step 8: Delete the wiring placeholder**

```bash
git rm app/index.tsx
```

Its job — proving Expo Router renders and `@kairo/core` executes in Hermes — is now done by the real screens.

- [ ] **Step 9: Typecheck and run the app**

```bash
npm run typecheck
npm run ios
```

Expected: the app opens on the sign-in screen. Tapping **Enter the gate** signs in anonymously; because no profile exists, the gate redirects to `/name`, which does not exist yet — Expo Router shows its "Unmatched Route" screen. That is the correct state at the end of this task.

If sign-in returns an error mentioning anonymous sign-ins being disabled, enable them in the Supabase dashboard under **Authentication → Sign In / Providers → Anonymous sign-ins**.

- [ ] **Step 10: Commit**

```bash
git add -A app src/features/auth/route.ts src/features/auth/route.test.ts src/features/profile/queries.ts
git commit -m "Add the auth gate and sign-in screen

Profile-row existence is the onboarding marker, so no extra column and
no local flag that can desync. Route resolution is a pure function
because the ordering is the part that strands users when wrong."
```

---

## Task 5: Name entry and profile creation

Where §5's "name + character on screen within the first 60 seconds" is won or lost. One field, one button, no other asks.

**Files:**
- Create: `src/features/profile/device-timezone.ts`
- Create: `src/features/profile/create-profile.ts`
- Create: `app/(onboard)/name.tsx`

**Interfaces:**
- Consumes: `isValidCharacterName`, `normalizeCharacterName` (Task 2); `profileKey` (Task 4); `useSessionStore` (Task 3); theme tokens (Task 3)
- Produces: `deviceTimeZone(): string`; `useCreateProfile(userId: string | undefined)` — a TanStack mutation taking the raw name string. Task 8 imports `deviceTimeZone`.

- [ ] **Step 1: Write the device timezone helper**

Create `src/features/profile/device-timezone.ts`:

```ts
/**
 * The IANA zone the device is currently in.
 *
 * profiles.timezone defaults to Asia/Manila, and every local-day boundary,
 * finalization window and leaderboard date keys off it (§2). An OFW in Dubai
 * whose zone is never captured would have their day close eight hours early,
 * silently and permanently — which is precisely the case the per-user-day
 * design exists to serve. So it is written at profile creation and re-checked
 * on foreground.
 */
export function deviceTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && zone.length > 0 ? zone : 'Asia/Manila';
}
```

- [ ] **Step 2: Write the profile creation mutation**

Create `src/features/profile/create-profile.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { normalizeCharacterName } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';
import { deviceTimeZone } from './device-timezone.ts';
import { profileKey } from './queries.ts';

export function useCreateProfile(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rawName: string): Promise<void> => {
      if (!userId) throw new Error('Not signed in.');

      // level, total_xp and is_legendary are deliberately absent. The INSERT
      // grant is column-scoped, so naming them would be rejected outright —
      // they are server-awarded and take their column defaults here.
      const { error } = await supabase.from('profiles').insert({
        id: userId,
        character_name: normalizeCharacterName(rawName),
        timezone: deviceTimeZone(),
      });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(userId) }),
  });
}
```

- [ ] **Step 3: Write the name screen**

Create `app/(onboard)/name.tsx`:

```tsx
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHARACTER_NAME_MAX, isValidCharacterName } from '@kairo/core';
import { useSessionStore } from '@/features/auth/session.ts';
import { useCreateProfile } from '@/features/profile/create-profile.ts';
import { colors, font, radius, space } from '@/theme.ts';

export default function NameYourHunter() {
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const createProfile = useCreateProfile(session?.user.id);
  const [name, setName] = useState('');

  const valid = isValidCharacterName(name);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top + space.xl }]}
    >
      <View style={styles.top}>
        <Text style={styles.label}>NAME YOUR HUNTER</Text>
        <Text style={styles.title}>Who are you going to be?</Text>
        <Text style={styles.help}>
          This is the name your squad will see on the leaderboard. You can change it
          later.
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          autoFocus
          autoCorrect={false}
          maxLength={CHARACTER_NAME_MAX}
          placeholder="Aeon"
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (valid && !createProfile.isPending) createProfile.mutate(name);
          }}
        />

        {createProfile.error && (
          <Text style={styles.error}>{createProfile.error.message}</Text>
        )}
      </View>

      <View style={{ paddingBottom: insets.bottom + space.xl }}>
        <Pressable
          accessibilityRole="button"
          disabled={!valid || createProfile.isPending}
          onPress={() => createProfile.mutate(name)}
          style={({ pressed }) => [
            styles.button,
            (!valid || createProfile.isPending) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {createProfile.isPending ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.buttonLabel}>Begin</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
  },
  top: { flex: 1 },
  label: { color: colors.muted, ...font.label },
  title: { color: colors.text, ...font.title, marginTop: space.sm },
  help: { color: colors.subtle, ...font.body, marginTop: space.sm },
  input: {
    marginTop: space.xl,
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    paddingVertical: space.sm,
  },
  error: { color: colors.danger, ...font.body, marginTop: space.md },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.35 },
  buttonPressed: { opacity: 0.85 },
  buttonLabel: { color: colors.bg, fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 4: Typecheck and run**

```bash
npm run typecheck
npm run ios
```

Expected: sign in → the name screen appears with the keyboard already up. The **Begin** button is dimmed until two non-space characters are entered. Submitting creates the profile; the gate then redirects to `/`, which does not exist yet — Expo Router shows "Unmatched Route". Correct at the end of this task.

- [ ] **Step 5: Verify the profile landed with server-awarded defaults**

```bash
./supabase/scripts/remote-sql.sh "select character_name, timezone, level, total_xp, is_legendary from public.profiles order by created_at desc limit 1"
```

Expected: your name, your device's IANA zone, `level` 1, `total_xp` 0, `is_legendary` false.

- [ ] **Step 6: Commit**

```bash
git add src/features/profile/device-timezone.ts src/features/profile/create-profile.ts "app/(onboard)/name.tsx"
git commit -m "Add name entry and profile creation

Captures the device IANA zone at creation: profiles.timezone defaults to
Asia/Manila and every local-day boundary keys off it, so an unset zone
would silently close an overseas user's day hours early."
```

---

## Task 6: Tab shell and the character screen

The payoff screen. With no health data every value is zero, so the empty state **is** the designed state — it is what every new user sees for their first minutes.

**Files:**
- Create: `src/features/character/queries.ts`
- Create: `src/features/character/StatBar.tsx`
- Create: `src/features/character/HunterSilhouette.tsx`
- Create: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/index.tsx`
- Create: `app/(tabs)/squad.tsx`
- Create: `app/(tabs)/profile.tsx`

**Interfaces:**
- Consumes: `useProfile` (Task 4), `signOut` (Task 3), theme tokens (Task 3), `currentLocalDate`, `levelForXp`, `evolutionStageForLevel`, `CORE_STATS` from `@kairo/core`
- Produces: `useTodayScore(userId, timeZone)`; `<StatBar />`; `<HunterSilhouette />`. Task 7 modifies `app/(tabs)/index.tsx`.

- [ ] **Step 1: Write the today-score query**

Create `src/features/character/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { currentLocalDate } from '@kairo/core';
import { supabase } from '@/lib/supabase.ts';

export type TodayScore = {
  agi_points: number;
  str_points: number;
  end_points: number;
  vit_points: number;
  rec_points: number;
  consistency_points: number;
  sabotage_delta: number;
  total: number;
  tiers: Record<string, string>;
  contributing_stats: number;
  featured_stat: string | null;
  status: 'provisional' | 'final';
};

/**
 * Today's row, in the user's own timezone (§2) — not the device's calendar
 * date, and not UTC. A squad spans several calendar dates at any instant.
 */
export function useTodayScore(userId: string | undefined, timeZone: string | undefined) {
  const localDate = timeZone ? currentLocalDate(new Date(), timeZone) : undefined;

  return useQuery({
    queryKey: ['today-score', userId ?? 'none', localDate ?? 'none'],
    enabled: Boolean(userId && localDate),
    queryFn: async (): Promise<TodayScore | null> => {
      const { data, error } = await supabase
        .from('daily_scores')
        .select(
          'agi_points, str_points, end_points, vit_points, rec_points, ' +
            'consistency_points, sabotage_delta, total, tiers, ' +
            'contributing_stats, featured_stat, status',
        )
        .eq('user_id', userId as string)
        .eq('local_date', localDate as string)
        .maybeSingle();

      if (error) throw new Error(error.message);
      // null until sync-health writes the first bucket. The UI renders zeros.
      return (data as TodayScore | null) ?? null;
    },
  });
}
```

- [ ] **Step 2: Write the stat bar**

Create `src/features/character/StatBar.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme.ts';

/** Highest points a single stat can contribute in a day, before the featured
 *  multiplier — the Gold tier ceiling from §6. Used only to size the bar. */
const STAT_MAX = 900;

export function StatBar({
  stat,
  label,
  points,
  featured,
}: {
  stat: string;
  label: string;
  points: number;
  featured: boolean;
}) {
  const fill = Math.max(0, Math.min(1, points / STAT_MAX));

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.stat}>
          {stat}
          {featured && <Text style={styles.featured}> ×1.5</Text>}
        </Text>
        <Text style={styles.points}>{points.toLocaleString()}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${fill * 100}%` },
            featured && { backgroundColor: colors.accent },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: space.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  stat: { color: colors.text, fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  featured: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  points: { color: colors.subtle, fontSize: 14, fontWeight: '600' },
  label: { color: colors.muted, fontSize: 12, marginTop: 2 },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    marginTop: space.xs,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.subtle },
});
```

- [ ] **Step 3: Write the Hunter placeholder**

Create `src/features/character/HunterSilhouette.tsx`:

```tsx
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '@/theme.ts';

/**
 * Placeholder Hunter, drawn with plain Views — no asset pipeline and no new
 * dependency (react-native-svg is deliberately not installed).
 *
 * Phase 7 replaces this whole component with the generated art, four evolution
 * stages by dominant stat (§6). Until then `stage` only brightens the aura, so
 * levelling visibly does something.
 */
export function HunterSilhouette({ stage }: { stage: 1 | 2 | 3 | 4 }) {
  const auraOpacity = 0.1 + stage * 0.12;

  return (
    <View style={styles.frame}>
      <View style={[styles.aura, { opacity: auraOpacity }]} />
      <View style={styles.figure}>
        <View style={styles.head} />
        <View style={styles.shoulders} />
        <View style={styles.torso} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 220, alignItems: 'center', justifyContent: 'flex-end' },
  aura: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  figure: { alignItems: 'center' },
  head: {
    width: 46,
    height: 52,
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: colors.text,
  },
  shoulders: {
    width: 132,
    height: 34,
    marginTop: -6,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    backgroundColor: colors.text,
  },
  torso: {
    width: 104,
    height: 96,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    backgroundColor: colors.text,
  },
});
```

- [ ] **Step 4: Write the tab shell and stub tabs**

Create `app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router';
import { colors } from '@/theme.ts';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Character' }} />
      <Tabs.Screen name="squad" options={{ title: 'Squad' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
```

Create `app/(tabs)/squad.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, space } from '@/theme.ts';

export default function Squad() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top + space.lg }]}>
      <Text style={styles.title}>Squad</Text>
      <Text style={styles.body}>
        Squads arrive in Phase 4 — create or join by a six-digit code, then watch the
        leaderboard reorder live.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg },
  title: { color: colors.text, ...font.title },
  body: { color: colors.muted, ...font.body, marginTop: space.sm },
});
```

Create `app/(tabs)/profile.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut, useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { colors, font, radius, space } from '@/theme.ts';

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.lg }]}>
      <Text style={styles.title}>{profile.data?.character_name ?? 'Profile'}</Text>
      <Text style={styles.body}>Timezone {profile.data?.timezone ?? '—'}</Text>
      <Text style={styles.body}>Level {profile.data?.level ?? 1}</Text>

      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.buttonLabel}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg },
  title: { color: colors.text, ...font.title },
  body: { color: colors.muted, ...font.body, marginTop: space.sm },
  button: {
    marginTop: space.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  buttonLabel: { color: colors.danger, fontSize: 16, fontWeight: '700' },
});
```

- [ ] **Step 5: Write the character screen**

Create `app/(tabs)/index.tsx`:

```tsx
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CORE_STATS, evolutionStageForLevel, levelForXp, type CoreStat } from '@kairo/core';
import { HunterSilhouette } from '@/features/character/HunterSilhouette.tsx';
import { StatBar } from '@/features/character/StatBar.tsx';
import { useTodayScore } from '@/features/character/queries.ts';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { colors, font, radius, space } from '@/theme.ts';

const STAT_LABELS: Record<CoreStat, string> = {
  AGI: 'Steps and distance',
  STR: 'Active calories',
  END: 'Active minutes',
  VIT: 'Hourly movement',
};

export default function Character() {
  const insets = useSafeAreaInsets();
  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);
  const score = useTodayScore(session?.user.id, profile.data?.timezone);

  const totalXp = profile.data?.total_xp ?? 0;
  const level = profile.data?.level ?? levelForXp(totalXp);
  const stage = evolutionStageForLevel(level);
  const today = score.data;

  const points: Record<CoreStat, number> = {
    AGI: today?.agi_points ?? 0,
    STR: today?.str_points ?? 0,
    END: today?.end_points ?? 0,
    VIT: today?.vit_points ?? 0,
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.lg,
      }}
    >
      <Text style={styles.label}>LEVEL {level}</Text>
      <Text style={styles.name}>{profile.data?.character_name ?? '—'}</Text>

      <HunterSilhouette stage={stage} />

      <View style={styles.card}>
        <Text style={styles.label}>TODAY</Text>
        <Text style={styles.total}>{(today?.total ?? 0).toLocaleString()}</Text>
        <Text style={styles.meta}>
          {today
            ? `${today.contributing_stats} of 4 stats contributing`
            : 'No activity synced yet today.'}
        </Text>
      </View>

      {CORE_STATS.map((stat) => (
        <StatBar
          key={stat}
          stat={stat}
          label={STAT_LABELS[stat]}
          points={points[stat]}
          featured={today?.featured_stat === stat}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  label: { color: colors.muted, ...font.label },
  name: { color: colors.text, ...font.title, marginTop: space.xs },
  card: {
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  total: { color: colors.accent, fontSize: 48, fontWeight: '800', marginTop: space.sm },
  meta: { color: colors.subtle, fontSize: 13, marginTop: space.xs },
});
```

- [ ] **Step 6: Typecheck and run**

```bash
npm run typecheck
npm run ios
```

Expected: after naming your Hunter you land on the character screen — level 1, your name, the silhouette, a total of 0, "No activity synced yet today.", and four stat bars at zero. Tabs switch between Character, Squad and Profile. Sign out on the Profile tab returns you to sign-in.

- [ ] **Step 7: Commit**

```bash
git add src/features/character "app/(tabs)"
git commit -m "Add the tab shell and character screen

With no health data every value is zero, so the empty state is the
designed state — it is what every new user sees before HealthKit has
given them anything."
```

---

## Task 7: The HealthKit permission ask

Not an onboarding route. A sheet over the character screen, so the prompt literally overlays the Hunter it is about to power — which is what §5's "permissions in context" is describing.

**Files:**
- Create: `src/features/health/permission-state.ts`
- Create: `src/features/health/permission-state.test.ts`
- Create: `src/features/health/permission.ts`
- Create: `src/features/health/HealthPermissionSheet.tsx`
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: theme tokens (Task 3)
- Produces: `type RequestStatus = 'unknown' | 'should-request' | 'unnecessary'`; `type HealthPermissionState = 'unavailable' | 'should-ask' | 'asked'`; `permissionState(input)`; `KAIRO_READ_TYPES`; `readHealthPermissionState(): Promise<HealthPermissionState>`; `requestHealthPermission(): Promise<boolean>`; `<HealthPermissionSheet />`

- [ ] **Step 1: Write the failing mapper tests**

Create `src/features/health/permission-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { permissionState } from './permission-state.ts';

describe('permissionState', () => {
  it('is unavailable when the device has no HealthKit', () => {
    expect(permissionState({ available: false, requestStatus: 'should-request' })).toBe(
      'unavailable',
    );
  });

  it('asks when HealthKit says the request has not been made', () => {
    expect(permissionState({ available: true, requestStatus: 'should-request' })).toBe(
      'should-ask',
    );
  });

  it('does not ask again once the request is unnecessary', () => {
    expect(permissionState({ available: true, requestStatus: 'unnecessary' })).toBe(
      'asked',
    );
  });

  it('asks when the status cannot be determined', () => {
    // iOS silently no-ops a prompt for types already authorized, so asking on
    // `unknown` costs nothing. Treating it as answered would mean a user who
    // hits this state is never asked at all.
    expect(permissionState({ available: true, requestStatus: 'unknown' })).toBe(
      'should-ask',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --config vitest.config.ts src/features/health/permission-state.test.ts
```

Expected: FAIL — cannot resolve `./permission-state.ts`.

- [ ] **Step 3: Write the pure mapper**

Create `src/features/health/permission-state.ts` — no native imports, which is why it can be tested in Node at all:

```ts
/**
 * Our own vocabulary for HealthKit's request status, so the decision is a
 * plain function. The native enum is translated in permission.ts; nothing
 * importable from `@kingstinct/react-native-healthkit` appears in this file.
 *
 * Same split the Edge Functions use: decisions pure and tested, I/O thin.
 */
export type RequestStatus = 'unknown' | 'should-request' | 'unnecessary';

export type HealthPermissionState = 'unavailable' | 'should-ask' | 'asked';

export function permissionState(input: {
  available: boolean;
  requestStatus: RequestStatus;
}): HealthPermissionState {
  if (!input.available) return 'unavailable';
  return input.requestStatus === 'unnecessary' ? 'asked' : 'should-ask';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run --config vitest.config.ts src/features/health/permission-state.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Write the native adapter**

Create `src/features/health/permission.ts`:

```ts
import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailable,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import {
  permissionState,
  type HealthPermissionState,
  type RequestStatus,
} from './permission-state.ts';

/**
 * Everything Kairo reads (§5). Steps and distance drive AGI, active energy
 * STR, exercise time END, hourly steps VIT, sleep REC. Heart rate and workouts
 * exist only for the anti-cheat cross-check (§20) — a normal jog must never
 * flag — and are requested here so the user is asked once rather than twice.
 *
 * Kairo never writes to Health, so there is no `toShare` list.
 */
export const KAIRO_READ_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierHeartRate',
  'HKWorkoutTypeIdentifier',
] as const;

function toRequestStatus(status: AuthorizationRequestStatus): RequestStatus {
  if (status === AuthorizationRequestStatus.unnecessary) return 'unnecessary';
  if (status === AuthorizationRequestStatus.shouldRequest) return 'should-request';
  return 'unknown';
}

/**
 * getRequestStatusForAuthorization, not authorizationStatusFor.
 *
 * HealthKit deliberately never reveals READ authorization — doing so would leak
 * whether a user has a given condition — so authorizationStatusFor cannot
 * answer "have I asked yet" for read types. This call can.
 */
export async function readHealthPermissionState(): Promise<HealthPermissionState> {
  const available = isHealthDataAvailable();
  if (!available) return permissionState({ available, requestStatus: 'unknown' });

  const status = await getRequestStatusForAuthorization({ toRead: KAIRO_READ_TYPES });
  return permissionState({ available, requestStatus: toRequestStatus(status) });
}

/**
 * Shows the iOS sheet. Resolves true once the user has answered — HealthKit
 * does not report what they chose for read types, so this is "they were asked",
 * not "they said yes".
 */
export async function requestHealthPermission(): Promise<boolean> {
  return requestAuthorization({ toRead: KAIRO_READ_TYPES });
}
```

- [ ] **Step 6: Write the sheet**

Create `src/features/health/HealthPermissionSheet.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme.ts';
import { readHealthPermissionState, requestHealthPermission } from './permission.ts';

/**
 * The in-context ask (§5). Presented over the character screen so the prompt
 * overlays the Hunter it is about to power, rather than gating the user before
 * they have anything to care about.
 *
 * Dismissal is per-session on purpose: there is no "never ask again" until
 * there is a settings screen to re-enable it from (Phase 7).
 */
export function HealthPermissionSheet() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readHealthPermissionState().then((state) => {
      if (!cancelled) setVisible(state === 'should-ask');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function ask() {
    setBusy(true);
    try {
      await requestHealthPermission();
    } finally {
      setBusy(false);
      setVisible(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.label}>POWER YOUR CHARACTER</Text>
          <Text style={styles.title}>Your real life is the game</Text>
          <Text style={styles.body}>
            Kairo reads your steps, distance, active calories and active minutes from
            Apple Health. That is what levels your Hunter and puts you on the squad
            leaderboard.
          </Text>
          <Text style={styles.fine}>
            Your squad only ever sees tiers and scores — never your raw numbers, and
            never when you move. Kairo writes nothing back to Health.
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void ask()}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.buttonLabel}>Connect Apple Health</Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => setVisible(false)}>
            <Text style={styles.later}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000AA' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    paddingBottom: space.xl,
  },
  label: { color: colors.accent, ...font.label },
  title: { color: colors.text, ...font.title, marginTop: space.sm },
  body: { color: colors.subtle, ...font.body, marginTop: space.md },
  fine: { color: colors.muted, fontSize: 13, marginTop: space.md },
  button: {
    marginTop: space.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  buttonLabel: { color: colors.bg, fontSize: 16, fontWeight: '700' },
  later: {
    color: colors.muted,
    ...font.body,
    textAlign: 'center',
    marginTop: space.md,
  },
});
```

- [ ] **Step 7: Mount it on the character screen**

In `app/(tabs)/index.tsx`, add the import alongside the others:

```tsx
import { HealthPermissionSheet } from '@/features/health/HealthPermissionSheet.tsx';
```

and render it as the last child inside the `<ScrollView>`, after the `.map()` over the stat bars:

```tsx
      <HealthPermissionSheet />
```

- [ ] **Step 8: Typecheck and run**

```bash
npm run typecheck
npm run ios
```

Expected: after onboarding, the sheet slides up over the character screen. **Connect Apple Health** shows the real iOS permission dialog carrying the `NSHealthShareUsageDescription` copy from `app.config.ts`. Answering it dismisses the sheet, and it does not reappear on the next launch. **Not now** dismisses without asking; it returns on next launch, which is intended until Phase 7 adds a settings toggle.

Read the iOS dialog copy critically — this is the one clean shot §5 warns about, and this step exists to judge it.

- [ ] **Step 9: Commit**

```bash
git add src/features/health "app/(tabs)/index.tsx"
git commit -m "Add the in-context HealthKit permission ask

A sheet over the character screen rather than an onboarding gate, so the
prompt overlays the Hunter it powers. Uses
getRequestStatusForAuthorization because HealthKit never reveals read
authorization — authorizationStatusFor cannot answer 'have I asked'."
```

---

## Task 8: Keep the stored timezone honest

A user who flies to Dubai keeps a Manila profile, and their day closes eight hours early. This is the cheapest possible fix and the one §2 depends on.

**Files:**
- Create: `src/features/profile/timezone-sync.ts`
- Create: `src/features/profile/timezone-sync.test.ts`
- Modify: `app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `deviceTimeZone` (Task 5), `profileKey` and `useProfile` (Task 4)
- Produces: `shouldUpdateTimezone(stored: string | undefined, device: string): boolean`; `useTimezoneSync(userId: string | undefined, storedTimeZone: string | undefined): void`

- [ ] **Step 1: Write the failing tests**

Create `src/features/profile/timezone-sync.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldUpdateTimezone } from './timezone-sync.ts';

describe('shouldUpdateTimezone', () => {
  it('does nothing when the zone matches', () => {
    expect(shouldUpdateTimezone('Asia/Manila', 'Asia/Manila')).toBe(false);
  });

  it('updates when the user has travelled', () => {
    expect(shouldUpdateTimezone('Asia/Manila', 'Asia/Dubai')).toBe(true);
  });

  it('waits until the profile has loaded', () => {
    expect(shouldUpdateTimezone(undefined, 'Asia/Dubai')).toBe(false);
  });

  it('never overwrites a stored zone with an empty one', () => {
    // Intl can return an empty string on a misconfigured device. Writing that
    // would fail the profiles timezone trigger and, worse, is not information.
    expect(shouldUpdateTimezone('Asia/Manila', '')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --config vitest.config.ts src/features/profile/timezone-sync.test.ts
```

Expected: FAIL — cannot resolve `./timezone-sync.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/features/profile/timezone-sync.ts`:

```ts
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase.ts';
import { deviceTimeZone } from './device-timezone.ts';
import { profileKey } from './queries.ts';

export function shouldUpdateTimezone(
  stored: string | undefined,
  device: string,
): boolean {
  if (!stored) return false;
  if (!device) return false;
  return stored !== device;
}

/**
 * Reconciles profiles.timezone with the device on every foreground.
 *
 * Cheap, and the alternative is silent: a user who travels keeps finalizing on
 * their old midnight, and nothing in the app looks broken while their day
 * closes at the wrong hour.
 */
export function useTimezoneSync(
  userId: string | undefined,
  storedTimeZone: string | undefined,
): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    async function reconcile() {
      const device = deviceTimeZone();
      if (!shouldUpdateTimezone(storedTimeZone, device)) return;

      const { error } = await supabase
        .from('profiles')
        .update({ timezone: device })
        .eq('id', userId as string);

      if (error) return;
      await queryClient.invalidateQueries({ queryKey: profileKey(userId) });
    }

    void reconcile();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcile();
    });

    return () => subscription.remove();
  }, [userId, storedTimeZone, queryClient]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run --config vitest.config.ts src/features/profile/timezone-sync.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Mount the hook**

Modify `app/(tabs)/_layout.tsx` to call it — the tabs are the only place a signed-in user with a profile spends time. Replace the file with:

```tsx
import { Tabs } from 'expo-router';
import { useSessionStore } from '@/features/auth/session.ts';
import { useProfile } from '@/features/profile/queries.ts';
import { useTimezoneSync } from '@/features/profile/timezone-sync.ts';
import { colors } from '@/theme.ts';

export default function TabsLayout() {
  const session = useSessionStore((s) => s.session);
  const profile = useProfile(session?.user.id);

  useTimezoneSync(session?.user.id, profile.data?.timezone);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Character' }} />
      <Tabs.Screen name="squad" options={{ title: 'Squad' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
```

- [ ] **Step 6: Verify by hand**

```bash
npm run ios
```

In the simulator, change the region under **Settings → General → Language & Region**, or run:

```bash
xcrun simctl spawn booted defaults write .GlobalPreferences AppleTimeZone Asia/Dubai
```

Background and foreground the app, then check the stored zone followed:

```bash
./supabase/scripts/remote-sql.sh "select character_name, timezone from public.profiles order by created_at desc limit 1"
```

Expected: the Profile tab and the database both show the new zone.

- [ ] **Step 7: Commit**

```bash
git add src/features/profile/timezone-sync.ts src/features/profile/timezone-sync.test.ts "app/(tabs)/_layout.tsx"
git commit -m "Reconcile profiles.timezone with the device on foreground

A user who travels otherwise keeps finalizing on their old midnight,
and nothing in the app looks broken while it happens."
```

---

## Task 9: Full verification and roadmap update

**Files:**
- Modify: `docs/roadmap.md`

**Interfaces:**
- Consumes: everything above
- Produces: nothing consumed by later work

- [ ] **Step 1: Run the whole suite**

```bash
npm test
npm run typecheck
```

Expected: all suites pass; typecheck clean across `tsc`, workspaces and `deno check`.

- [ ] **Step 2: Walk the flow end to end on the simulator**

```bash
npm run ios
```

Confirm each of these:

1. Cold start lands on sign-in, not a flash of the character screen.
2. Sign in → name → character screen in under 60 seconds (§5's actual claim).
3. The HealthKit sheet appears over the character screen, and the iOS dialog shows the intended copy.
4. Force-quit during onboarding and relaunch resumes on the name screen, not sign-in.
5. Sign out on the Profile tab returns to sign-in, and signing in again reaches a *new* anonymous user with no profile — cache cleared, no stale name shown.
6. A name of one character leaves **Begin** disabled; twenty characters is accepted; twenty-one cannot be typed.

- [ ] **Step 3: Confirm the database state**

```bash
./supabase/scripts/remote-sql.sh "select count(*) as profiles from public.profiles"
./supabase/scripts/remote-sql.sh "select column_name from information_schema.column_privileges where table_name='profiles' and grantee='authenticated' and privilege_type='INSERT' order by 1"
```

Expected: your test profiles, and exactly the ten permitted insert columns.

- [ ] **Step 4: Update the roadmap**

In `docs/roadmap.md`, change the Phase 1 block to:

```markdown
### ✅ Phase 1 — Auth + onboarding · 35–45h
- ✅ Sign-in provider abstraction; **anonymous sign-in stands in for Apple**
  until the Developer Program is purchased, and is compiled out of release
  builds via `__DEV__`
- ✅ Character-first flow: name + Hunter on screen inside 60 seconds (§5)
- ✅ HealthKit permission asked in context, as a sheet over the character screen
- ✅ Device timezone captured at profile creation and reconciled on foreground
- ✅ `profiles` INSERT grant column-scoped — RLS constrains rows, not columns
- ⬜ Sign in with Apple (blocked on the Apple Developer Program)
- Body metrics deferred to the soft prompt, never a gate
```

And add to the "Deviations introduced during implementation" table:

```markdown
| 7 | Apple/Google sign-in (§15) | **Anonymous sign-in in development builds only** | The Apple Developer Program is not yet purchased, so Sign in with Apple cannot be enabled on the App ID. Anonymous is one tap with no form — the same shape Apple's flow will have — so onboarding is rehearsed against the flow that ships. `availableProviders()` returns an empty list outside `__DEV__`, so it cannot reach TestFlight. **Disable anonymous sign-ins on the project when Apple lands.** |
```

- [ ] **Step 5: Commit**

```bash
git add docs/roadmap.md
git commit -m "Mark Phase 1 complete in the roadmap

Records anonymous sign-in as a deliberate development-only deviation,
with the condition for removing it."
```

---

## Notes for whoever executes this

**Things that will look like bugs and are not:**

- After Task 4 and Task 5, the app deliberately ends on Expo Router's "Unmatched Route" screen. The destination route does not exist yet. This is stated in each task's expectations.
- The character screen shows zeros for everything. Nothing reads health data until Phase 3; `sync-health` is deployed and working, but nothing calls it yet.
- HealthKit returns no samples in the simulator. Task 7 only verifies that the *prompt* appears with the right copy.

**If sign-in fails with an anonymous-provider error:** enable anonymous sign-ins in the Supabase dashboard under **Authentication → Sign In / Providers**. Turn it off again when Sign in with Apple lands — it is recorded as a follow-up in the design doc.

**Do not add npm dependencies.** If something seems to need one, it is worth a conversation first — the lean dependency surface is deliberate, and `kairo-core` having zero dependencies is load-bearing for the Deno/Metro dual-consumption.

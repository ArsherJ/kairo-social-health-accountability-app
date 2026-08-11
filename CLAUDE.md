# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kairo is a Philippines-market health accountability app, **solo-first**: an RPG character levels from your real HealthKit activity, and squads are an optional layer on top — a daily leaderboard, plus shared goals over a span of days, weeks or years. iOS first via Expo; Supabase backend.

**Sabotage was removed on 2026-08-09.** It was the original premise (§8, and §20's principle #4 called it "the soul of the product"), so a lot of prose still assumes it. Nothing in the code does. If you find a reference, it is stale — fix it.

**Bronze/Silver/Gold are internal to scoring as of 2026-08-10.** `tierFor()`, `TIER_POINTS` and `daily_scores.tiers` still decide every day exactly as §5/§6 specify — nothing about the engine changed. But no surface renders a tier name or colour any more: the character sheet and the leaderboard both show a numeric **ability rating** from `ratingForStatPoints()` over lifetime per-stat rollups on `profiles`. If you find UI naming a tier, it is stale. **`profiles.focus` was dropped the same day** — `squads.program` is the only focus concept, and the character screen's "lane" reads observed dominance instead.

**"Hunter" and "barkada" were retired on 2026-08-11** (roadmap deviation #26). The
character has no noun — it is "your character", and the centre tab is `Character`;
a squad is a **squad**. The spec says "Hunter" throughout (§6, §15, §20) and so do
the dated docs under `docs/superpowers/`; both are historical records, not intent.
Three things deliberately still say it and are *not* stale: `profiles.class`'s
`'hunter'` default (inert internal enum, no surface renders it), the
`output/imagegen/hunter-*.png` render sources, and the **art-direction prompts** in
`scripts/generate_swap_assets*.py` plus §20's "dark fantasy hunter aesthetic" brief —
that last one is a genuinely open decision the art regeneration has to settle, not a
missed find-and-replace. Anywhere else, it is stale — fix it.

**Stat identity is a glyph, not three letters, as of 2026-08-11.** `src/ui/StatIcon.tsx`
owns the only mapping; `StatCoin`, `StatBar` and `LeaderboardRow` all read it. It is
MaterialCommunityIcons on purpose while all chrome stays Feather — the split is
hairline = *things you operate*, solid = *things you are*. Don't blur it in either
direction.

**Two documents hold the decisions. Read them before proposing changes.**

- `Kairo_Master_Summary.md` — the product spec (v1.4). Sections are cited throughout the code as `§5`, `§12`, etc. Comments referencing a `§` are pointing here.
- `docs/roadmap.md` — build sequencing, phase status, and an **approved-deviations table**. Deviations from the spec are deliberate and recorded; propose changes against that table rather than "fixing" them.

`docs/user-journey.md` walks the end-to-end user flow (onboarding → daily loop → character → squad → goals) grounded in what's actually built, not just spec'd. Update it whenever a flow changes.

## Tooling conventions

- **Use context7 for library/SDK docs.** Before writing or debugging code against a versioned dependency (Expo SDK, Supabase client, React Navigation, HealthKit wrappers, etc.), pull current docs via context7 rather than relying on training-data recall — APIs move and training data goes stale.
- **Use graphify to navigate the codebase.** Prefer it over ad-hoc grep/find for architecture questions, call graphs, and cross-file relationships (`graphify-out/` holds the indexed graph) — it's faster and keeps answers grounded in the real dependency structure.
- **Route UI/UX changes through the frontend-design skill.** Any new or modified screen/component under `app/` or `src/` gets a design pass through that skill before implementation, so it lands as intentional design rather than generic RN defaults — Kairo's character-first visual identity (§6) is easy to flatten otherwise.
- **Documentation updates are part of the change, not a follow-up.** A change to product behavior, architecture, or setup steps updates `README.md`, this file, and `docs/user-journey.md` (or whichever `docs/` file governs it) in the same pass.

## Commands

```bash
npm test                 # everything: kairo-core (node) + schema/planner suites
npm run test:core        # packages/kairo-core only
npm run test:schema      # schema (PGlite) + Edge Function planners
npm run typecheck        # tsc + workspace tsc + deno check, all three

# single file / single test
npm run test:core -- --run src/streak.test.ts
npx vitest run --config vitest.config.ts supabase/tests/schema.test.ts
npx vitest run --config vitest.config.ts -t "Streak Shield"

# app
npm run ios              # build + run on simulator (needs Xcode + CocoaPods)
npm run prebuild         # regenerate ios/ from app.config.ts

# backend
./supabase/scripts/remote-sql.sh "select ..."      # SQL against the live project
./supabase/scripts/remote-sql.sh -f file.sql
supabase functions deploy <name> --project-ref zniopywbwenrzxezolwv
```

## Environment constraints — read before debugging connection errors

This dev machine cannot reach Postgres directly. Three independent causes, none of which indicate a broken project:

- Outbound **port 5432 is blocked** on this network.
- Supabase's direct host resolves **IPv6-only** with no IPv4 route here.
- **Docker is unavailable.** Podman Desktop is installed but its VM does not mount the project directory (`workdir ... does not exist on container`).

So `supabase db push`, `psql`, and `supabase start` all fail. What works, all over HTTPS: `supabase/scripts/remote-sql.sh` (Management API, auth from the CLI's Keychain entry), `supabase functions deploy`, and the PGlite test harness.

**Applying a migration** therefore means: run it via `remote-sql.sh -f`, then insert its row into `supabase_migrations.schema_migrations` yourself, or the CLI will try to re-apply it later. Wrap multi-statement migrations in `begin; ... commit;`.

## Architecture

### `packages/kairo-core` is the keystone

Pure, zero-dependency TypeScript: scoring, local-day math, goal evaluation, anti-cheat, progression, streaks. **No I/O, no clock reads, no randomness** — every function takes what it needs as an argument, which is why timezone and DST behaviour is testable without mocking.

Both consumers import the same files:
- Expo app → `@kairo/core` (tsconfig path + Metro `watchFolders`)
- Supabase Edge Functions → `supabase/functions/_shared/core.ts`, a relative re-export

This is what makes §12's server-authoritative rule affordable. Do not add a second implementation of scoring anywhere, and do not add dependencies to this package.

### Writes are server-authoritative

Clients have `SELECT` on their own rows and **zero write grants** on `health_buckets` or `daily_scores`. Edge Functions own every mutation:

- **`sync-health`** — the only door health data enters. Upserts hourly buckets, then re-reads the *whole* day before rescoring (a partial payload must not collapse the day's total).
- **`finalize-days`** — hourly `pg_cron`, the only place a day becomes `final`. Guarded by `CRON_SECRET`.

Scores are always *replayed* from stored buckets, never adjusted in place. That is what makes retries, Apple's retroactive step revisions, and cron overlap all safe. Preserve this property — goal progress is a read-time projection over `daily_scores` for the same reason, and stores no number of its own.

### Structural invariants worth not breaking

- **Privacy is a projection, not a convention.** `profiles` is owner-readable only (the row holds height/weight/birth year, and RLS is row-level). Squadmates reach data through `squad_leaderboard()`, which has no argument that returns raw steps or hourly movement.
- **`reject_mutation()` and the `kairo.allow_purge` flag are inert.** They enforced append-only on `sabotage_events`, which is dropped; the flag is still set by `delete_account()` / `leave_squad()` and now guards nothing. Left in place on purpose — account deletion is the legal erasure path and is not worth reopening for a no-op. See `20260809120000_remove_sabotage.sql`.
- **`profiles.total_xp` is a rollup**, recomputed as `sum(daily_scores.xp_awarded)` (plus `goal_completions.xp_awarded`) by trigger — never incremented, so nothing double-counts. The same function maintains `agi_total`/`str_total`/`end_total`/`vit_total`, which feed the ability ratings. Its trigger skips the recompute only when *every* column it reads is unchanged: a same-tier rescore (5,200 → 8,000 steps, both Silver) moves the raw points and not the XP, and a narrower skip loses it silently.
- **Strain is display-only.** `computeStrain()` runs on the client over `health_buckets.avg_heart_rate` and `daily_heart`. It never touches `daily_scores`, so score replay is unaffected. Heart rate is owner-readable only and absent from every projection — it is at least as revealing as the hourly movement §5 protects.
- **Column-level grants:** `profiles` UPDATE is granted per-column. A column-level `REVOKE` against an existing table-level `GRANT` is silently a no-op in Postgres; revoke the table grant and re-grant the allowed columns.

### Per-user local days

Every player's day runs midnight-to-midnight in **their own** timezone (§2), so a squad spans multiple calendar dates at any instant. Health buckets, scores, and goal windows are keyed by local date. `finalizable_days()` in SQL and `isFinalizable()` in `kairo-core` implement the same ~2h grace window and are kept honest by a differential test.

## Conventions

- **`*.deno.ts`** marks a shared module that imports Deno-only specifiers (`npm:`, Deno globals). These are excluded from `tsc` and checked by `deno check` instead. Everything else under `supabase/functions/_shared/` stays pure so vitest can exercise it.
- **Edge Function handlers stay thin.** Every decision lives in a `*-plan.ts` module tested in plain Node; `index.ts` only authenticates, reads, plans, writes. This is deliberate — Docker is unavailable, so anything untestable in Node is effectively untested.
- Imports use explicit `.ts` extensions, which Deno requires and Vite/Metro both accept.

## Testing

Strict TDD on scoring, day boundaries, goals, streaks and anti-cheat — the logic where a bug corrupts real leaderboards. UI is verified by hand on device.

`supabase/tests/harness.ts` applies every migration to **PGlite** (real Postgres in WASM) with stubbed `auth` and `realtime` schemas, then asserts behaviour under the non-owner `authenticated` role. Runs in ~1.5s with no Docker.

**Its limits, so nothing over-trusts it:** it does not prove Supabase's Realtime server delivers broadcasts, nor that the hosted `auth` schema matches. `UNSUPPORTED_MIGRATIONS` in that file lists migrations it cannot apply, each with a reason — keep that list as short as possible, since every entry is schema no test covers. Verify those against the live project instead.

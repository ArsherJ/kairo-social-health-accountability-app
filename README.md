# Kairo

Kairo is a Philippines-market health accountability app, **solo-first**: an RPG character levels from your real HealthKit activity, and squads are an optional layer on top — a daily leaderboard, plus shared goals over a span of days, weeks, or years.

iOS first via Expo; Supabase backend.

## Docs

- [`Kairo_Master_Summary.md`](./Kairo_Master_Summary.md) — the product spec (v1.4). Sections are cited in code and docs as `§5`, `§12`, etc.
- [`docs/roadmap.md`](./docs/roadmap.md) — build sequencing, phase status, and the approved-deviations table (deliberate, recorded departures from the spec).
- [`docs/user-journey.md`](./docs/user-journey.md) — the end-to-end user flow: onboarding → daily loop → character → squad → goals.
- [`docs/mvp-scope.md`](./docs/mvp-scope.md) — **what is in the MVP and what is not.** Cite it in any QA brief, test plan or store-facing copy; a brief describing something not listed there is stale.
- [`docs/qa/kairo-end-to-end-qa-report.md`](./docs/qa/kairo-end-to-end-qa-report.md) — the August 2026 QA pass, with an addendum tracing its central finding to a stale Edge Function deployment.
- [`docs/sign-in-with-apple.md`](./docs/sign-in-with-apple.md) — the runbook for the last release blocker: app side built, portal configuration and a device pass remaining.
- [`CLAUDE.md`](./CLAUDE.md) — architecture, invariants, and working conventions for anyone (human or agent) changing this codebase.

## Quick start

```bash
npm install
npm run ios              # build + run on simulator (needs Xcode + CocoaPods)
```

## Commands

```bash
npm test                 # everything: kairo-core (node) + schema/planner suites
npm run test:core        # packages/kairo-core only
npm run test:schema      # schema (PGlite) + Edge Function planners
npm run typecheck        # tsc + workspace tsc + deno check, all three

npm run ios              # build + run on simulator
npm run prebuild         # regenerate ios/ from app.config.ts
npm run xcode-env        # rewrite ios/.xcode.env.local (see below)
npm run apple-secret     # mint the Sign in with Apple client secret (see below)

./supabase/scripts/remote-sql.sh "select ..."      # SQL against the live project
supabase functions deploy <name> --project-ref zniopywbwenrzxezolwv
node supabase/scripts/smoke-sync.mjs               # post-deploy: does a sync still score?
```

### Deploying Edge Functions

**A migration that changes a table an Edge Function writes must ship with a
redeploy of that function.** Applying one without the other is what took
scoring down for two days in August 2026: `remove_sabotage` dropped
`daily_scores.sabotage_delta`, the deployed `sync-health` kept sending it, and
because its bucket upsert commits *before* the score upsert, health data
carried on landing while nothing scored. Every test passed the whole time —
they check the source, not what is deployed.

So after any such deploy:

```bash
supabase functions deploy sync-health --project-ref zniopywbwenrzxezolwv
node supabase/scripts/smoke-sync.mjs    # asserts buckets, score and rollups agree
```

The smoke check exercises the real function through a throwaway account and
deletes it afterwards. It fails loudly on exactly that signature: buckets
accepted, no score written. `docs/qa/kairo-end-to-end-qa-report.md` has the
full post-mortem.

### The Sign in with Apple client secret expires

Apple does not issue a client secret — it is an ES256 JWT signed with the `.p8`
key from the Developer portal, and **Apple caps its life at about 182 days**.
When it lapses, sign-in fails for every user at once and nothing in the
codebase will have changed, which makes it very hard to attribute after the
fact.

```bash
npm run apple-secret -- --key ~/AuthKey_ABC123DEFG.p8 --team-id YOUR_TEAM_ID --push
```

`--push` installs it on the Supabase project over the Management API so the
credential never reaches your scrollback. The script prints the expiry date;
put it in a calendar. Full runbook: `docs/sign-in-with-apple.md`.

### If an Xcode build fails with `line 9: : command not found`

`ios/.xcode.env` resolves node with `command -v node`, and Xcode runs script
phases under a restricted PATH that excludes Homebrew — so `NODE_BINARY` comes
out empty and the Hermes phase dies. Command-line builds are unaffected, which
makes it look like broken source rather than a broken environment.

`npm run xcode-env` writes `ios/.xcode.env.local` with an absolute path. It
runs automatically after `npm install` and `npm run prebuild`; run it by hand
after changing node versions. The file cannot be committed — `ios/` is
generated and gitignored, and `expo prebuild --clean` deletes the directory.

See `CLAUDE.md` for environment constraints (why `supabase db push` / `psql` / `supabase start` don't work on this dev machine), architecture, and testing conventions before making changes.

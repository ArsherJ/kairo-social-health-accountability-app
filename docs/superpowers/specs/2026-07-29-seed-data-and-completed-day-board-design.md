# Seed data and the completed-day leaderboard

Status: approved 2026-07-29. Backend half of roadmap Phase 4; the squad UI and
Realtime wiring follow in a second spec.

## Goal

Two backend pieces that together make a squad leaderboard worth building against:

1. **`squad_leaderboard` gains a completed-day mode** — the cross-timezone view
   §2 describes and roadmap deviation #6 records as owed.
2. **`seed-health`** — a development-only Edge Function that populates realistic
   activity for fake squadmates.

Neither needs a device, the Apple Developer Program, or HealthKit.

## Why seed-health exists

Without it, testing a leaderboard means physically walking 10,000 steps, and
testing the week-3 competitive stamina that §15's beta is designed to measure is
impossible for one person. It is the difference between a leaderboard you can
look at and one you can actually exercise.

---

## 1. `squad_leaderboard` completed-day mode

### Current behaviour

```
squad_leaderboard(p_squad_id uuid, p_local_date date default null)
```

- `p_local_date` null → each member's **current** local date (the live board)
- `p_local_date` set → one pinned date for every member

### The added mode

A third value: each member's own **yesterday** — the most recently completed day
in *their* timezone.

```sql
case
  when p_local_date is not null then p_local_date              -- explicit pin wins
  when p_mode = 'completed' then (now() at time zone p.timezone)::date - 1
  else (now() at time zone p.timezone)::date
end
```

This is per member, so a Manila member and a New York member legitimately return
**different `local_date` values in the same result set**. That is the point of
the mode, not a bug; the RPC already returns `local_date` per row so the UI can
say which day each score belongs to.

### The grace-window decision

`mostRecentlyCompletedLocalDate()` in `kairo-core` is `previousDay(currentLocalDate(...))`
— plain yesterday, with no grace window. `finalizable_days()` in SQL applies a
2-hour grace before a day may be finalized.

These disagree for roughly two hours after a member's local midnight: yesterday
is calendar-complete but its score can still move as backfilled HealthKit data
arrives.

**Decision: show yesterday anyway, and expose `status`.** Reasons:

- It matches `mostRecentlyCompletedLocalDate()` exactly, so there is no second
  definition of "completed" and no conflict with the differential test.
- It is what a person means by the phrase.
- §2's morning-FOMO open happens hours after midnight, well past the window.
- The RPC already returns `status`, so the UI can mark a day as still settling
  rather than pretending it is locked.

### Signature change, not an overload

Adding a defaulted parameter creates a **second function** rather than replacing
the first — `squad_leaderboard(uuid, date)` and `squad_leaderboard(uuid, date, text)`
would coexist, and two near-identical leaderboard functions is precisely how the
privacy projection drifts.

So the migration must:

1. `drop function public.squad_leaderboard(uuid, date);`
2. Create `squad_leaderboard(p_squad_id uuid, p_local_date date default null, p_mode text default 'current')`
3. `revoke execute ... from public, anon;` then `grant execute ... to authenticated;`
   on the **new** signature

Step 3 is not optional. Postgres grants `EXECUTE` to `PUBLIC` by default, which
in a `SECURITY DEFINER` function means any role could call it. The existing
migration revokes this deliberately; a recreated function starts over with the
default grant.

Nothing in the app calls this RPC yet, so the signature change costs nothing
today and would cost real work later.

### Validation

An unrecognised `p_mode` raises rather than falling back to `'current'`. A typo
must not silently rank people on the wrong day.

### Restructure while in there

The current function computes its date expression **twice** — once in the select
list and once in the `left join` condition on `daily_scores`. Two copies of the
rule deciding which day you are ranked on is a latent drift bug: change one and
the score attaches to a different date than the one reported.

Restructure so the date is computed once, in a CTE that resolves members and
their dates, then joined against. This is targeted improvement to code the change
already touches, not unrelated refactoring.

---

## 2. `seed-health`

### It writes buckets, never scores

`seed-health` writes hourly rows to `health_buckets`, then calls the same
`rescoreDay` helper that `deploy-sabotage` and `finalize-days` use.

This is the single most important property of the design. Writing `daily_scores`
directly would mean every seeded leaderboard is a fiction — the UI would be
verified against numbers the scoring engine never produced, and a scoring bug
would be invisible exactly where the most attention is being paid. It also
preserves the architecture's stated invariant: scores are always *replayed* from
stored buckets, never adjusted in place.

### Three actions

**`create-users`** — mints N auth users via the admin API, each with a profile
(character name, timezone) and a row in `seed_test_users`.

**`add-to-squad`** — inserts allowlisted users into a squad, given its invite
code.

This action is necessary and cannot be delegated to the existing RPC:
`join_squad` is `SECURITY DEFINER` and resolves the joiner from `auth.uid()`, so
it can only ever add *the caller*. Seeding therefore inserts into
`squad_members` directly with the service role.

Note it still passes through the table's triggers — the per-user squad cap and
`squads.max_members` both apply. A free squad caps at 6, so a realistic seed is
five fake members alongside your own account.

**`seed-days`** — writes buckets for allowlisted users across an inclusive date
range, then rescores each affected user-day.

### Personas, not target scores

The caller picks a persona per user: `sedentary | average | active | athlete`.
Each shapes a realistic day — commute peaks around 07:00–09:00 and 17:00–19:00, a
lunch bump, quiet overnight — and the score falls out of the real scoring engine.

Working backwards from a target score would mean fighting the tier curve for no
benefit, and would teach nothing about whether the tiers themselves feel right —
which is one of the four risk questions §15's beta exists to answer.

Generation is **deterministic**: a seeded PRNG, so the same inputs reproduce the
same day and a scenario can be re-run. The PRNG lives in `seed-health`, never in
`kairo-core`, which stays free of randomness.

### `seed_test_users`

```sql
create table public.seed_test_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);
```

Service-role only: every grant revoked from `anon` and `authenticated`, RLS
enabled with no policy. `on delete cascade` so account deletion sweeps it.

**Accepted cost:** a test-only table lives in the production schema permanently.
It is tiny and empty in production. Chosen over an email-pattern convention
because a convention depends on nobody ever registering a matching address,
whereas a table is a fact.

### Three independent guards

1. **`SEED_SECRET`** header, compared the way `finalize-days` compares
   `CRON_SECRET`.
2. **The `seed_test_users` allowlist.** Every target user must be present, or the
   call is refused. This is what makes a leaked secret survivable: it cannot
   touch a real player's scores.
3. **Never deployed to production.** Operational, and the reason the other two
   exist rather than a substitute for them.

### Handler stays thin

Per the repo's convention, every decision lives in a `seed-plan.ts` module tested
in plain Node — persona → 24 hourly buckets, date-range expansion, allowlist
checking. `index.ts` only authenticates, plans, writes, rescores.

---

## 3. Testing

- **PGlite:** the completed-day mode with members in different timezones
  returning different `local_date` values in one result set; `p_mode` validation
  raising on a bad value; `seed_test_users` unreachable as `authenticated`;
  execute grants correct on the recreated function signature.
- **Differential test:** the SQL completed-day expression must equal
  `mostRecentlyCompletedLocalDate()` for the same instant and timezone,
  extending the pattern that already keeps `finalizable_days()` and
  `isFinalizable()` honest.
- **Node:** the persona day-shape generator and the allowlist/plan logic as pure
  functions.
- **Live:** after deploying, seed a squad and confirm `squad_leaderboard` returns
  sensible ordering in both modes.

## 4. Out of scope

The squad UI, Realtime subscription wiring, create/join screens, and the
leaderboard list — all of that is the second spec. Also out of scope: coin
awards, N-of-M squad streaks, and anything requiring the Apple Developer Program.

## 5. Follow-ups this creates

- `seed-health` must not be deployed once real beta users exist. Record the
  decision point in `docs/roadmap.md` Phase 8.
- If the squad UI later wants a single common date rather than per-member dates,
  that is a third mode and a separate decision — do not overload `p_mode`
  silently.

# Beta measurement runbook

Design and full rationale: `docs/superpowers/specs/2026-08-15-activation-and-measurement-design.md`.
This document is the operational half — the queries a human runs against the
live project, not the reasoning behind them.

**Every query below is run through `./supabase/scripts/remote-sql.sh`, never
from a client.** `app_events` is client-writable (its own INSERT policy) but
not client-readable in aggregate, and `kairo_retention` has EXECUTE revoked
from `anon` and `authenticated` outright — see "Not yet applied" below. There
is no dashboard for any of this; these are the queries, run by hand, until
there is a reason to build one.

---

## The activation funnel

One row per step, so each step's drop-off is visible rather than folded into
a single conversion percentage — **with one exception, at the health-ask
step; see "What is not measurable, and why" below before reading a flat
step 3 as a clean number.**

```sql
with steps(step, type) as (
  values
    (1, 'onboarding_started'),
    (2, 'profile_created'),
    (3, 'health_ask_completed'),
    (4, 'first_sync_seen'),
    (5, 'first_score_seen')
)
select
  s.step,
  s.type,
  count(distinct e.user_id) as users
from steps s
left join public.app_events e on e.type = s.type
group by s.step, s.type
order by s.step;
```

**Step order here is `profile_created` before `health_ask_completed`, not the
order the names might suggest.** `PermissionAsks` — the only place `HealthAsk`
mounts — lives in `app/(tabs)/_layout.tsx`, which only exists for a `'ready'`
user (`resolveRoute`'s post-profile state), so on this branch
`health_ask_completed` cannot fire before `profile_created` fires. Numbering
it step 2 anyway would print a funnel with a huge, fake drop-off between
"onboarding started" and "health asked" — every user who created a profile
and never got that far would appear to have vanished at step 2 when they are
in fact sitting at step 3. This reordering is temporary: design §7.1 moves
the health ask to a new `/connect` screen ahead of `/character` and `/name`,
at which point `health_ask_completed` genuinely does precede
`profile_created` again and the steps revert to name order.

The five steps are exactly the five `AppEventType` members
`src/features/telemetry/events.ts` added for this release. `first_sync_seen`
and `first_score_seen` are the two that matter most to read correctly: both
are **once-ever per account for the life of one install**, gated on an MMKV
marker (`src/features/telemetry/milestone-store.ts`), not on session count —
so a count here is a count of *accounts that ever cleared the step*, never
inflated by relaunches. See "Reading the once-ever events" below before
treating a flat step 4→5 as a finding.

"Once-ever" is qualified to one install on purpose: MMKV lives in the app
container, so a reinstall or a second device wipes the marker and can re-fire
both events for an account that already cleared them once — the same fact
CLAUDE.md records for why sync state and telemetry milestones are always
wiped together. `count(distinct user_id)` is unaffected either way — a
repeat row changes no funnel answer in this document — but a query written
to count raw rows instead would see it as inflation. The same reinstall path
is also why `first_score_seen` can occasionally precede `first_sync_seen`:
`first_score_seen` is gated on the server already holding a positive score
for today, `first_sync_seen` on *this device's* own sync completing, and a
reinstalled device can see the account's existing server-side score before
it has run a sync of its own. First-run ordering for a genuinely new account
is unaffected — there is no way to have a positive score before a sync has
ever happened for it.

Squad activation is separate, because it is optional rather than a funnel
step — a user who never joins or forms a squad has not dropped out of
anything:

```sql
select type, count(distinct user_id) as users
from public.app_events
where type in ('squad_created', 'squad_joined')
group by type;
```

`squad_joined` can fire more than once per user, because `join_squad` is
idempotent and a user can leave one squad and join another. `count(distinct
user_id)` is what makes that harmless — a duplicate changes no answer here,
and deduping the event itself would hide the leave-and-rejoin case instead of
just not counting it twice.

---

## Retention, and the kill signal

```sql
select 1 as day, * from public.kairo_retention(1)
union all select 7, * from public.kairo_retention(7)
union all select 21, * from public.kairo_retention(21)
union all select 42, * from public.kairo_retention(42)
order by day, cohort_date;
```

**Under 25% retained at day 21 means the loop is the problem, not the feature
set.** That is the outside review's own threshold, verbatim, and it is the
reason this release exists: the review's headline recommendation — a
six-week retention test, kill the loop under 25% at D21 — could not be
executed at all before this release, because there was no activation funnel
and `first_sync_seen` was declared but fired nowhere. See design §1.3 for the
finding in full.

`kairo_retention(p_day)` returns `cohort_date`, `cohort_size`, `retained` —
`cohort_date` as a SQL `date`, not a pre-formatted string; whatever renders
these rows (a terminal, a script) is responsible for its own formatting.
Retention needed **no new telemetry**: `daily_scores` already carries one row
per user per local date, so this is a query over data that already existed —
the cheap half of this release, next to the funnel above.

Two decisions worth not re-deriving if the numbers look surprising:

- **This is Nth-day retention, not "any activity by day N."** A user counts
  as retained on day N only if they have a scored day exactly N days after
  their cohort date — the stricter reading, and the one a kill signal should
  use. A user who was active on day 5 and day 30 but not day 21 reads as
  churned at D21.
- **The cohort date is `profiles.created_at`, in the user's own timezone**
  (`(p.created_at at time zone p.timezone)::date`), never `auth.users`
  and never UTC. `profiles` is per-user-local everywhere else in this schema
  — `daily_scores.local_date`, `finalizable_days()` — and anchoring the
  cohort on UTC instead would disagree with the `local_date` it is compared
  against, misdating anyone who signed up near midnight in the
  `'Asia/Manila'` default. Counting from `auth.users.created_at` would also
  count a user who signed in and abandoned onboarding as a cohort member,
  reporting the onboarding drop-off as churn.

**What "a scored day exists" includes, precisely — read this before treating
`retained` as "the user engaged with the app that day":**

- **A day can be scored without the app being opened that day.** Every sync
  re-reads and re-upserts *yesterday* alongside today
  (`ROUTINE_WINDOW_DAYS = 2` in `src/features/health/sync-window.ts`), and
  HealthKit records steps whether or not Kairo is open to see them. So a
  single app open on day 22 can produce a `daily_scores` row for day 21 too,
  from the phone's background-collected activity — and that row satisfies
  `kairo_retention`'s D21 check exactly as if the user had separately opened
  the app on day 21. `retained` is closer to "a day this account's health
  data reached the server for" than "a day this account used the app."
- **A zero-activity day still counts.** `kairo_retention` checks that a
  `daily_scores` row exists for the target date, not that its `total` is
  positive — a day that scored zero (phone off, HealthKit empty, a rest day
  with no synced steps) is retained. This is the opposite standard from
  `first_score_seen`, which explicitly guards `today.total > 0`
  (`app/(tabs)/index.tsx`) so a zero day cannot claim the activation funnel's
  final step. The two are deliberately unaligned rather than inconsistently
  aligned: activation asks "did this account ever do anything," retention
  asks "did this account's day get scored at all," and a stricter retention
  filter is a recorded decision to make, not a bug to fix by matching the
  other.
- **An immature cohort reads as `retained = 0`, not as absent.** A cohort
  whose day-N has not happened yet (a user who signed up 5 days ago, queried
  at `p_day = 21`) still gets a row from `kairo_retention`, with `retained =
  0` because no future `daily_scores` row can exist. Nothing in the function
  distinguishes "checked and found nobody retained" from "too new to have
  reached day N yet." Summing `retained` and `cohort_size` across all
  `cohort_date` rows to get one ratio — the obvious first thing to try —
  silently drags that ratio down by every cohort too young to have a day N.
  Filter to cohorts where `cohort_date + p_day <= current_date` (in the
  cohort's own timezone) before summing, or read the per-`cohort_date` rows
  individually for cohorts old enough to matter.

---

## Recovery after a missed day

Users who scored, went at least one day without scoring, then came back:

```sql
with gaps as (
  select
    user_id,
    local_date,
    local_date - lag(local_date) over (
      partition by user_id order by local_date
    ) as gap
  from public.daily_scores
)
select
  count(distinct user_id) filter (where gap > 1) as recovered_users,
  count(distinct user_id) as active_users
from gaps;
```

---

## Squad survival

Whether a squad is still more than one person after three weeks:

```sql
select
  s.id,
  s.name,
  s.program,
  count(m.user_id) as members,
  min(m.joined_at)::date as formed_on
from public.squads s
join public.squad_members m on m.squad_id = s.id
group by s.id, s.name, s.program
having min(m.joined_at) < now() - interval '21 days'
order by members desc;
```

---

## What is not measurable, and why

Three things, stated so they are not re-filed as gaps in a later review:

- **Whether a user declined HealthKit.** Apple does not report
  read-permission denial, so `health_ask_completed` records the resulting
  `HealthPermissionState` and never a granted/denied verdict — an event
  asserting otherwise would be believed. A user who declined and a user who
  granted with an empty phone are indistinguishable from the app's side;
  whether `first_sync_seen` ever fires for that account is the closest
  available proxy, not a direct answer.
- **The health-ask step's drop-off itself.** `health_ask_completed` fires
  only when `HealthAsk`'s request *resolves* (`HealthPermissionSheet.tsx`) —
  never on the "Not now" dismissal (`PermissionAsks.tsx`'s `onDismiss` sets
  local state only, no `track` call), and never for a user `nextPermissionAsk`
  never offers the sheet to at all. All three of "dismissed", "never
  offered", and "hasn't gotten there yet this session" read identically in
  `app_events`: no row. A flat step-3 count in the funnel above is therefore
  not evidence anyone declined — reading it as one is the mistake this note
  exists to head off. `health_permission_failed` (the native-rejection path)
  is recorded but, deliberately, appears in none of this document's queries;
  it is diagnostic evidence for a support conversation, not a funnel step —
  a query counting it needs to decide first whether a failed attempt should
  count as reaching step 3, which is a product question, not a SQL one.
- **Anything before the app's first launch.** Install-to-open is App Store
  Connect's number, not ours — nothing in `app_events` can see a device that
  never opened the app.

---

## Reading the once-ever events

`first_sync_seen` (`src/features/health/useHealthSync.ts`,
`markFirstSyncSeen`) and `first_score_seen`
(`app/(tabs)/index.tsx`) each claim their MMKV marker *before* the write that
justifies it, then release the claim with `markUnreached` if `track` resolves
`false` — a write that did not land. `track` resolves `true` only when the
row actually reached `app_events`. That release is what lets a failed insert
retry on the next sync or the next home-screen view instead of permanently
losing an event this dataset cannot backfill; it is unrelated to the
per-session `app_open` marker `useAppOpenTelemetry` uses, and the two should
never be conflated when reading the funnel — a gap between step 4 and step 5
reflects accounts, not sessions.

---

## Not yet applied

**The `kairo_retention` migration has not been run against the live
Supabase project.** `supabase/migrations/20260816120000_retention_reporting.sql`
exists in this repo and is exercised by the PGlite schema suite, but nothing
in this task ran it against the hosted database, and its row is not yet in
`supabase_migrations.schema_migrations`. Every query in this document that
calls `kairo_retention` will fail with `function public.kairo_retention(integer)
does not exist` until it is applied.

That was deliberate — applying a migration to the live project is withheld
for the repo owner to run by hand, per this repo's environment constraints
(`CLAUDE.md`, "Environment constraints"). The two commands, run in order:

```bash
./supabase/scripts/remote-sql.sh -f supabase/migrations/20260816120000_retention_reporting.sql
./supabase/scripts/remote-sql.sh "insert into supabase_migrations.schema_migrations (version) values ('20260816120000')"
```

The activation funnel, squad activation, recovery, and squad-survival queries
above need no migration and work today — they read `app_events`,
`daily_scores`, `squads` and `squad_members`, all of which already exist.

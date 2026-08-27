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
a single conversion percentage.

```sql
with steps(step, type) as (
  values
    (0, 'pitch_seen'),
    (1, 'onboarding_started'),
    (2, 'health_ask_completed'),
    (3, 'profile_created'),
    (4, 'first_sync_seen'),
    (5, 'first_score_seen'),
    (6, 'disclosure_unlocked')
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

**The step order is now the name order, as of 2026-08-17.** It was not for one
release: `PermissionAsks` — then the only place `HealthAsk` mounted — lives in
`app/(tabs)/_layout.tsx`, which exists only for a `'ready'` user, so
`health_ask_completed` could not fire before `profile_created` and this list
had to number them the other way round or print a huge fake drop-off. The
`/connect` screen now asks for Health as the *first* onboarding step, ahead of
`/character` and `/name`, so the natural order is the true one again. Anyone
comparing a run of this query against one from before that date is comparing
two different flows, not two cohorts.

**Step 0 is `pitch_seen`, and it is the only step that fires with no session.**
It is the sign-in screen's own render — before Apple's sheet, before anything
has been asked for — buffered by `track` and attributed by
`flushTelemetryBuffer` with **its own timestamp**, not the flush time. That is
the whole reason the pre-auth buffer exists, and it makes step 0 → step 1 the
first honest measurement of the pitch: how many people read what Kairo is and
signed in anyway. It is not once-ever — a user who opens the app signed out
twice fires it twice — so `count(distinct user_id)` is doing real work here.

**Step 2 has a denominator now.** `health_ask_completed` fires only on success,
so until `health_ask_dismissed` existed (2026-08-17) a user who dismissed the
sheet and a user who was never offered it produced identical event sequences,
and the step the design calls the activation bottleneck had no measurable
drop-off. Read the two together:

```sql
select type, count(distinct user_id) as users
from public.app_events
where type in ('health_ask_completed', 'health_ask_dismissed')
group by type;
```

Note that a single user can appear in both: `/connect`'s "Not now" is a
deferral, and `PermissionAsks` offers the sheet again later. That is a real
sequence rather than a data error — someone who put it off and came back is
exactly who this pair exists to make visible.

**Step 6, `disclosure_unlocked`, is the first honest read on whether the core
loop holds.** It fires once per account when the account reaches
`DISCLOSURE_THRESHOLD_DAYS` (3) days scored above zero and the rest of the app
appears — Goals, Challenges, per-stat detail, strain. Everyone before it is
seeing the reduced app by design, so step 5 → step 6 is not friction: it is the
share of activated users who came back and moved for three separate days. It is
once-ever, MMKV-gated like its two siblings, for the reason below — the stage is
*derived* from a day count, so without a marker it would re-fire on every launch
afterwards and become a launch counter.

`first_sync_seen`
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

## The race loop (post-pivot, from 2026-08-25)

**Kairo pivoted to character racing on 2026-08-25** (roadmap deviation #44).
Split every chart in this document on that date: before it, the app was a
leaderboard with goals, and a cohort that never saw a race is not a cohort of
the same product.

The old goal funnel is gone with the surface it measured. `goal_created` is
kept as a historical `AppEventType` because `app_events` already holds rows
saying it, so a query over a window spanning the pivot still finds them — but
nothing emits it, and a count of it after 2026-08-25 is a count of zero.

Four events replace it, and each answers one question:

```sql
select type, count(distinct user_id) as users, count(*) as rows
from public.app_events
where type in (
  'squad_data_consent_granted',  -- did they agree to be seen? (deviation #47)
  'race_seen',                   -- did they meet a race at all?
  'quest_cleared',               -- are the bars set right?
  'event_created'                -- did the squad reach for a fight?
)
group by type
order by type;
```

`race_seen` fires **once per account per local day**, so `rows` is days-seen
and `users` is accounts-that-ever-saw-one. `quest_cleared` fires once per
account per local day per slot, carries `{ tier }` and never a quest id, so
grouping by tier is the honest way to ask whether a tier's bars are reachable:

```sql
select payload->>'tier' as tier, count(*) as cleared, count(distinct user_id) as users
from public.app_events
where type = 'quest_cleared'
group by 1
order by 1;
```

`event_created` carries `{ kind, difficulty }` and never the target — a boss's
HP is derived from the squad's own history and is the squad's own number.

### The one question the pivot exists to answer

**Does a user who saw a race come back tomorrow more often than one who did
not?** That is a cohort split on `race_seen` against the same next-day activity
`kairo_retention` counts — a scored day — so the two halves stay comparable to
the retention numbers below rather than becoming a third definition:

```sql
with first_score as (
  select user_id, min(local_date) as cohort_date
  from public.daily_scores
  where total > 0
  group by user_id
),
saw_race as (
  select distinct user_id
  from public.app_events
  where type = 'race_seen'
)
select
  (r.user_id is not null) as saw_a_race,
  count(*) as cohort_size,
  count(*) filter (
    where exists (
      select 1 from public.daily_scores d
      where d.user_id = f.user_id
        and d.local_date = f.cohort_date + 1
        and d.total > 0
    )
  ) as returned_next_day
from first_score f
left join saw_race r on r.user_id = f.user_id
where f.cohort_date >= date '2026-08-25'
group by 1;
```

**It is a correlation, not a trial.** Nobody is randomised into seeing a race,
and the people who see one are disproportionately the people in a squad — so a
gap here is a reason to keep going, never proof on its own. It is the closest
available signal, and the alternative was guessing.

### `kairo_retention()` is deliberately unchanged across the pivot

It measures whether a `daily_scores` row exists on cohort day + N. **The pivot
redefined what the app shows, not what counts as an active day.** Rewriting
that denominator would make every measurement taken before 2026-08-25
incomparable to every one after — which is the opposite of what a pivot's
instrumentation is for, and it is precisely *because* the definition held still
that every chart above can be split on the pivot date and mean something.

What was genuinely stale was the funnel vocabulary, and that is what moved.

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
- **Which kind of non-completion a user is in.** This was "the health-ask step
  has no denominator at all" until 2026-08-17; `health_ask_dismissed` now
  separates a dismissal from silence, so *dismissed* is measurable. What is
  still not: telling "never offered the sheet" from "hasn't gotten there yet
  this session" — both are still the absence of a row. So a user with neither
  event has not necessarily refused anything. `health_permission_failed` (the
  native-rejection path) is recorded but, deliberately, appears in none of this
  document's queries; it is diagnostic evidence for a support conversation, not
  a funnel step — a query counting it would first have to decide whether a
  failed attempt counts as reaching the step, which is a product question, not
  a SQL one.
- **Why an account never scored.** `syncStatus`'s `'no-data'` state
  (`src/features/health/sync-status.ts`) is the user-facing counterpart of the
  first bullet, and it is bounded by the same wall: it can say Apple Health has
  sent nothing in the six hours since the first sync, and it can never say the
  user declined. Nothing about that state is written to `app_events` — it is a
  render-time projection over sync state and the scored-day count, so there is
  no event to count.
- **Anything before the app's first launch.** Install-to-open is App Store
  Connect's number, not ours — nothing in `app_events` can see a device that
  never opened the app.

---

## Reading the once-ever events

`first_sync_seen` (`src/features/health/useHealthSync.ts`,
`markFirstSyncSeen`), `first_score_seen` (`app/(tabs)/index.tsx`) and
`disclosure_unlocked` (`src/features/character/useDisclosure.ts`)
each claim their MMKV marker *before* the write that
justifies it, then release the claim with `markUnreached` if `track` resolves
`false` — a write that did not land. `track` resolves `true` only when the
row actually reached `app_events`. That release is what lets a failed insert
retry on the next sync or the next home-screen view instead of permanently
losing an event this dataset cannot backfill; it is unrelated to the
per-session `app_open` marker `useAppOpenTelemetry` uses, and the two should
never be conflated when reading the funnel — a gap between step 4 and step 5
reflects accounts, not sessions.

---

## Migration status

**Applied.** `supabase/migrations/20260816120000_retention_reporting.sql` is
live and its row is in `supabase_migrations.schema_migrations`, so every
`kairo_retention` query above works against the hosted project. Verified
2026-08-26.

The funnel, race-loop, squad-activation, recovery and squad-survival queries
need no migration at all — they read `app_events`, `daily_scores`, `squads` and
`squad_members`, all of which predate this document.

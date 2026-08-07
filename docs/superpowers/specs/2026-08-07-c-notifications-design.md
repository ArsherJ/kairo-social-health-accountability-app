# C. Notification engine and FCM

Status: approved 2026-08-07. Workstream C of `docs/mvp-completion-plan.md`.
**Depends on A** — §14's highest-value notification is "[Name] hit you with a
banana!", and there is no banana to be hit with until A ships.

## Goal

Three triggers, not §14's eight. §15 scopes MVP push to "sabotage + day end +
conditional day start":

| §14 trigger | Timing | MVP? |
|---|---|---|
| Sabotaged | real-time | ✅ the emotional core, always sends |
| Day ending soon | 23:00 local | ✅ |
| Day ends | 00:00 local | ✅ |
| Day starts | mid-morning local, only if the app has not been opened | ✅ |
| Podium drop, overtake digest, weekly recap, streak at risk | — | ⬜ V1 |

Everything here is **buildable and testable today**. The Developer Program gates
only the APNs auth key that lets FCM reach iOS.

## What already exists — do not rebuild it

- **`app_events`** (`20260727120300_progression_and_infra.sql:58`) — `type` is
  free text with a length check, so new event types need no migration.
  `deploy-sabotage` already writes `sabotage_received` with the actor and the
  target's new total (`deploy-sabotage/index.ts:186-197`).
- **The hourly cron pattern** — `20260728150000_schedule_finalize_days.sql`
  reads the project URL and `cron_secret` from Vault at call time and never
  hardcodes a project ref. Copy it exactly.
- **`CRON_SECRET` guarding** — `finalize-days/index.ts:41-45`.
- **`src/features/telemetry/events.ts`** — fire-and-forget `track()` into
  `app_events`, with the `app_events_insert_own` policy already granting the
  client INSERT on its own rows.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Quiet hours vs day boundaries | **Exempt the day-boundary pair alongside sabotage** | Plan decision #2. §14 forbids 22:00–07:00 then schedules two notifications inside it. Those two *are* the evening urgency loop; suppressing them would leave the engine sending only V1 triggers. |
| How the exemption is expressed | **A set of exempt triggers, not a sabotage special case** | Three exempt triggers written as one rule plus two exceptions is a rule that will be misread. |
| Where day-boundary pushes are scheduled | **A new `dispatch-notifications` Edge Function** | See the correction below. `finalize-days` computes the wrong window. |
| Budget engine location | **`packages/kairo-core/src/notifications.ts`, pure** | Same contract as scoring: no I/O, no clock reads, no randomness. §14's rules become testable without a device or a push certificate. |
| Permission prompt timing | **After the first squad join or first sabotage event** | §5: "every ask has a visible why". Never during onboarding. |
| Solo users and rank copy | **Rank-less copy variants, not suppression** | "You're in 1st place" in a squad of one is absurd, but suppressing the day-boundary loop for solo users would gut it for exactly the population §7's churn argument is about. |

---

## Correction to the plan: `finalize-days` cannot carry these

The plan states that `finalize-days` "already resolves each user's local day and
grace window, which is exactly the computation '11 PM local' and 'midnight
local' need."

It is not. `finalizable_days()` selects days whose local midnight passed **more
than two hours ago** (`20260728140000_finalizable_days.sql:26`). Riding it would
fire "Day ends" at 02:00 local — two hours late, with §14's own copy
("Provisional: You finished [rank]. Finalizes in ~2h.") already false, and deep
inside quiet hours. It has no notion of 23:00 local at all.

The needed computation is different and simpler: **which users are at local hour
H right now.** That is a new SQL function, so there is no duplication to avoid,
and separating the dispatcher from the finalizer is worth having on its own
terms:

- `finalize-days` caps at `MAX_DAYS_PER_RUN = 500` inside a 55s cron timeout
  (`schedule_finalize_days.sql:48`). Adding per-user FCM round trips to that
  budget risks days not closing.
- A push failure must never abort a finalization. Two functions make that
  structural rather than a matter of careful `try`/`catch`.

---

## C1. `packages/kairo-core/src/notifications.ts` — the budget engine

Pure. Every input supplied by the caller, exactly like `isFinalizable()`.

```ts
export type NotificationTrigger =
  | 'sabotaged'
  | 'day_ending_soon'
  | 'day_ends'
  | 'day_starts';
  // V1 adds: 'podium_drop' | 'overtake_digest' | 'weekly_recap' | 'streak_at_risk'

export const MAX_NOTIFICATIONS_PER_DAY = 3;
export const QUIET_HOURS = { from: 22, to: 7 } as const;

/**
 * Triggers quiet hours do not suppress. §14 exempts sabotage explicitly and
 * then schedules the day-boundary pair at 23:00 and 00:00 — inside the window.
 * Those two are the core loop, not discretionary, so they are exempt on the
 * same footing rather than as an exception to the exemption.
 */
export const QUIET_HOURS_EXEMPT: readonly NotificationTrigger[] = [
  'sabotaged', 'day_ending_soon', 'day_ends',
];

/** Sends regardless of the daily budget. §14: "the emotional core". */
export const BUDGET_EXEMPT: readonly NotificationTrigger[] = ['sabotaged'];

export interface Candidate {
  trigger: NotificationTrigger;
  userId: string;
  /** Opaque to this module — it never builds copy. */
  data: Record<string, unknown>;
}

export interface LocalTime { hour: number; minute: number }

export function planNotifications(input: {
  candidates: readonly Candidate[];
  sentToday: number;
  localNow: LocalTime;
  quietHours?: { from: number; to: number };
  maxPerDay?: number;
}): Candidate[];
```

Rules, applied in order:

1. **Quiet hours.** Drop any candidate not in `QUIET_HOURS_EXEMPT` when
   `localNow` falls in the window. The predicate must wrap midnight —
   `from > to` means `hour >= from || hour < to`. A naive `from <= h && h < to`
   is empty for 22→7 and silently disables the rule.
2. **Budget.** `sabotaged` always passes. Everything else is admitted while
   `sentToday + admitted < maxPerDay`, in candidate order.
3. Return the survivors. **The module never decides copy, never formats, never
   sends.** It answers one question: which of these may go out.

`QUIET_HOURS_EXEMPT` and `BUDGET_EXEMPT` are separate lists on purpose — the two
rules are independent in §14, and collapsing them would make the day-boundary
pair budget-exempt as a side effect of a quiet-hours decision.

The shape anticipates V1's podium/digest collapse without implementing it, the
way `SabotageItem` anticipates the V1 items.

### Tests — TDD, `packages/kairo-core/src/notifications.test.ts`

- Quiet hours suppress `day_starts` at 23:00 **and** at 03:00 (the wrap).
- Quiet hours do not suppress `sabotaged`, `day_ending_soon` or `day_ends`.
- Nothing is suppressed at 12:00.
- The budget admits exactly `maxPerDay - sentToday` non-exempt candidates.
- `sabotaged` sends with `sentToday = 99`.
- `sabotaged` sends at 03:00 with `sentToday = 99` — both rules bypassed at once.
- Boundary hours: 22:00 is quiet, 21:59 is not, 07:00 is not, 06:59 is.
- Candidate order is preserved and the function is pure — same input, same
  output, no mutation of the input array.

---

## C2. Schema — `supabase/migrations/20260807110200_notifications.sql`

Wrapped `begin; ... commit;`, applied per `CLAUDE.md`'s remote-SQL procedure.

### `device_tokens`

```sql
create table public.device_tokens (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  token      text not null,
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now(),
  primary key (token)
);
create index device_tokens_user_idx on public.device_tokens (user_id);
```

**Primary key on `token`, not `(user_id, token)`.** A device changing hands must
re-point to the new owner, not accumulate a second row that pushes one person's
sabotage alerts to another person's phone. The client upserts on conflict of
`token`.

RLS: owner may `select`, `insert`, `update` and `delete` their own rows
(`user_id = (select auth.uid())`). This is the one table in the schema a client
legitimately writes, because only the device knows its token.

### `notification_log`

```sql
create table public.notification_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  local_date   date not null,
  trigger_type text not null,
  sent_at      timestamptz not null default now()
);
create index notification_log_user_date_idx
  on public.notification_log (user_id, local_date);
```

`trigger_type`, not `trigger` as the plan names it. `TRIGGER` is a PostgreSQL
keyword and `trigger` is a plpgsql type; the column name is legal unquoted but
reads ambiguously in exactly the definer functions that will query it.

This is what `sentToday` counts, and the only way to answer "did the budget
suppress anything?" during the beta. Owner-readable; no client write grant —
the server writes it.

**A row is written only on a successful send.** A logged suppression would
inflate `sentToday` and suppress the next one too.

### `users_at_local_hour()`

```sql
create function public.users_at_local_hour(p_hour integer)
returns table (user_id uuid, local_date date, timezone text)
language sql stable security definer set search_path = ''
as $$
  select p.id,
         (now() at time zone p.timezone)::date,
         p.timezone
  from public.profiles p
  where extract(hour from (now() at time zone p.timezone))::int = p_hour
$$;
```

`revoke execute ... from public, anon, authenticated` — cron only, like
`finalizable_days()`.

The cron fires at five past the hour, so half-hour zones (`+05:30`, `+05:45`)
still land unambiguously inside one local hour. Philippines is `+08:00`.

**`local_date` is the date the notification is *about*, and it differs by
trigger.** At local hour 0, the day that just ended is `local_date - 1`; the
caller subtracts, and the tests pin it.

### Cron

A second schedule, on the pattern of `schedule_finalize_days.sql` — same Vault
lookups, same `x-cron-secret` header, idempotent `unschedule` first, at seven
past the hour to stagger clear of the finalizer:

```sql
select cron.schedule('dispatch-notifications-hourly', '7 * * * *', $cron$ ... $cron$);
```

---

## C3. Delivery

### Sabotage — inline, from `deploy-sabotage`

Fires right after the event lands and the rescore succeeds, replacing the
comment at `deploy-sabotage/index.ts:199-202`. Real-time by definition; bypasses
both quiet hours and the budget, so it does not call `planNotifications` at all
— it is the one trigger with no decision to make.

Copy, from §14: `"[actorName] hit you with a banana! You're down 500 points 🍌"`

**The send must not fail the deploy.** The event is already an immutable fact
and the ledger is already spent by that point. Wrap it, log a failure into
`app_events` as `push_failed`, and still return `ok: true`. A user whose push
failed has lost a notification; a user whose deploy 500s has lost an item.

### Day boundaries — `supabase/functions/dispatch-notifications/`

Per the repo convention that handlers stay thin, the decisions live in
`supabase/functions/_shared/notification-plan.ts`, tested in plain Node:

```ts
export function planHourlyDispatch(input: {
  now: Date;
  users: readonly { userId: string; localDate: string; timeZone: string }[];
  hour: number;
}): Candidate[];
```

`index.ts` only authenticates the cron secret, calls `users_at_local_hour` for
each of the three scheduled hours, reads what each candidate needs, plans,
sends, logs.

| Trigger | Local hour | Needs |
|---|---|---|
| `day_starts` | 9 | **Only if `app_events` has no `app_open` for this user on this local date.** |
| `day_ending_soon` | 23 | Rank from `squad_leaderboard`, or the day's total for a solo user |
| `day_ends` | 0 | Rank for `local_date - 1`; copy stays "Provisional … finalizes in ~2h" per §14 |

`day_starts` needs a signal the app does not currently emit. **Add `app_open` to
`AppEventType`** in `src/features/telemetry/events.ts:16` and `track()` it on
foreground. `app_events.type` is free text with a length check, so no migration;
the existing `app_events_user_time_idx (user_id, occurred_at desc)` serves the
lookup.

Every dispatch runs its candidates through `planNotifications` with `sentToday`
read from `notification_log`, and writes a log row per successful send.

### FCM

Server side: FCM HTTP v1, service-account JWT, credentials as Edge Function
secrets — never in the repo. Client side: `expo-notifications` (not currently a
dependency) plus `GoogleService-Info.plist` supplied at build time via
`app.config.ts`.

The client registers its token into `device_tokens` after permission is granted,
and re-upserts on every token refresh. A token that FCM reports as
`UNREGISTERED` is deleted server-side rather than retried.

### Permission prompt

Asked **after the first squad join or the first sabotage event**, never in
onboarding (§5: "every ask has a visible why"). The sheet says what it is for
before the OS dialog appears — the same discipline `HealthPermissionSheet`
already applies.

---

## C4. What the Developer Program actually blocks

Everything above is buildable and testable now. The APNs auth key is the only
gate, and it is configuration:

1. Add the APNs key to Firebase.
2. Drop `GoogleService-Info.plist` into the build.
3. Rebuild.

No code. Until then, `dispatch-notifications` runs end to end and writes
`notification_log` rows with sends that fail at the FCM boundary — which is
itself the integration test for everything except the last hop.

---

## Tests

| Component | How |
|---|---|
| `planNotifications` | TDD in `kairo-core`, Node |
| `planHourlyDispatch`, `local_date` arithmetic at hour 0 | Plain Node, `_shared/notification-plan.test.ts` |
| `users_at_local_hour`, `device_tokens` RLS, `notification_log` RLS | PGlite schema tests |
| Token registration, permission sheet | Hand-verified on the simulator |
| Actual push delivery | Physical device, after workstream E |

Schema tests worth naming: a user cannot read another user's `device_tokens`
row; inserting a token that already exists re-points it to the new owner rather
than erroring; no client role can insert into `notification_log`.

## What this deliberately does not do

- **No podium drop, overtake digest, weekly recap or streak-at-risk.** V1.
- **No Android.** `platform` accepts it so the column need not change, but iOS
  is the only MVP target.
- **No in-app notification centre.** Push deep-links to the relevant screen;
  the squad feed from workstream A is the in-app record.
- **No user-facing notification settings.** §14 says "max 3/day (configurable)";
  configurable means the constant, not a settings screen, at MVP.

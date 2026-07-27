-- Sabotage as an immutable event log (spec §12).
--
-- Nothing ever mutates a score directly. Effects are replayed from this log at
-- computation time, which gives full auditability, makes retries harmless, and
-- means freeze windows fall out of timestamps rather than needing their own
-- state machine.

-- MVP ships the Banana alone (§8). V1 extends this enum with
-- 'bat', 'shield', 'boost', 'spy', 'bomb'.
create type public.sabotage_item as enum ('banana');

create table public.sabotage_events (
  id uuid primary key default gen_random_uuid(),

  actor_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  squad_id uuid not null references public.squads (id) on delete cascade,

  item public.sabotage_item not null,
  created_at timestamptz not null default now(),

  -- Deploy caps are counted per actor-day; effects land on the target's day.
  -- In a mixed-timezone squad these are genuinely different dates.
  actor_local_date date not null,
  target_local_date date not null,

  -- Written once, at insert time. Records what the deploy function decided:
  -- score delta applied, whether a shield absorbed it (V1), and so on.
  -- The table is append-only, so this can never be revised afterwards.
  outcome jsonb not null default '{}'::jsonb,

  constraint sabotage_events_no_self_target check (actor_id <> target_id)
);

comment on table public.sabotage_events is
  'Append-only. UPDATE and DELETE are rejected for every role including service_role.';

create index sabotage_events_target_idx
  on public.sabotage_events (target_id, target_local_date);

create index sabotage_events_actor_idx
  on public.sabotage_events (actor_id, actor_local_date);

create index sabotage_events_squad_feed_idx
  on public.sabotage_events (squad_id, created_at desc);

-- Immutability is enforced in the database, not merely by withholding grants,
-- so that even a compromised service key cannot rewrite the audit trail.
create trigger sabotage_events_append_only
before update or delete on public.sabotage_events
for each row execute function public.reject_mutation();

-- ---------------------------------------------------------------------------
-- daily_item_ledger
-- ---------------------------------------------------------------------------

-- MVP has no coin economy (§15): items arrive via a daily grant only. This
-- tracks the grant and the deploy count that backs the §8 cap — you may OWN
-- unlimited items but may DEPLOY only 2/day free, 3/day Legendary. That cap is
-- the anti-pay-to-win line.
create table public.daily_item_ledger (
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  granted smallint not null default 0 check (granted >= 0),
  deployed smallint not null default 0 check (deployed >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date),
  constraint daily_item_ledger_cannot_overdeploy check (deployed <= granted)
);

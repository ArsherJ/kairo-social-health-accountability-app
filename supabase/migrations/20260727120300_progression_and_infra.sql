-- Streaks, push tokens, and the two logs that make the beta measurable.

-- ---------------------------------------------------------------------------
-- streaks
-- ---------------------------------------------------------------------------

create table public.streaks (
  user_id uuid primary key references public.profiles (id) on delete cascade,

  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),

  -- Last local date with any score above zero. The bar is deliberately low
  -- (§19) so streaks feel maintainable.
  last_scored_date date,

  -- The Streak Shield recharges every 30 days. Null means one is banked now.
  -- Turning the biggest churn event into a relief moment is the single most
  -- valuable retention mechanic in the spec.
  shield_available_on date,

  updated_at timestamptz not null default now(),

  constraint streaks_longest_at_least_current
    check (longest_streak >= current_streak)
);

create trigger streaks_touch_updated_at
before update on public.streaks
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- device_tokens
-- ---------------------------------------------------------------------------

create table public.device_tokens (
  -- One row per device. A token is globally unique, and re-registering it
  -- against a different account must move it, not duplicate it.
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index device_tokens_user_id_idx on public.device_tokens (user_id);

create trigger device_tokens_touch_updated_at
before update on public.device_tokens
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- app_events
-- ---------------------------------------------------------------------------

-- Every app event with a timestamp (§11). This is the behavioural dataset the
-- beta's four risk questions are answered from — and later, the fuel for V1.5
-- personalisation. Cheap to write now, impossible to backfill later.
create table public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  type text not null check (char_length(type) between 1 and 64),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index app_events_user_time_idx
  on public.app_events (user_id, occurred_at desc);

create index app_events_type_time_idx
  on public.app_events (type, occurred_at desc);

-- ---------------------------------------------------------------------------
-- notification_log
-- ---------------------------------------------------------------------------

-- Backs the §14 budget: at most 3 pushes per day, none between 10 PM and 7 AM
-- local, with sabotage exempt from both rules. Notification fatigue kills the
-- FOMO loop, so the budget is enforced server-side against this table rather
-- than trusted to each sending code path.
create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  -- The recipient's local date, so the daily budget resets when their day does.
  local_date date not null,
  sent_at timestamptz not null default now()
);

create index notification_log_budget_idx
  on public.notification_log (user_id, local_date);

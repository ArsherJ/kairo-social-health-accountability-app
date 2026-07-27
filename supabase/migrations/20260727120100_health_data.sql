-- Health ingestion and scoring tables.
--
-- Canonical ingestion unit is one row per (user, local_date, hour) with the
-- metrics as columns (roadmap deviation #3 — the spec sketched one row per
-- metric). 24 rows per user-day instead of 96, a single upsert statement, no
-- metric-name typos, and VIT falls out as `count(*) where steps >= 250`.
--
-- Idempotency is the whole point: re-syncs and Apple's retroactive step-count
-- revisions simply overwrite the bucket, so replaying a sync is always safe.

-- ---------------------------------------------------------------------------
-- health_buckets
-- ---------------------------------------------------------------------------

create table public.health_buckets (
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- The user's OWN local date and hour (§2). Never UTC — VIT's hourly windows
  -- and the midnight reset must both mean what the user experiences.
  local_date date not null,
  hour smallint not null check (hour between 0 and 23),

  steps integer not null default 0 check (steps >= 0),
  -- Stored for the anti-cheat stride cross-check (§5); not itself scored.
  distance_m numeric(10, 2) not null default 0 check (distance_m >= 0),
  active_kcal numeric(10, 2) not null default 0 check (active_kcal >= 0),
  active_minutes numeric(6, 2) not null default 0
    check (active_minutes between 0 and 60),

  updated_at timestamptz not null default now(),

  primary key (user_id, local_date, hour)
);

comment on table public.health_buckets is
  'Hourly health data in the user local timezone. Service-role writes only; never readable by squadmates.';

create index health_buckets_user_date_idx
  on public.health_buckets (user_id, local_date);

-- ---------------------------------------------------------------------------
-- daily_sleep  (REC — wearable users only, bonus never penalty)
-- ---------------------------------------------------------------------------

create table public.daily_sleep (
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  minutes integer not null check (minutes between 0 and 1440),
  source text,
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

comment on table public.daily_sleep is
  'Sleep duration from a wearable. Absence means the REC row simply does not appear — never a zero score.';

-- ---------------------------------------------------------------------------
-- daily_scores
-- ---------------------------------------------------------------------------

create type public.day_status as enum ('provisional', 'final');

create table public.daily_scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,

  -- Post-multiplier tier points, as computed by @kairo/core.
  agi_points integer not null default 0 check (agi_points >= 0),
  str_points integer not null default 0 check (str_points >= 0),
  end_points integer not null default 0 check (end_points >= 0),
  vit_points integer not null default 0 check (vit_points >= 0),
  rec_points integer not null default 0 check (rec_points >= 0),
  consistency_points integer not null default 0 check (consistency_points >= 0),

  -- Replayed from the immutable sabotage log; always <= 0 at MVP.
  sabotage_delta integer not null default 0,

  -- Health score plus sabotage, floored at zero. The leaderboard number.
  total integer not null default 0 check (total >= 0),

  -- {"AGI":"bronze","STR":"gold",...} — the only per-stat detail squadmates see.
  tiers jsonb not null default '{}'::jsonb,
  contributing_stats smallint not null default 0
    check (contributing_stats between 0 and 4),
  has_rec boolean not null default false,
  featured_stat text check (featured_stat in ('AGI', 'STR', 'END', 'VIT')),

  xp_awarded integer not null default 0 check (xp_awarded >= 0),

  -- Social anti-cheat only (§20): visible to the squad, never a ban or a
  -- score reduction.
  flagged boolean not null default false,

  status public.day_status not null default 'provisional',
  finalized_at timestamptz,

  updated_at timestamptz not null default now(),

  primary key (user_id, local_date),

  -- A finalized day must record when it happened; coins and XP hang off this.
  constraint daily_scores_finalized_at_present
    check ((status = 'final') = (finalized_at is not null))
);

comment on table public.daily_scores is
  'Server-computed daily score. Service-role writes only; the client never posts a number.';

-- Leaderboards read by (date, total desc); the finalizer scans provisional days.
create index daily_scores_date_total_idx
  on public.daily_scores (local_date, total desc);

create index daily_scores_provisional_idx
  on public.daily_scores (local_date)
  where status = 'provisional';

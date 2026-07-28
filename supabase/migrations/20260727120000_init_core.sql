-- Kairo core identity and squad tables.
--
-- Privacy stance (spec §5): squadmates see tiers and scores, never raw health
-- data and never body metrics. That is enforced structurally — `profiles` is
-- readable only by its owner, and squad-facing reads go through the
-- SECURITY DEFINER RPCs in a later migration, which project a safe subset of
-- columns. A forged client cannot widen what it sees.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Attached to append-only tables so the log is immutable for every role,
-- including service_role. Nothing is allowed to rewrite history.
create or replace function public.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'relation %.% is append-only', tg_table_schema, tg_table_name
    using errcode = '0A000';
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  character_name text not null
    check (char_length(btrim(character_name)) between 2 and 20),

  -- MVP ships Hunter only (§6). The other three are accepted so V1 needs no
  -- migration, but onboarding will not offer them yet.
  class text not null default 'hunter'
    check (class in ('hunter', 'athlete', 'scholar', 'guardian')),

  -- IANA zone. Drives per-user local days; validated by trigger below.
  timezone text not null default 'Asia/Manila',

  -- Body metrics improve HealthKit's active-calorie estimate (§5). Optional by
  -- design: onboarding defers them to a soft prompt and never gates on them.
  height_cm numeric(5, 1) check (height_cm between 50 and 260),
  weight_kg numeric(5, 1) check (weight_kg between 20 and 400),
  birth_year smallint check (birth_year between 1900 and 2200),
  sex text check (sex in ('male', 'female', 'other')),

  level integer not null default 1 check (level >= 1),
  total_xp integer not null default 0 check (total_xp >= 0),

  has_wearable boolean not null default false,
  -- §11: any member may opt out of being named on shared recap cards.
  exclude_from_recap boolean not null default false,
  is_legendary boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per user. Readable only by its owner; squadmates reach a safe subset via squad_leaderboard().';

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

-- A CHECK constraint cannot query pg_timezone_names (not IMMUTABLE), so the
-- guarantee lives in a trigger. An invalid zone would silently corrupt every
-- local-day boundary for that user, so it is worth catching at write time.
create or replace function public.validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise exception 'unknown IANA timezone: %', new.timezone
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_timezone
before insert or update of timezone on public.profiles
for each row execute function public.validate_timezone();

-- ---------------------------------------------------------------------------
-- squads
-- ---------------------------------------------------------------------------

create table public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 30),

  -- 6 characters from an unambiguous alphabet; read aloud in group chats.
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),

  leader_id uuid not null references public.profiles (id) on delete restrict,

  -- 6 for free squads, 15 for Legendary (§7).
  max_members smallint not null default 6 check (max_members between 2 and 15),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index squads_leader_id_idx on public.squads (leader_id);

create trigger squads_touch_updated_at
before update on public.squads
for each row execute function public.touch_updated_at();

-- Excludes I, L, O, 0 and 1 so a code cannot be misheard or mistyped.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate
        || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;

    exit when not exists (
      select 1 from public.squads where invite_code = candidate
    );
  end loop;

  return candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- squad_members
-- ---------------------------------------------------------------------------

create table public.squad_members (
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (squad_id, user_id)
);

create index squad_members_user_id_idx on public.squad_members (user_id);

-- Enforces both caps from §7: squad size, and how many squads one user may
-- belong to (1 free / 3 Legendary).
--
-- The `for update` on the squad row is load-bearing: without it two people
-- accepting the same invite simultaneously could both read "5 of 6" and both
-- insert, overfilling the squad.
create or replace function public.enforce_squad_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  squad_cap smallint;
  member_count integer;
  user_squad_count integer;
  user_squad_cap integer;
  user_is_legendary boolean;
begin
  select max_members into squad_cap
  from public.squads
  where id = new.squad_id
  for update;

  if squad_cap is null then
    raise exception 'squad % does not exist', new.squad_id using errcode = '23503';
  end if;

  select count(*) into member_count
  from public.squad_members
  where squad_id = new.squad_id;

  if member_count >= squad_cap then
    raise exception 'squad is full (% of %)', member_count, squad_cap
      using errcode = '23514';
  end if;

  select is_legendary into user_is_legendary
  from public.profiles
  where id = new.user_id;

  user_squad_cap := case when user_is_legendary then 3 else 1 end;

  select count(*) into user_squad_count
  from public.squad_members
  where user_id = new.user_id;

  if user_squad_count >= user_squad_cap then
    raise exception 'user already belongs to % squad(s), limit is %',
      user_squad_count, user_squad_cap
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger squad_members_enforce_limits
before insert on public.squad_members
for each row execute function public.enforce_squad_limits();

-- The client's write surface: three SECURITY DEFINER functions.
--
-- squad_leaderboard() is where roadmap deviation #4 lives. Rather than trusting
-- the client to request only safe columns, the privacy rule is a projection:
-- the function returns character name, level, tiers and total, and there is no
-- argument that makes it return raw steps or hourly patterns.

-- ---------------------------------------------------------------------------
-- squad_leaderboard
-- ---------------------------------------------------------------------------

create or replace function public.squad_leaderboard(
  p_squad_id uuid,
  p_local_date date default null
)
returns table (
  rank bigint,
  user_id uuid,
  character_name text,
  class text,
  level integer,
  local_date date,
  total integer,
  tiers jsonb,
  contributing_stats smallint,
  has_rec boolean,
  flagged boolean,
  status public.day_status,
  current_streak integer,
  is_self boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and squad_members.user_id = v_user
  ) then
    raise exception 'not a member of this squad' using errcode = '42501';
  end if;

  return query
  with scored as (
    select
      p.id                                as uid,
      p.character_name                    as cname,
      p.class                             as pclass,
      p.level                             as plevel,
      -- Per-user local days (§2): each member is scored on their OWN current
      -- date unless the caller pins one. This is why timezone lives on the
      -- profile — an OFW in Dubai and a sibling in Cebu are on different dates
      -- at the same instant, and each deserves their own full 24-hour window.
      coalesce(p_local_date, (now() at time zone p.timezone)::date) as ldate,
      coalesce(ds.total, 0)               as dtotal,
      coalesce(ds.tiers, '{}'::jsonb)     as dtiers,
      coalesce(ds.contributing_stats, 0::smallint) as dcontrib,
      coalesce(ds.has_rec, false)         as drec,
      coalesce(ds.flagged, false)         as dflag,
      coalesce(ds.status, 'provisional'::public.day_status) as dstatus,
      coalesce(st.current_streak, 0)      as streak
    from public.squad_members sm
    join public.profiles p on p.id = sm.user_id
    left join public.daily_scores ds
      on ds.user_id = p.id
     and ds.local_date = coalesce(p_local_date, (now() at time zone p.timezone)::date)
    left join public.streaks st on st.user_id = p.id
    where sm.squad_id = p_squad_id
  )
  select
    row_number() over (order by s.dtotal desc, s.cname asc),
    s.uid, s.cname, s.pclass, s.plevel, s.ldate,
    s.dtotal, s.dtiers, s.dcontrib, s.drec, s.dflag, s.dstatus, s.streak,
    s.uid = v_user
  from scored s
  order by s.dtotal desc, s.cname asc;
end;
$$;

comment on function public.squad_leaderboard(uuid, date) is
  'Tiers and scores only. There is no argument that exposes raw steps or hourly movement.';

-- ---------------------------------------------------------------------------
-- create_squad
-- ---------------------------------------------------------------------------

create or replace function public.create_squad(p_name text)
returns public.squads
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_is_legendary boolean;
  v_squad public.squads;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select is_legendary into v_is_legendary
  from public.profiles where id = v_user;

  if not found then
    raise exception 'complete onboarding before creating a squad'
      using errcode = '42501';
  end if;

  insert into public.squads (name, invite_code, leader_id, max_members)
  values (
    btrim(p_name),
    public.generate_invite_code(),
    v_user,
    -- §7's capacity table. Mirrored in packages/kairo-core/src/squad.ts as
    -- FREE_SQUAD_MAX_MEMBERS / LEGENDARY_SQUAD_MAX_MEMBERS; change both.
    case when v_is_legendary then 15 else 6 end
  )
  returning * into v_squad;

  -- The squad_members trigger enforces the per-user squad cap here, so a free
  -- user who already belongs to a squad fails and the whole call rolls back.
  insert into public.squad_members (squad_id, user_id)
  values (v_squad.id, v_user);

  return v_squad;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_squad
-- ---------------------------------------------------------------------------

create or replace function public.join_squad(p_invite_code text)
returns public.squads
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_squad public.squads;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'complete onboarding before joining a squad'
      using errcode = '42501';
  end if;

  select * into v_squad
  from public.squads
  where invite_code = upper(btrim(p_invite_code));

  if not found then
    raise exception 'invalid invite code' using errcode = '22023';
  end if;

  -- Idempotent: tapping an invite link twice is a normal thing to do and must
  -- not read as an error.
  if exists (
    select 1 from public.squad_members
    where squad_id = v_squad.id and user_id = v_user
  ) then
    return v_squad;
  end if;

  insert into public.squad_members (squad_id, user_id)
  values (v_squad.id, v_user);

  return v_squad;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute grants
-- ---------------------------------------------------------------------------

-- Postgres grants EXECUTE to PUBLIC by default, which would be a hole in a
-- SECURITY DEFINER function. Revoke first, then hand it to authenticated only.
revoke execute on function public.squad_leaderboard(uuid, date) from public, anon;
revoke execute on function public.create_squad(text)            from public, anon;
revoke execute on function public.join_squad(text)              from public, anon;
revoke execute on function public.generate_invite_code()        from public, anon, authenticated;
revoke execute on function public.is_squad_member(uuid)         from public, anon;
revoke execute on function public.shares_squad_with(uuid)       from public, anon;

grant execute on function public.squad_leaderboard(uuid, date) to authenticated;
grant execute on function public.create_squad(text)            to authenticated;
grant execute on function public.join_squad(text)              to authenticated;

-- squad_leaderboard gains a per-member completed-day mode (§2; roadmap
-- deviation #6 recorded it as owed).
--
-- Recreated rather than replaced. Adding a defaulted parameter creates a
-- SECOND overload rather than replacing the first, and two near-identical
-- leaderboard functions is exactly how the privacy projection drifts apart.
--
-- Dropping has a consequence that must not be missed: the new function starts
-- with Postgres's default of EXECUTE to PUBLIC. On a SECURITY DEFINER function
-- that hands the projection to every role, so the revoke/grant at the bottom
-- is load-bearing rather than tidiness.
--
-- The member's date is also computed ONCE now, in a CTE. The previous version
-- computed it twice — in the select list and again in the join condition — and
-- two copies of the rule deciding which day you are ranked on can drift, which
-- would attach a score to a different date than the row reports.

begin;

drop function if exists public.squad_leaderboard(uuid, date);

create function public.squad_leaderboard(
  p_squad_id uuid,
  p_local_date date default null,
  p_mode text default 'current'
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

  -- Raise rather than fall back to 'current': a typo must not silently rank
  -- people on the wrong day.
  if p_mode not in ('current', 'completed') then
    raise exception 'unknown leaderboard mode: %', p_mode using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and squad_members.user_id = v_user
  ) then
    raise exception 'not a member of this squad' using errcode = '42501';
  end if;

  return query
  with member_day as (
    select
      p.id             as uid,
      p.character_name as cname,
      p.class          as pclass,
      p.level          as plevel,
      -- Per-user local days (§2). 'completed' is each member's OWN yesterday,
      -- so a Manila member and a New York member legitimately land on
      -- different dates in the same result set. That is the mode's purpose,
      -- and local_date is returned per row so the UI can say which day each
      -- score belongs to.
      case
        when p_local_date is not null then p_local_date
        when p_mode = 'completed' then ((now() at time zone p.timezone)::date - 1)
        else (now() at time zone p.timezone)::date
      end as ldate
    from public.squad_members sm
    join public.profiles p on p.id = sm.user_id
    where sm.squad_id = p_squad_id
  ),
  scored as (
    select
      md.uid, md.cname, md.pclass, md.plevel, md.ldate,
      coalesce(ds.total, 0)                                 as dtotal,
      coalesce(ds.tiers, '{}'::jsonb)                       as dtiers,
      coalesce(ds.contributing_stats, 0::smallint)          as dcontrib,
      coalesce(ds.has_rec, false)                           as drec,
      coalesce(ds.flagged, false)                           as dflag,
      coalesce(ds.status, 'provisional'::public.day_status) as dstatus,
      coalesce(st.current_streak, 0)                        as streak
    from member_day md
    left join public.daily_scores ds
      on ds.user_id = md.uid and ds.local_date = md.ldate
    left join public.streaks st on st.user_id = md.uid
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

comment on function public.squad_leaderboard(uuid, date, text) is
  'Tiers and scores only. p_mode is current (each member''s today) or completed (each member''s own yesterday). No argument exposes raw steps or hourly movement.';

-- Mandatory after a drop. See the header comment.
revoke execute on function public.squad_leaderboard(uuid, date, text) from public, anon;
grant  execute on function public.squad_leaderboard(uuid, date, text) to authenticated;

commit;

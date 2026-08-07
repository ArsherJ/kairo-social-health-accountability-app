-- squad_leaderboard gains a viewer the cron can name (§14's rank-aware pushes).
--
-- "1 hour left. You're in [rank] place." and "Provisional: You finished
-- [rank]." both need a rank, and dispatch-notifications runs as pg_cron with no
-- JWT — so auth.uid() is null and the existing guard refuses it.
--
-- The alternative was for the dispatcher to rank members itself. That would be
-- a second implementation of `order by weighted total desc, name asc`, and the
-- number in the push would eventually disagree with the number on the screen.
-- One ranking rule, two callers.
--
-- **p_as_user is honoured only when the caller has no JWT.** A signed-in client
-- passing someone else's id gets its own row marked is_self, exactly as before,
-- so this is a cron affordance rather than an impersonation grant. The
-- membership guard still applies to whoever ends up being the viewer.
--
-- Dropped and recreated because a defaulted parameter creates a SECOND overload
-- rather than replacing the first, and two near-identical leaderboard functions
-- is how the privacy projection drifts apart. Dropping resets EXECUTE to
-- PUBLIC, so the revoke/grant at the bottom is load-bearing.

begin;

drop function if exists public.squad_leaderboard(uuid, date, text);

create function public.squad_leaderboard(
  p_squad_id uuid,
  p_local_date date default null,
  p_mode text default 'current',
  p_as_user uuid default null
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
  is_self boolean,
  program text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- auth.uid() wins whenever it exists. Written this way round on purpose: a
  -- coalesce(p_as_user, auth.uid()) would let any authenticated caller read the
  -- board as somebody else.
  v_user uuid := coalesce((select auth.uid()), p_as_user);
  v_program text;
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

  select s.program into v_program from public.squads s where s.id = p_squad_id;

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
      -- The ranking number. Weighted here, never stored.
      public.program_weighted_total(
        v_program,
        coalesce(ds.agi_points, 0),
        coalesce(ds.str_points, 0),
        coalesce(ds.end_points, 0),
        coalesce(ds.vit_points, 0),
        coalesce(ds.consistency_points, 0),
        coalesce(ds.rec_points, 0),
        coalesce(ds.sabotage_delta, 0)
      )                                                     as dtotal,
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
    s.uid = v_user,
    v_program
  from scored s
  order by s.dtotal desc, s.cname asc;
end;
$$;

comment on function public.squad_leaderboard(uuid, date, text, uuid) is
  'Tiers and scores only. total is weighted by the squad''s program at read time (deviation #11); tiers stay raw. p_mode is current (each member''s today) or completed (each member''s own yesterday). p_as_user names the viewer for JWT-less callers (the notification cron) and is ignored when auth.uid() is set. No argument exposes raw steps or hourly movement.';

-- Mandatory after a drop. See the header comment.
revoke execute on function public.squad_leaderboard(uuid, date, text, uuid) from public, anon;
grant  execute on function public.squad_leaderboard(uuid, date, text, uuid) to authenticated;

commit;

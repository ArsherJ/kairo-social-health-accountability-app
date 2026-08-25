-- The race projection (roadmap deviations #46, #47).
--
-- Squadmates gain each other's DAILY TOTALS — steps, distance, active calories
-- and sleep minutes — and nothing else. Hourly buckets, heart rate, workout
-- sessions, pace and timestamps stay owner-only, which is the half of §5 that
-- actually carries routine.
--
-- The gate is reciprocal and per row: a member's totals are visible only when
-- that member has consented AND the viewer has consented. Per row rather than
-- per squad so one holdout does not block five people who agreed, and so the
-- holdout's decision is not broadcast to the others. Reciprocal so a
-- non-consenting viewer cannot free-ride on everyone else's disclosure.
--
-- Ranking is DELIBERATELY unchanged: the RPC still orders by the
-- program-weighted total (deviation #11). The race re-ranks on the client by
-- capped steps. Two orderings, one payload — and a schema test pins it, because
-- quietly reordering here would turn the weighted board into a step board.
--
-- The definition being extended is 20260819150000_three_stat_contract_drop.sql,
-- which is the current one. Anything earlier predates the three-stat `ratings`
-- object and the seven-argument `program_weighted_total`.

begin;

-- ---------------------------------------------------------------------------
-- 1. Consent
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column squad_data_consent_at timestamptz;

comment on column public.profiles.squad_data_consent_at is
  'When the player agreed their daily totals (steps, distance, active calories, sleep minutes) may be shown to squadmates. NULL means never agreed, and squad_leaderboard() returns NULL for every raw total on their row. Reciprocal: the viewer must have consented too. Hourly buckets, heart rate and workout sessions are never projected regardless of this column.';

-- A column-level REVOKE against a table-level GRANT is silently a no-op in
-- Postgres, so the table grant goes and the allowed columns are re-granted in
-- full. The list below is 20260818120000_species.sql's plus one.
revoke update on public.profiles from anon, authenticated;

grant update (
  character_name,
  character_body,
  species,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  exclude_from_recap,
  trains_run,
  trains_strength,
  squad_data_consent_at
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The projection
-- ---------------------------------------------------------------------------
--
-- Dropped by exact argument list, never `create or replace`: the return type
-- changes, and a surviving overload fails nothing until a call site resolves to
-- it. This is the create_goal / p_metric trap.

drop function if exists public.squad_leaderboard(uuid, date, text, uuid);

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
  ratings jsonb,
  contributing_stats smallint,
  has_rec boolean,
  flagged boolean,
  status public.day_status,
  current_streak integer,
  is_self boolean,
  program text,
  species text,
  steps integer,
  distance_m numeric,
  active_kcal numeric,
  sleep_minutes integer
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
  -- Read once, outside the query: the viewer's half of the reciprocal gate is
  -- the same answer for every row, and joining profiles to itself to get it
  -- would invite someone to "simplify" it into a per-row condition later.
  v_viewer_consent boolean;
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

  -- The cron viewer (p_as_user, no JWT) has a profile like anyone else, so
  -- this needs no special case: a digest built for someone who never consented
  -- sees the same NULLs their own screen shows them.
  select p.squad_data_consent_at is not null
    into v_viewer_consent
    from public.profiles p
   where p.id = v_user;

  return query
  with member_day as (
    select
      p.id             as uid,
      p.character_name as cname,
      p.class          as pclass,
      p.level          as plevel,
      -- The lifetime rollups, shaped like `tiers` so the client reads one map
      -- per row either way. Raw points, not the rating: the curve lives in
      -- @kairo/core and must not be reimplemented in SQL, which is the same
      -- rule deviation #18 applies to goal arithmetic. Three keys, matching
      -- CoreStat — the client filters this map by CORE_STATS.
      jsonb_build_object(
        'AGI', p.agi_total,
        'STR', p.str_total,
        'MND', p.mnd_total
      )                as pratings,
      p.species        as pspecies,
      p.squad_data_consent_at is not null as pconsent,
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
      md.uid, md.cname, md.pclass, md.plevel, md.pratings, md.pspecies,
      md.ldate, md.pconsent,
      -- The ranking number. Weighted here, never stored. The literal 0 is
      -- p_rec: deviation #41 retired rec_points and the column is dropped, so
      -- there is nothing left to read into it.
      public.program_weighted_total(
        v_program,
        coalesce(ds.agi_points, 0),
        coalesce(ds.str_points, 0),
        coalesce(ds.mind_points, 0),
        coalesce(ds.consistency_points, 0),
        0,
        coalesce(ds.normalization_factor, 1)
      )                                                     as dtotal,
      coalesce(ds.tiers, '{}'::jsonb)                       as dtiers,
      coalesce(ds.contributing_stats, 0::smallint)          as dcontrib,
      coalesce(ds.has_rec, false)                           as drec,
      coalesce(ds.flagged, false)                           as dflag,
      coalesce(ds.status, 'provisional'::public.day_status) as dstatus,
      coalesce(st.current_streak, 0)                        as streak,
      -- Daily SUMS only. The hour column is never selected and never grouped
      -- by, which is the difference between a total and a movement pattern.
      coalesce(hb.rsteps, 0)                                as dsteps,
      coalesce(hb.rdist, 0)                                 as ddist,
      coalesce(hb.rkcal, 0)                                 as dkcal,
      -- NOT coalesced to zero: absent sleep means no wearable reported any,
      -- and "0 minutes" is a claim about a night that was never measured.
      sl.minutes                                            as dsleep
    from member_day md
    left join public.daily_scores ds
      on ds.user_id = md.uid and ds.local_date = md.ldate
    left join public.streaks st on st.user_id = md.uid
    left join lateral (
      select
        coalesce(sum(b.steps), 0)::integer       as rsteps,
        coalesce(sum(b.distance_m), 0)::numeric  as rdist,
        coalesce(sum(b.active_kcal), 0)::numeric as rkcal
      from public.health_buckets b
      where b.user_id = md.uid and b.local_date = md.ldate
    ) hb on true
    left join public.daily_sleep sl
      on sl.user_id = md.uid and sl.local_date = md.ldate
  )
  select
    row_number() over (order by s.dtotal desc, s.cname asc),
    s.uid, s.cname, s.pclass, s.plevel, s.ldate,
    s.dtotal, s.dtiers, s.pratings, s.dcontrib, s.drec, s.dflag, s.dstatus, s.streak,
    s.uid = v_user,
    v_program,
    s.pspecies,
    -- Both halves of the gate, on every column. Written out four times rather
    -- than factored into one guard, because the next column added here must
    -- carry the condition too and a shared guard makes that easy to forget.
    case when v_viewer_consent and s.pconsent then s.dsteps end,
    case when v_viewer_consent and s.pconsent then s.ddist end,
    case when v_viewer_consent and s.pconsent then s.dkcal end,
    case when v_viewer_consent and s.pconsent then s.dsleep end
  from scored s
  order by s.dtotal desc, s.cname asc;
end;
$$;

comment on function public.squad_leaderboard(uuid, date, text, uuid) is
  'Scores, tiers, lifetime ability ratings, and — behind a reciprocal per-row consent gate — each member''s DAILY TOTALS for steps, distance, active calories and sleep minutes (deviation #47). total is weighted by the squad''s program at read time (deviation #11); tiers and ratings stay raw. Ordering is by the weighted total and NOT by steps: the race re-ranks on the client, so this one payload serves two orderings. ratings carries lifetime per-stat POINTS for AGI, STR and MND — the rating curve is ratingForStatPoints() in @kairo/core and is never reimplemented here. p_mode is current (each member''s today) or completed (each member''s own yesterday). p_as_user names the viewer for JWT-less callers (the notification cron) and is ignored when auth.uid() is set. No argument exposes hourly movement, heart rate, workout sessions, pace or timestamps. species is the player''s cosmetic character choice (deviation #40); NULL means never chosen.';

revoke all on function public.squad_leaderboard(uuid, date, text, uuid) from public, anon;
grant execute on function public.squad_leaderboard(uuid, date, text, uuid) to authenticated;

commit;

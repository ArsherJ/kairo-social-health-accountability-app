-- Remove sabotage.
--
-- Founder decision 2026-08-09: progress is still progress, so no player may
-- subtract from another's day. This drops the whole mechanic — §8 of the spec is
-- deleted at v1.4, and §20's principle #4 ("the sabotage mechanic is the soul of
-- the product") is formally overturned there rather than silently edited.
--
-- The squad leaderboard stays. What goes is the ability to reach across it and
-- take points off someone. `daily_scores.total` is now identical to the health
-- score: nothing reduces a day.
--
-- A forward migration rather than a rewrite of 20260727120200_sabotage.sql, so
-- the applied history stays honest and the live project can be brought forward
-- by exactly this file.

begin;

-- ---------------------------------------------------------------------------
-- 1. squad_feed — its entire body reads sabotage_events
-- ---------------------------------------------------------------------------

drop function if exists public.squad_feed(uuid, int);

-- ---------------------------------------------------------------------------
-- 2. program_weighted_total loses p_sabotage
-- ---------------------------------------------------------------------------
--
-- Dropped and recreated because the PARAMETER LIST changes, and
-- `create or replace` would leave the 8-argument version in place beside the new
-- 7-argument one. Two weighting functions is exactly how the board and its
-- differential test drift apart.
--
-- Dropping resets EXECUTE to Postgres's default of PUBLIC, so the revoke/grant
-- below is load-bearing rather than tidiness.

drop function if exists public.program_weighted_total(
  text, integer, integer, integer, integer, integer, integer, integer
);

create function public.program_weighted_total(
  p_program text,
  p_agi integer,
  p_str integer,
  p_end integer,
  p_vit integer,
  p_consistency integer,
  p_rec integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(
    0,
    -- Only the four stats are weighted. The consistency bonus and REC stay
    -- universal (§5): a program tilts what activity is worth, never the reward
    -- for showing up on all four stats or for sleeping.
    --
    -- The zero floor is unreachable now that every term is non-negative. It
    -- stays because weightedBoardTotal in kairo-core keeps its Math.max(0, …)
    -- and the differential test compares the two expressions — dropping it on
    -- one side only would be a divergence the test cannot see.
    --
    -- round() on numeric breaks ties away from zero, which matches JS
    -- Math.round for the non-negative values these columns hold. The literal
    -- 1.5 forces numeric arithmetic; do not "simplify" it to a float, whose
    -- tie-breaking is platform-dependent.
    round(
        p_agi * (case when p_program = 'running' then 1.5 else 1 end)
      + p_str * (case when p_program = 'gym'     then 1.5 else 1 end)
      -- END is deliberately never boosted, on any program: it rides
      -- AppleExerciseTime, which may be Watch-only in the wild (roadmap
      -- Phase 3). A program built on a stat most users cannot earn is a
      -- program nobody can win.
      + p_end * 1
      + p_vit * (case when p_program = 'walking' then 1.5 else 1 end)
    )::integer
    + p_consistency
    + p_rec
  );
$$;

comment on function public.program_weighted_total(text, integer, integer, integer, integer, integer, integer) is
  'Read-time squad-program weighting. Mirrors PROGRAM_WEIGHTS / weightedBoardTotal in packages/kairo-core/src/program.ts — change both, and the differential test in supabase/tests/schema.test.ts will tell you if you did not.';

revoke execute on function public.program_weighted_total(text, integer, integer, integer, integer, integer, integer)
  from public, anon;
grant execute on function public.program_weighted_total(text, integer, integer, integer, integer, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. squad_leaderboard passes one fewer argument
-- ---------------------------------------------------------------------------
--
-- `create or replace`, NOT drop-and-recreate: the signature and the returned row
-- are both unchanged — only the body loses `coalesce(ds.sabotage_delta, 0)`. A
-- replace preserves the existing grants, so unlike the function above this one
-- needs no revoke/grant. (Recreated in full because a plpgsql body cannot be
-- patched in place.)
--
-- Privacy is unchanged: per-stat points are read INSIDE the function to compute
-- one weighted number and are never projected. There is still no argument that
-- returns raw steps or hourly movement.

create or replace function public.squad_leaderboard(
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
        coalesce(ds.rec_points, 0)
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

-- ---------------------------------------------------------------------------
-- 4. The tables and the enum
-- ---------------------------------------------------------------------------
--
-- daily_item_ledger first: it tracked the daily grant and the deploy count that
-- backed §8's cap, and nothing outside sabotage ever read it.
--
-- Dropping sabotage_events takes its three indexes and the
-- `sabotage_events_append_only` trigger with it.

drop table if exists public.daily_item_ledger;
drop table if exists public.sabotage_events;
drop type  if exists public.sabotage_item;

-- ---------------------------------------------------------------------------
-- 5. daily_scores.sabotage_delta
-- ---------------------------------------------------------------------------
--
-- Safe to drop outright: `total` is a plain integer column, not generated, so no
-- stored score needs recomputing. Every row already satisfies
-- total = health score, because sabotage_delta was <= 0 and any row that carried
-- one had `total` written from the same computeDay() call.

alter table public.daily_scores drop column if exists sabotage_delta;

comment on table public.daily_scores is
  'Server-computed daily score. Service-role writes only; the client never posts a number. A day is built from that user''s own activity and nothing reduces it.';

-- ---------------------------------------------------------------------------
-- 6. Stale notification_log rows
-- ---------------------------------------------------------------------------
--
-- `kind` is unconstrained text, so old 'sabotaged' rows survive the drop above —
-- and they would no longer be *exempt*. `countsAgainstBudget()` returns true for
-- anything outside BUDGET_EXEMPT, which is now empty, so every historical hit
-- would start consuming the 3/day budget on the date it was logged and silently
-- suppress that day's evening push.

delete from public.notification_log where kind = 'sabotaged';

-- ---------------------------------------------------------------------------
-- What is deliberately left behind
-- ---------------------------------------------------------------------------
--
-- `public.reject_mutation()` and the transaction-local `kairo.allow_purge` flag
-- are now inert: that trigger function was attached to exactly one trigger in
-- the schema, `sabotage_events_append_only`, and `delete_account()` /
-- `delete_squad()` / `leave_squad()` set the flag only to let the cascade reach
-- it.
--
-- Both stay. Account deletion is the legal erasure guarantee this project makes
-- in docs/legal/, it is built and verified, and recreating those functions to
-- strip a no-op `set_config` call would put a working erasure path back into
-- review for zero runtime benefit. Tidy it separately if it ever matters — and
-- note that a future append-only table (goal completions are a candidate) would
-- want `reject_mutation()` back anyway.

commit;

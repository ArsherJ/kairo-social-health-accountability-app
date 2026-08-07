-- Read-time program weighting on the leaderboard (roadmap deviation #11 + #12).
--
-- This is the whole point of storing base points. `daily_scores` holds
-- pre-multiplier per-stat points and knows nothing about programs; the board
-- decides what they are worth. Consequences worth stating, because they are the
-- reason for the design:
--
--   * A program change can never corrupt stored data — there is nothing to
--     migrate, because nothing stored depends on the program.
--   * Score replay (sync-health, finalize-days, deploy-sabotage) never learns
--     programs exist.
--   * One Legendary user in three squads gets three honestly weighted views of
--     the same rows for free.
--
-- **The weights are duplicated in TypeScript**, in
-- `packages/kairo-core/src/program.ts` as PROGRAM_WEIGHTS. A migration cannot
-- import TypeScript — the FREE_SQUAD_MAX_MEMBERS precedent. Both sides carry a
-- cross-reference, and `supabase/tests/schema.test.ts` runs a differential test
-- asserting they agree on fixture days, the same way finalizable_days() and
-- isFinalizable() are kept honest.
--
-- Tiers stay RAW. A gold AGI means the same thing on every board; the program
-- tilts the ranking, not the vocabulary.

begin;

-- ---------------------------------------------------------------------------
-- program_weighted_total — the single SQL site for the weights
-- ---------------------------------------------------------------------------
--
-- Extracted rather than inlined into the leaderboard query so the differential
-- test can call the *same* expression the board uses, instead of a copy of it.

create function public.program_weighted_total(
  p_program text,
  p_agi integer,
  p_str integer,
  p_end integer,
  p_vit integer,
  p_consistency integer,
  p_rec integer,
  p_sabotage integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(
    0,
    -- Only the four stats are weighted. The consistency bonus, REC and
    -- sabotage stay universal (§5): a program tilts what activity is worth,
    -- never the reward for showing up on all four stats or for sleeping, and
    -- never the cost of being hit.
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
    + p_sabotage
  );
$$;

comment on function public.program_weighted_total(text, integer, integer, integer, integer, integer, integer, integer) is
  'Read-time squad-program weighting. Mirrors PROGRAM_WEIGHTS / weightedBoardTotal in packages/kairo-core/src/program.ts — change both, and the differential test in supabase/tests/schema.test.ts will tell you if you did not.';

revoke execute on function public.program_weighted_total(text, integer, integer, integer, integer, integer, integer, integer)
  from public, anon;
grant execute on function public.program_weighted_total(text, integer, integer, integer, integer, integer, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- squad_leaderboard, now program-aware
-- ---------------------------------------------------------------------------
--
-- Dropped and recreated because the returned row gains a column, which
-- `create or replace` cannot do. Dropping resets EXECUTE to PUBLIC, so the
-- revoke/grant at the bottom is load-bearing.
--
-- Privacy is unchanged: per-stat points are read INSIDE the function to compute
-- one weighted number and are never projected. There is still no argument that
-- returns raw steps or hourly movement.

drop function if exists public.squad_leaderboard(uuid, date, text);

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
  is_self boolean,
  program text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
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

comment on function public.squad_leaderboard(uuid, date, text) is
  'Tiers and scores only. total is weighted by the squad''s program at read time (deviation #11); tiers stay raw. p_mode is current (each member''s today) or completed (each member''s own yesterday). No argument exposes raw steps or hourly movement.';

-- Mandatory after a drop. See the header comment.
revoke execute on function public.squad_leaderboard(uuid, date, text) from public, anon;
grant  execute on function public.squad_leaderboard(uuid, date, text) to authenticated;

commit;

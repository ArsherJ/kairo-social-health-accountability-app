-- The board counts MND, and normalization reaches the board.
--
-- `squad_leaderboard()` does not rank on `daily_scores.total`. It re-sums the
-- per-stat columns, because that is the only way it can apply the squad's
-- program weights at read time (deviation #11). Two things followed from that
-- and both are bugs:
--
-- 1. It passed `agi, str, end, vit, consistency, rec` and **never
--    `mind_points`**, so a Gold night was 1,200 stored points the ranking
--    number could not see — on every program, not only `recovery`. The gap was
--    recorded as "recovery ranks unweighted", which understated it: MND
--    counted zero everywhere, and `rec_points`, which used to carry sleep, is
--    now written 0.
-- 2. Normalization never reached the board at all. A phone-only maxed day is
--    `total` 4,400 and ranked as 3,200 — the exact permanent gradient §2
--    exists to remove, surviving on the one surface §2 names.
--
-- ===========================================================================
-- A signature change is a DROP, not a replace.
-- ===========================================================================
--
-- Postgres resolves `program_weighted_total` by argument list. Appending
-- `p_mind` and `p_factor` with `create or replace` does not replace anything —
-- it creates a *second* function and leaves the seven-argument one standing.
-- Had this migration shipped without the recreated `squad_leaderboard()`
-- below, or had that recreation been forgotten, the board would have gone on
-- resolving to the old overload with MND uncounted, normalization unapplied
-- and nothing failing anywhere. Even shipped together, a surviving seven-
-- argument function is a live trap for the next call site that forgets the two
-- new parameters. So the old signature is dropped explicitly and by its exact
-- argument list; a schema test asserts exactly one overload exists afterwards.
-- This is the trap `create_goal` hit with `p_metric`, recorded in CLAUDE.md.
--
-- `drop` takes the EXECUTE grants with it, so they are re-issued below.

begin;

-- ---------------------------------------------------------------------------
-- 1. program_weighted_total gains p_mind and p_factor
-- ---------------------------------------------------------------------------

drop function if exists public.program_weighted_total(
  text, integer, integer, integer, integer, integer, integer
);

create or replace function public.program_weighted_total(
  p_program     text,
  p_agi         integer,
  p_str         integer,
  p_mind        integer,
  p_end         integer,
  p_vit         integer,
  p_consistency integer,
  p_rec         integer,
  p_factor      numeric
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(
    0,
    -- Only stats are weighted. The consistency bonus stays universal (§5): a
    -- program tilts what activity is worth, never the reward for showing up on
    -- every stat available to you. Normalization leaves it alone for the same
    -- reason it does in computeDailyScore — breadthBonus already accounts for
    -- earnable stats, and scaling it here would apply one correction twice.
    --
    -- The zero floor is unreachable now that every term is non-negative. It
    -- stays because weightedBoardTotal in kairo-core keeps its Math.max(0, …)
    -- and the differential test compares the two expressions — dropping it on
    -- one side only would be a divergence the test cannot see.
    --
    -- round() on numeric breaks ties away from zero, which matches JS
    -- Math.round for the non-negative values these columns hold. The literal
    -- 1.5 forces numeric arithmetic; do not "simplify" it to a float, whose
    -- tie-breaking is platform-dependent. p_factor is numeric for the same
    -- reason, and daily_scores.normalization_factor is numeric(4,3).
    --
    -- The factor multiplies the weighted sum and the result is rounded ONCE,
    -- at the end — the shape computeDailyScore uses, so the board and the
    -- stored total cannot drift by a rounding step.
    round(
      (
          p_agi  * (case when p_program in ('running', 'walking') then 1.5 else 1 end)
        + p_str  * (case when p_program = 'strength' then 1.5 else 1 end)
        + p_mind * (case when p_program = 'recovery' then 1.5 else 1 end)
        -- Retired columns, summed at weight 1 until Task 5 drops them. Nothing
        -- writes either any more; historical rows still hold values, and a
        -- board that stopped counting them would silently rewrite the past.
        + p_end  * 1
        + p_vit  * 1
      ) * p_factor
    )::integer
    + p_consistency
    + p_rec
  );
$$;

comment on function public.program_weighted_total(text, integer, integer, integer, integer, integer, integer, integer, numeric) is
  'Read-time squad-program weighting, with §2 normalization applied. Mirrors PROGRAM_WEIGHTS / weightedBoardTotal in packages/kairo-core/src/program.ts — change both, and the differential test in supabase/tests/schema.test.ts will tell you if you did not.';

-- Re-issued because the drop above took them. The REVOKE is the half that
-- does work: Supabase's default privileges grant ALL on every new function to
-- anon and authenticated, so without it anon can call this. The GRANT is belt
-- and braces against those defaults changing, and a schema test pins the pair.
revoke execute on function public.program_weighted_total(text, integer, integer, integer, integer, integer, integer, integer, numeric)
  from public, anon;
grant execute on function public.program_weighted_total(text, integer, integer, integer, integer, integer, integer, integer, numeric)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. squad_leaderboard passes the two new arguments
-- ---------------------------------------------------------------------------
--
-- `create or replace`, NOT drop-and-recreate: this signature and its returned
-- row are unchanged, so the grants survive and a schema test that pins the row
-- shape literally still passes. Recreated in full because a plpgsql body
-- cannot be patched in place — every line below is the 20260818120000 version
-- with two arguments added to one call. `ratings` still reads end_total and
-- vit_total; Task 5 owns those columns and changing them here would put a
-- projection change inside a scoring fix.
--
-- `coalesce(ds.normalization_factor, 1)` is belt and braces — the column is
-- NOT NULL DEFAULT 1.000 — but `ds` comes from a LEFT JOIN, so the row can be
-- absent entirely and every other column here is coalesced for exactly that
-- reason. A NULL factor would make the whole product NULL and the member would
-- vanish from a board they are a member of.
--
-- Privacy is unchanged: per-stat points, sleep included, are read INSIDE the
-- function to compute one weighted number and are never projected. There is
-- still no argument that returns raw steps, hourly movement or sleep minutes.

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
  ratings jsonb,
  contributing_stats smallint,
  has_rec boolean,
  flagged boolean,
  status public.day_status,
  current_streak integer,
  is_self boolean,
  program text,
  species text
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
      -- The lifetime rollups, shaped like `tiers` so the client reads one map
      -- per row either way. Raw points, not the rating: the curve lives in
      -- @kairo/core and must not be reimplemented in SQL, which is the same
      -- rule deviation #18 applies to goal arithmetic.
      jsonb_build_object(
        'AGI', p.agi_total,
        'STR', p.str_total,
        'END', p.end_total,
        'VIT', p.vit_total
      )                as pratings,
      p.species        as pspecies,
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
      md.uid, md.cname, md.pclass, md.plevel, md.pratings, md.pspecies, md.ldate,
      -- The ranking number. Weighted here, never stored.
      public.program_weighted_total(
        v_program,
        coalesce(ds.agi_points, 0),
        coalesce(ds.str_points, 0),
        coalesce(ds.mind_points, 0),
        coalesce(ds.end_points, 0),
        coalesce(ds.vit_points, 0),
        coalesce(ds.consistency_points, 0),
        coalesce(ds.rec_points, 0),
        coalesce(ds.normalization_factor, 1)
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
    s.dtotal, s.dtiers, s.pratings, s.dcontrib, s.drec, s.dflag, s.dstatus, s.streak,
    s.uid = v_user,
    v_program,
    s.pspecies
  from scored s
  order by s.dtotal desc, s.cname asc;
end;
$$;

comment on function public.squad_leaderboard(uuid, date, text, uuid) is
  'Scores, tiers and lifetime ability ratings only. total is weighted by the squad''s program at read time (deviation #11); tiers and ratings stay raw. ratings carries lifetime per-stat POINTS — the rating curve is ratingForStatPoints() in @kairo/core and is never reimplemented here. p_mode is current (each member''s today) or completed (each member''s own yesterday). p_as_user names the viewer for JWT-less callers (the notification cron) and is ignored when auth.uid() is set. No argument exposes raw steps or hourly movement. species is the player''s cosmetic character choice (deviation #40); NULL means never chosen.';

revoke all on function public.squad_leaderboard(uuid, date, text, uuid) from public, anon;
grant execute on function public.squad_leaderboard(uuid, date, text, uuid) to authenticated;

commit;

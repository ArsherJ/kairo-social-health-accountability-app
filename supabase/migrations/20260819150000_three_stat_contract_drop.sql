-- Three-stat model (roadmap deviation #41), contract phase — part two.
--
-- END, VIT and the REC bonus lose their columns. This is the contract half of
-- §4's expand/contract, and the last structural change before the deploy.
--
-- ===========================================================================
-- ORDERING: this file runs AFTER the history replay. Never before it.
-- ===========================================================================
--
-- `end_points`, `vit_points` and `rec_points` still hold real points on every
-- historical row, and `program_weighted_total` sums all three at weight 1
-- precisely so a board rendered today shows the same number it showed in July.
-- Drop them before the replay has rewritten those rows under the three-stat
-- model and the past is silently rewritten instead: a member who scored 900
-- END on a Tuesday in July loses 900 points from that day's board, with
-- nothing failing anywhere, and the columns holding the evidence gone.
--
-- The same ordering is what makes step 8 below possible at all. The
-- contributing_stats check has been NOT VALID since 20260819110000 because 32
-- of 75 live rows carried `contributing_stats = 4`; `validate constraint`
-- aborts against any of them. Only the replay can bring them to 3.
--
-- Task 7's runbook applies this file at step 8, after the replay at step 6 and
-- the verification at step 7 (`max(contributing_stats)` = 3, `count(*) filter
-- (where contributing_stats > 3)` = 0). It is the one-way door in that window:
-- everything before it is additive or replayable.
--
-- ---------------------------------------------------------------------------
--
-- The internal ordering matters for a second, smaller reason. Both function
-- bodies below name columns this file drops, and a plpgsql body is not parsed
-- until it runs — so a trigger left naming `end_points` fails on the NEXT
-- WRITE, not here. `sync-health` upserts a bucket before it upserts a score,
-- which is the shape of the August 2026 outage: health data keeps landing
-- while nothing scores. Rewrite the functions first, drop the columns second.

begin;

-- ---------------------------------------------------------------------------
-- 1. The rollup trigger's skip guard sheds two columns
-- ---------------------------------------------------------------------------
--
-- Body taken from 20260819130000 — which is UNAPPLIED, so the live definition
-- predates `mind_points` in this guard. Taking it from `pg_get_functiondef`
-- against the project would silently revert that, in a migration that compiles
-- cleanly. The guard must test every column the rollup reads and no column it
-- does not: too narrow and a same-tier rescore leaves a lifetime total stale,
-- too wide and it names something that no longer exists.

create or replace function public.daily_scores_xp_rollup()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_user_xp(old.user_id);
    return old;
  end if;

  -- Score rows are rewritten on every sync, so a cheap "did anything actually
  -- move" check is still worth keeping — it just has to name exactly the three
  -- stat columns the rollup now sums, plus xp_awarded.
  if tg_op = 'UPDATE'
     and new.xp_awarded = old.xp_awarded
     and new.agi_points = old.agi_points
     and new.str_points = old.str_points
     and new.mind_points = old.mind_points then
    return new;
  end if;

  perform public.recalculate_user_xp(new.user_id);
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. recalculate_user_xp stops maintaining end_total and vit_total
-- ---------------------------------------------------------------------------
--
-- Body from 20260819130000 for the same reason, with the two retired sums and
-- their two IS DISTINCT FROM clauses removed. Three stat rollups now, matching
-- CoreStat exactly.
--
-- Note what does NOT change: this is still a full recompute rather than an
-- increment, so replaying a day any number of times lands on the same number.

create or replace function public.recalculate_user_xp(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_xp     integer;
  v_agi    integer;
  v_str    integer;
  v_mnd    integer;
  v_level  integer;
begin
  select
    coalesce(sum(xp_awarded), 0),
    coalesce(sum(agi_points), 0),
    coalesce(sum(str_points), 0),
    coalesce(sum(mind_points), 0)
  into v_xp, v_agi, v_str, v_mnd
  from public.daily_scores
  where user_id = p_user_id;

  v_xp := v_xp + coalesce(
    (select sum(xp_awarded) from public.goal_completions where user_id = p_user_id),
    0
  );

  -- Contributes to total_xp only, like goal XP and for the same reason: a
  -- cleared challenge is not activity in a stat, and folding it into one would
  -- let it inflate an ability the user never trained.
  v_xp := v_xp + coalesce(
    (select sum(xp_awarded) from public.challenge_completions where user_id = p_user_id),
    0
  );

  v_level := floor(sqrt(v_xp::numeric / 25)) + 1;

  -- Still guarded by IS DISTINCT FROM across every column written, so a sync
  -- that moved nothing writes nothing and the profiles realtime channel stays
  -- quiet.
  update public.profiles
  set total_xp  = v_xp,
      level     = v_level,
      agi_total = v_agi,
      str_total = v_str,
      mnd_total = v_mnd
  where id = p_user_id
    and (total_xp  is distinct from v_xp
      or level     is distinct from v_level
      or agi_total is distinct from v_agi
      or str_total is distinct from v_str
      or mnd_total is distinct from v_mnd);
end;
$function$;

revoke execute on function public.recalculate_user_xp(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. program_weighted_total loses p_end and p_vit
-- ---------------------------------------------------------------------------
--
-- A signature change is a DROP, not a replace — and the drop is by the exact
-- argument list, because Postgres resolves overloads by signature. This was
-- proved by mutation one migration ago: deleting 20260819140000's `drop
-- function` left both overloads standing and every test in the suite passed
-- while `squad_leaderboard` went on calling the stale one. A surviving
-- nine-argument function here would be worse, because its body would name
-- columns that no longer exist and it would fail at call time rather than at
-- migration time.
--
-- `p_rec` stays, fed 0 by the only caller. `rec_points` is gone, but the term
-- is a universal bonus in both implementations — `weightedBoardTotal` in
-- packages/kairo-core/src/program.ts keeps `recBonus` for the same reason —
-- and the differential test compares the two expressions, so removing it on
-- one side only would be a divergence the test cannot see. Removing it from
-- both is another drop-and-recreate of this function and of
-- squad_leaderboard() on top of it, for a parameter that costs nothing and
-- that §5 can refill without a signature change.

drop function if exists public.program_weighted_total(
  text, integer, integer, integer, integer, integer, integer, integer, numeric
);

create or replace function public.program_weighted_total(
  p_program     text,
  p_agi         integer,
  p_str         integer,
  p_mind        integer,
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
      ) * p_factor
    )::integer
    + p_consistency
    + p_rec
  );
$$;

comment on function public.program_weighted_total(text, integer, integer, integer, integer, integer, numeric) is
  'Read-time squad-program weighting over the three stats, with §2 normalization applied. Mirrors PROGRAM_WEIGHTS / weightedBoardTotal in packages/kairo-core/src/program.ts — change both, and the differential test in supabase/tests/schema.test.ts will tell you if you did not. p_rec is a universal bonus with no column behind it since deviation #41 retired rec_points; its only caller passes 0.';

-- Re-issued because the drop above took them. The REVOKE is the half that
-- does work: Supabase's default privileges grant ALL on every new function to
-- anon and authenticated, so without it anon can call this. The GRANT is belt
-- and braces against those defaults changing, and a schema test pins the pair.
revoke execute on function public.program_weighted_total(text, integer, integer, integer, integer, integer, numeric)
  from public, anon;
grant execute on function public.program_weighted_total(text, integer, integer, integer, integer, integer, numeric)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. squad_leaderboard calls the seven-argument form, and projects MND
-- ---------------------------------------------------------------------------
--
-- `create or replace`, NOT drop-and-recreate: this signature and its returned
-- row are unchanged, so the grants survive and the schema test that pins the
-- row shape literally still passes. Recreated in full because a plpgsql body
-- cannot be patched in place — every line below is the 20260819140000 version
-- with two arguments removed from one call and the `ratings` object rebuilt.
--
-- **`ratings` is the fix that would otherwise be missed.** It has projected
-- `end_total` and `vit_total` since 20260810150000 and has never carried a
-- Mind figure, so `LeaderboardRow` — which filters the map by CORE_STATS —
-- reads `undefined` for MND on every squadmate and renders every Mind ability
-- at its floor. Dropping the two columns forces this line to change anyway;
-- leaving it at two stats would ship a board that cannot show a third of the
-- character.
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
      -- rule deviation #18 applies to goal arithmetic. Three keys, matching
      -- CoreStat — the client filters this map by CORE_STATS, so an END key
      -- was ignored and a missing MND key read as an unearned stat.
      jsonb_build_object(
        'AGI', p.agi_total,
        'STR', p.str_total,
        'MND', p.mnd_total
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
      -- The ranking number. Weighted here, never stored. The literal 0 is
      -- p_rec: deviation #41 retired rec_points and this file drops the
      -- column, so there is nothing left to read into it.
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
  'Scores, tiers and lifetime ability ratings only. total is weighted by the squad''s program at read time (deviation #11); tiers and ratings stay raw. ratings carries lifetime per-stat POINTS for AGI, STR and MND — the rating curve is ratingForStatPoints() in @kairo/core and is never reimplemented here. p_mode is current (each member''s today) or completed (each member''s own yesterday). p_as_user names the viewer for JWT-less callers (the notification cron) and is ignored when auth.uid() is set. No argument exposes raw steps or hourly movement. species is the player''s cosmetic character choice (deviation #40); NULL means never chosen.';

revoke all on function public.squad_leaderboard(uuid, date, text, uuid) from public, anon;
grant execute on function public.squad_leaderboard(uuid, date, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The columns
-- ---------------------------------------------------------------------------
--
-- One statement per table so each rewrite is atomic with the other drops in
-- the same ALTER. Nothing has written any of these since Phase 2's Edge
-- Function deploy, and 20260819110000 already marked all five deprecated in
-- their column comments — the comments go with the columns.
--
-- END's signal survives as STR's workout threshold shift; VIT's as AGI's
-- spread shift; REC's as the MND stat itself. Nothing is lost, but nothing is
-- recoverable from here either: this is the one-way door.

alter table public.daily_scores
  drop column end_points,
  drop column vit_points,
  drop column rec_points;

alter table public.profiles
  drop column end_total,
  drop column vit_total;

-- ---------------------------------------------------------------------------
-- 6. The deferred validation
-- ---------------------------------------------------------------------------
--
-- 20260819110000 added this constraint NOT VALID because 32 of 75 live rows
-- carried `contributing_stats = 4` and the scan would have aborted the
-- migration. Those rows have been rewritten by the replay by the time this
-- file runs, so the scan now has nothing to reject and the guarantee becomes
-- total rather than write-time only.
--
-- SHARE UPDATE EXCLUSIVE, so it does not block writers. **If this errors, a
-- row survived the replay unrescored** — find it before forcing anything, and
-- note that the columns dropped above were the evidence of what it held.

alter table public.daily_scores
  validate constraint daily_scores_contributing_stats_check;

-- ---------------------------------------------------------------------------
-- 7. What the remaining columns mean now that they are the whole model
-- ---------------------------------------------------------------------------

comment on column public.daily_scores.mind_points is
  'MND tier points (§5) — sleep, promoted to a stat by deviation #41. The last of the three; end_points, vit_points and rec_points were dropped in this migration.';

comment on column public.profiles.agi_total is
  'Lifetime sum of daily_scores.agi_points, maintained by recalculate_user_xp(). Read through ratingForStatPoints() in @kairo/core, which is never reimplemented in SQL. One of exactly three, matching CoreStat.';

comment on column public.profiles.str_total is
  'Lifetime sum of daily_scores.str_points. See agi_total.';

comment on column public.profiles.mnd_total is
  'Lifetime sum of daily_scores.mind_points. See agi_total. Spelled mnd_ to match the CoreStat id; the score column is mind_points and is deliberately not renamed.';

commit;

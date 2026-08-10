-- Lifetime per-stat points, rolled up on `profiles`.
--
-- Founder decision 2026-08-10, from hand-testing: "remove the gold, silver and
-- bronze hierarchy for the stats. More like a numeric stat that defines my
-- current abilities, just like my level."
--
-- **The tier engine is untouched.** `TIER_POINTS` (200/500/900), `tierFor()`,
-- the thresholds in §5/§6 and `daily_scores.tiers` all still score every day
-- exactly as specified — nothing about how points are earned changes, so the
-- spec needs no version bump and no scoring test moves. What changes is what the
-- user is *shown*: a medal describes one day, and "how strong is my character"
-- is a cumulative question. `daily_scores.tiers` stays written and stored; it
-- simply stops having a UI consumer, and the analytics still read it.
--
-- The rating curve itself lives in `packages/kairo-core/src/progression.ts`
-- (`ratingForStatPoints`), the same family and floor as `levelForXp`. This
-- migration only supplies its input.
--
-- **Why a rollup and not a read-time sum.** `sum(daily_scores.agi_points)` over
-- a lifetime is unbounded work on the screen the app opens on. `profiles
-- .total_xp` already solved exactly this, and the safety argument transfers
-- intact: `recalculate_user_xp` is a **full recompute, never an increment**, so
-- a re-sync, a retroactive Apple revision, a cron retry and a rescore all
-- converge rather than double-counting. Adding four more sums to a function
-- with that property costs nothing and inherits it.
--
-- No new trigger: `daily_scores_xp_rollup_trigger` already calls it on every
-- write to `daily_scores`. Its early return had to move, though — see below.

begin;

-- ---------------------------------------------------------------------------
-- The four columns
-- ---------------------------------------------------------------------------
--
-- Deliberately absent from the column-scoped client grants, like `total_xp` and
-- `level`: these are derived, and a client that could write them could mint an
-- ability rating it never earned.

alter table public.profiles
  add column agi_total integer not null default 0,
  add column str_total integer not null default 0,
  add column end_total integer not null default 0,
  add column vit_total integer not null default 0;

comment on column public.profiles.agi_total is
  'Lifetime sum of daily_scores.agi_points. A rollup, recomputed in full by recalculate_user_xp() — never incremented. Input to ratingForStatPoints() in @kairo/core.';
comment on column public.profiles.str_total is
  'Lifetime sum of daily_scores.str_points. See agi_total.';
comment on column public.profiles.end_total is
  'Lifetime sum of daily_scores.end_points. See agi_total.';
comment on column public.profiles.vit_total is
  'Lifetime sum of daily_scores.vit_points. See agi_total.';

-- ---------------------------------------------------------------------------
-- recalculate_user_xp gains four more sums
-- ---------------------------------------------------------------------------
--
-- One pass over `daily_scores` for all five numbers rather than five queries:
-- the XP sum was already scanning exactly these rows.
--
-- Goal XP still comes from its own table and still contributes only to
-- `total_xp` — a goal completion is not activity in a stat, and folding it into
-- one would let a long window inflate an ability the user never trained.

create or replace function public.recalculate_user_xp(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_xp     integer;
  v_agi    integer;
  v_str    integer;
  v_end    integer;
  v_vit    integer;
  v_level  integer;
begin
  select
    coalesce(sum(xp_awarded), 0),
    coalesce(sum(agi_points), 0),
    coalesce(sum(str_points), 0),
    coalesce(sum(end_points), 0),
    coalesce(sum(vit_points), 0)
  into v_xp, v_agi, v_str, v_end, v_vit
  from public.daily_scores
  where user_id = p_user_id;

  v_xp := v_xp + coalesce(
    (select sum(xp_awarded) from public.goal_completions where user_id = p_user_id),
    0
  );

  v_level := floor(sqrt(v_xp::numeric / 25)) + 1;

  -- Still guarded by IS DISTINCT FROM across every column, so a sync that moved
  -- nothing writes nothing and the profiles realtime channel stays quiet.
  update public.profiles
  set total_xp  = v_xp,
      level     = v_level,
      agi_total = v_agi,
      str_total = v_str,
      end_total = v_end,
      vit_total = v_vit
  where id = p_user_id
    and (total_xp  is distinct from v_xp
      or level     is distinct from v_level
      or agi_total is distinct from v_agi
      or str_total is distinct from v_str
      or end_total is distinct from v_end
      or vit_total is distinct from v_vit);
end;
$$;

revoke execute on function public.recalculate_user_xp(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The trigger's early return has to go
-- ---------------------------------------------------------------------------
--
-- `daily_scores_xp_rollup()` skipped the recompute when an UPDATE left
-- `xp_awarded` unchanged, on the reasoning that "only the XP column can move the
-- total". That stopped being true one statement ago: a rescore can shift
-- `agi_points` between tiers of equal XP — 200 → 500 points is Bronze → Silver,
-- which *does* change the XP, but a same-tier revision (5,200 steps → 8,000,
-- both Silver) moves the raw points and not the XP at all.
--
-- Left in place, the stat rollups would silently miss every such rescore, and
-- the drift would be invisible: no error, just an ability rating slowly falling
-- behind the days that earned it.

create or replace function public.daily_scores_xp_rollup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_user_xp(old.user_id);
    return old;
  end if;

  -- The skip now tests every column the rollup reads. Score rows are rewritten
  -- on every sync, so a cheap "did anything actually move" check is still worth
  -- keeping — it just has to be honest about what "anything" means.
  if tg_op = 'UPDATE'
     and new.xp_awarded = old.xp_awarded
     and new.agi_points = old.agi_points
     and new.str_points = old.str_points
     and new.end_points = old.end_points
     and new.vit_points = old.vit_points then
    return new;
  end if;

  perform public.recalculate_user_xp(new.user_id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
--
-- Every existing profile, in one statement rather than by firing the trigger
-- per row. `total_xp` is deliberately not touched here: it is already correct,
-- and rewriting it would be a chance to get it wrong.

update public.profiles p
set agi_total = coalesce(d.agi, 0),
    str_total = coalesce(d.str, 0),
    end_total = coalesce(d.end_, 0),
    vit_total = coalesce(d.vit, 0)
from (
  select
    user_id,
    sum(agi_points) as agi,
    sum(str_points) as str,
    sum(end_points) as end_,
    sum(vit_points) as vit
  from public.daily_scores
  group by user_id
) d
where d.user_id = p.id;

-- ---------------------------------------------------------------------------
-- squad_leaderboard returns ratings alongside tiers
-- ---------------------------------------------------------------------------
--
-- `create or replace`, not drop/recreate: the signature is unchanged and only
-- the RETURNS TABLE column list grows — which Postgres refuses to replace in
-- place. So this one does need the drop.
--
-- **Privacy (§5).** `ratings` is derived from per-stat points, the same class of
-- number `tiers` already exposed and one step further from the raw data than
-- `tiers` is — a rating is a lifetime aggregate, so it cannot be inverted to a
-- step count for any particular day. There is still no argument that returns raw
-- steps, hourly movement or timestamps. `tiers` is kept in the projection: it
-- costs nothing, and removing a column from a live RPC is a separate decision
-- from adding one.

drop function public.squad_leaderboard(uuid, date, text, uuid);

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
      md.uid, md.cname, md.pclass, md.plevel, md.pratings, md.ldate,
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
    s.dtotal, s.dtiers, s.pratings, s.dcontrib, s.drec, s.dflag, s.dstatus, s.streak,
    s.uid = v_user,
    v_program
  from scored s
  order by s.dtotal desc, s.cname asc;
end;
$$;

comment on function public.squad_leaderboard(uuid, date, text, uuid) is
  'Scores, tiers and lifetime ability ratings only. total is weighted by the squad''s program at read time (deviation #11); tiers and ratings stay raw. ratings carries lifetime per-stat POINTS — the rating curve is ratingForStatPoints() in @kairo/core and is never reimplemented here. p_mode is current (each member''s today) or completed (each member''s own yesterday). p_as_user names the viewer for JWT-less callers (the notification cron) and is ignored when auth.uid() is set. No argument exposes raw steps or hourly movement.';

revoke execute on function public.squad_leaderboard(uuid, date, text, uuid) from public, anon;
grant execute on function public.squad_leaderboard(uuid, date, text, uuid) to authenticated;

commit;

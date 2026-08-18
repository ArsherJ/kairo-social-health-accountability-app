-- Which animal the player's character is: profiles.species.
--
-- Founder decision 2026-08-18, design
-- `docs/superpowers/specs/2026-08-18-animal-character-system-design.md`,
-- roadmap deviation #40. Replaces the male/female body choice (#27). §6 files
-- character appearance under "Cosmetic / Flavor Only — No Stat Advantage" and
-- this is that, stored.
--
-- **A new column rather than a widened `character_body`.** Widening would save
-- a migration and cost two things worth more: the column name would lie about
-- what it holds, and the existing 'male'/'female' rows would have to either be
-- migrated to a species nobody chose or left as values the picker can no longer
-- produce. `character_body` is left dead in place instead — the same
-- disposition, and for the same reason, as `profiles.sex`.
--
-- **Nullable on purpose, twice over.** NULL means *never asked*, the true state
-- of every existing row — and the client keys the one-time picker off exactly
-- that null, so a `not null default` would not merely backfill an assertion
-- nobody made, it would silently skip the prompt for every existing user.

begin;

alter table public.profiles
  add column species text
    check (species in ('pilandok', 'tamaraw', 'carabao', 'eagle'));

comment on column public.profiles.species is
  'Which animal the player chose. NULL = never asked. Cosmetic only (§6) — never read by scoring.';

comment on column public.profiles.character_body is
  'DEAD as of 2026-08-18 (deviation #40). Superseded by profiles.species. Never written, read by no surface. Kept rather than dropped for the same reason profiles.sex is: dropping a column is not free, and a comment costs nothing.';

-- ---------------------------------------------------------------------------
-- 1. Rebuild the column-scoped client grants to include it
-- ---------------------------------------------------------------------------
--
-- The usual Postgres caveat, for the seventh time in this repo: a column-level
-- REVOKE against a table-level GRANT is silently a no-op. Revoke the table
-- grant, then re-grant exactly the allowed columns.
--
-- INSERT because onboarding sets it in the single profile INSERT on /name.
-- UPDATE because the choice is changeable from the profile screen — unlike
-- `character_body`, which held an UPDATE grant no screen ever used.
--
-- `character_body` stays in both lists. It is dead, not revoked: pruning it
-- here would be a second behaviour in a migration that is already rebuilding
-- the grants, and a client writing a column nothing reads is inert.
--
-- `has_wearable` stays out of both, as 20260807100000 established: capability
-- is observed by `sync-health`, never asserted by a client.

revoke insert on public.profiles from anon, authenticated;

grant insert (
  id,
  character_name,
  character_body,
  species,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  exclude_from_recap
) on public.profiles to authenticated;

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
  trains_strength
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Project species to squadmates
-- ---------------------------------------------------------------------------
--
-- `squad_leaderboard()` is the §5 privacy boundary: squadmates reach data only
-- through it, and it deliberately has no argument that returns raw steps or
-- hourly movement. **Species is safe to add and that is not self-evident, so:**
-- it is a cosmetic choice the player makes about their own avatar, carries no
-- health signal, and reveals nothing about behaviour — unlike a tier, which is
-- already projected, or heart rate, which is not and must not be.
--
-- Added LAST in the returns table so existing positional consumers are
-- unaffected. A `create or replace` cannot change a function's return type, so
-- this is a drop and recreate; the grant is re-issued below because dropping
-- the function drops it.
--
-- **The definition being extended is 20260810150000_stat_rollups.sql, not
-- 20260809120000_remove_sabotage.sql.** The latter is an older version that
-- predates `ratings jsonb`, and because it uses `create or replace` while the
-- current one uses `create function`, a grep for `create or replace function
-- public.squad_leaderboard` finds the stale one. Extending it would drop
-- `ratings` — which `LeaderboardRow` in src/features/squad/queries.ts reads to
-- render every ability number on the board.

drop function if exists public.squad_leaderboard(uuid, date, text, uuid);

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

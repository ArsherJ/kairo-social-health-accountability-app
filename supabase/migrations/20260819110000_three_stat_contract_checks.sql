-- Three-stat model (roadmap deviation #41), contract phase — part one.
--
-- The **checks only**. The columns themselves (`rec_points`, `end_points`,
-- `vit_points`, and `profiles.end_total` / `vit_total`) are dropped in Phase 3,
-- after the dual-writing functions are deployed. Spec §4's four-step
-- expand/contract exists because renaming a column out from under a deployed
-- Edge Function is the August 2026 outage in miniature: the bucket upsert
-- commits before the score upsert, so health data keeps landing while nothing
-- scores, silently.
--
-- What is here is everything that can tighten *ahead* of the drop without
-- breaking a deployed function, plus the two program changes deviation #41
-- forces, which cannot wait: `SQUAD_PROGRAMS` in kairo-core now declares
-- `recovery`, and `create_squad` would reject it.

begin;

-- ---------------------------------------------------------------------------
-- 1. Three stats, not five
-- ---------------------------------------------------------------------------
--
-- 20260819100000 widened both of these to admit the transitional five-stat
-- state (MND joined before END and VIT left). That window is closed.
-- Dropped by name: an auto-generated name here would make a later
-- `drop constraint if exists` silently no-op.

alter table public.daily_scores
  drop constraint if exists daily_scores_contributing_stats_check;

alter table public.daily_scores
  add constraint daily_scores_contributing_stats_check
    check (contributing_stats between 0 and 3);

alter table public.daily_scores
  drop constraint if exists daily_scores_featured_stat_check;

alter table public.daily_scores
  add constraint daily_scores_featured_stat_check
    check (featured_stat is null or featured_stat in ('AGI', 'STR', 'MND'));

comment on column public.daily_scores.end_points is
  'Retired with roadmap deviation #41. Nothing writes it; Phase 3 drops it. END''s signal survives as STR''s workout threshold shift.';

comment on column public.daily_scores.vit_points is
  'Retired with roadmap deviation #41. Nothing writes it; Phase 3 drops it. VIT''s signal survives as AGI''s spread threshold shift.';

comment on column public.daily_scores.rec_points is
  'Retired with roadmap deviation #41 — sleep is now the MND stat and pays into mind_points. Nothing writes it; Phase 3 drops it.';

-- ---------------------------------------------------------------------------
-- 2. The recovery program
-- ---------------------------------------------------------------------------
--
-- The first program a person can play without moving, which is exactly why
-- sleep had to become a stat before it could exist. Same three-surface shape
-- as 20260815100000's gym -> strength rename: the column check, the read-time
-- weighting, and create_squad's validation list.

alter table public.squads
  drop constraint if exists squads_program_check;

alter table public.squads
  add constraint squads_program_check
    check (program in ('all_around', 'running', 'strength', 'walking', 'recovery'));

comment on column public.squads.program is
  'The squad''s shared game. Boosts one stat at read time in squad_leaderboard(); stored scores are program-independent (deviation #11). Fixed at creation — no UPDATE grant. Mirrored as SquadProgram in packages/kairo-core/src/program.ts.';

-- ---------------------------------------------------------------------------
-- 3. The read-time weighting
-- ---------------------------------------------------------------------------
--
-- `create or replace` with an unchanged signature, so EXECUTE grants survive
-- and no revoke/grant is needed — contrast 20260809120000, which had to drop
-- and recreate because the parameter list changed.
--
-- Two changes, and one deliberate omission.
--
-- `walking` moves from p_vit to p_agi. VIT is retired as a stat, and its
-- hourly-movement signal now lowers AGI's bands instead (`spreadShift`), so a
-- walking board weighting p_vit would be weighting a column nothing writes.
-- Running and walking therefore boost the same stat and stay separate
-- programs: they are different games people mean different things by, and
-- collapsing them would be a product decision rather than a migration.
--
-- **`recovery` boosts nothing here, and that is knowingly incomplete.** MND's
-- points live in `mind_points`, and this function has no `p_mind` parameter —
-- adding one changes the parameter list, which means dropping and recreating
-- this function *and* `squad_leaderboard()` on top of it. That work belongs
-- with the column drops in Phase 3, where it ships as one reviewed unit with
-- the redeploy. Until then a recovery board ranks its members unweighted,
-- which is wrong in the same direction as `all_around` rather than in a way
-- that can corrupt a stored row: all weighting is read-time (deviation #11).
-- The differential test in supabase/tests/schema.test.ts pins the two sides on
-- everything both can express and names this gap where it passes MND as 0.

create or replace function public.program_weighted_total(
  p_program     text,
  p_agi         integer,
  p_str         integer,
  p_end         integer,
  p_vit         integer,
  p_consistency integer,
  p_rec         integer
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
    -- every stat available to you.
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
        p_agi * (case when p_program in ('running', 'walking') then 1.5 else 1 end)
      + p_str * (case when p_program = 'strength' then 1.5 else 1 end)
      -- Retired columns, summed at weight 1 until Phase 3 drops them. Nothing
      -- writes either any more; historical rows still hold values, and a board
      -- that stopped counting them would silently rewrite the past.
      + p_end * 1
      + p_vit * 1
    )::integer
    + p_consistency
    + p_rec
  );
$$;

comment on function public.program_weighted_total(text, integer, integer, integer, integer, integer, integer) is
  'Read-time squad-program weighting. Mirrors PROGRAM_WEIGHTS / weightedBoardTotal in packages/kairo-core/src/program.ts — change both, and the differential test in supabase/tests/schema.test.ts will tell you if you did not. The recovery program''s MND boost lands in Phase 3, with p_mind.';

-- ---------------------------------------------------------------------------
-- 4. create_squad's validation list
-- ---------------------------------------------------------------------------
--
-- `create or replace`: the signature is unchanged, so this replaces the one
-- overload rather than adding a second, and the grants survive. Recreated in
-- full because a plpgsql body cannot be patched in place — every line below is
-- the 20260815100000 version with one word added to the validation list.

create or replace function public.create_squad(
  p_name text,
  p_program text default 'all_around'
)
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

  -- Raise rather than fall back to 'all_around': a typo must not silently
  -- create a squad playing a different game than the founder chose.
  if p_program not in ('all_around', 'running', 'strength', 'walking', 'recovery') then
    raise exception 'unknown squad program: %', p_program using errcode = '22023';
  end if;

  select is_legendary into v_is_legendary
  from public.profiles where id = v_user;

  if not found then
    raise exception 'complete onboarding before creating a squad'
      using errcode = '42501';
  end if;

  insert into public.squads (name, invite_code, leader_id, max_members, program)
  values (
    btrim(p_name),
    public.generate_invite_code(),
    v_user,
    -- §7's capacity table. Mirrored in packages/kairo-core/src/squad.ts as
    -- FREE_SQUAD_MAX_MEMBERS / LEGENDARY_SQUAD_MAX_MEMBERS; change both.
    case when v_is_legendary then 15 else 6 end,
    p_program
  )
  returning * into v_squad;

  -- The squad_members trigger enforces the per-user squad cap here, so a free
  -- user who already belongs to a squad fails and the whole call rolls back.
  insert into public.squad_members (squad_id, user_id)
  values (v_squad.id, v_user);

  return v_squad;
end;
$$;

commit;

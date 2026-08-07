-- Squad programs (roadmap deviation #12, Phase 4 [SP]).
--
-- A squad carries the game it is playing: `all_around` (the untilted default),
-- `running`, `gym` or `walking`. The program boosts exactly one stat, and it
-- does so at READ time only — see 20260807100200_leaderboard_program_weighting.
-- Nothing here changes what `sync-health` stores.
--
-- **Fixed at creation for MVP.** There is deliberately no UPDATE path: a
-- program change mid-beta would silently re-rank every day already on the
-- board, and per-day program history is V1's problem. Delete-and-recreate is
-- the escape hatch. That is enforced by column-scoping the client's UPDATE
-- grant on `squads` — `squads_update_leader` is an RLS policy, and a policy
-- constrains rows, not columns.

begin;

alter table public.squads
  add column program text not null default 'all_around'
    check (program in ('all_around', 'running', 'gym', 'walking'));

comment on column public.squads.program is
  'The squad''s shared game. Boosts one stat at read time in squad_leaderboard(); stored scores are program-independent (deviation #11). Fixed at creation — no UPDATE grant. Mirrored as SquadProgram in packages/kairo-core/src/program.ts.';

-- Column-scope the leader's UPDATE. `name` is the only thing a leader may
-- change: invite_code is generated, leader_id moves only through the
-- account-deletion succession path, max_members is derived from Legendary
-- status, and program is fixed at creation.
revoke update on public.squads from anon, authenticated;
grant update (name) on public.squads to authenticated;

-- ---------------------------------------------------------------------------
-- create_squad gains p_program
-- ---------------------------------------------------------------------------
--
-- Dropped and recreated, not `create or replace`. Adding a defaulted parameter
-- creates a SECOND overload rather than replacing the first, and two squad
-- constructors is exactly how the capacity rule drifts apart. Dropping resets
-- EXECUTE to Postgres's default of PUBLIC, so the revoke/grant at the bottom is
-- load-bearing rather than tidiness.

drop function if exists public.create_squad(text);

create function public.create_squad(
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
  if p_program not in ('all_around', 'running', 'gym', 'walking') then
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

-- ---------------------------------------------------------------------------
-- preview_squad — what an invite code points at, before you commit to it
-- ---------------------------------------------------------------------------
--
-- The program is a game rule, so consenting to it is part of joining. But
-- `squads_select_member` means a non-member cannot read the row they are about
-- to join, so the join screen has nothing to show. This is the narrow, chosen
-- exception: holding a valid 6-character code is the authorisation, and the
-- projection carries no member identities, no scores and no invite code.
--
-- Returns nothing for an unknown code rather than raising, so the caller can
-- distinguish "no such squad" from a genuine failure.

create function public.preview_squad(p_invite_code text)
returns table (
  name text,
  program text,
  member_count integer,
  max_members smallint,
  is_full boolean,
  already_member boolean
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

  return query
  select
    s.name,
    s.program,
    (select count(*)::integer from public.squad_members m where m.squad_id = s.id),
    s.max_members,
    (select count(*) from public.squad_members m where m.squad_id = s.id)
      >= s.max_members,
    exists (
      select 1 from public.squad_members m
      where m.squad_id = s.id and m.user_id = v_user
    )
  from public.squads s
  where s.invite_code = upper(btrim(p_invite_code));
end;
$$;

comment on function public.preview_squad(text) is
  'What a valid invite code points at: squad name, program and capacity. No member identities, no scores, no invite code echoed back. Holding the code is the authorisation.';

-- ---------------------------------------------------------------------------
-- Execute grants. Mandatory after a drop — see the header.
-- ---------------------------------------------------------------------------

revoke execute on function public.create_squad(text, text) from public, anon;
grant  execute on function public.create_squad(text, text) to authenticated;

revoke execute on function public.preview_squad(text) from public, anon;
grant  execute on function public.preview_squad(text) to authenticated;

commit;

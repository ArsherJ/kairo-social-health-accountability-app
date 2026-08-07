-- Leaving a squad, and closing the exit that skipped succession.
--
-- Free users cap at one squad (20260727120000_init_core.sql:212), so a wrong
-- join was permanent — a support request nobody can action once the beta
-- recruits into stranger squads (§15).
--
-- The defect this also closes: `squad_members_delete_self`
-- (20260727120400_rls.sql:145) granted `authenticated` a raw DELETE on their
-- own membership row, with nothing running succession on that path. A squad
-- LEADER could leave from any client and leave `squads.leader_id` pointing at
-- someone who is no longer a member — the column is `not null` and FKs to
-- `profiles`, so the row stays valid and nothing raises. Adding leave_squad()
-- beside that policy would leave two exits, one of which skips succession, so
-- the policy is dropped here and the RPC becomes the only way out.

begin;

-- ---------------------------------------------------------------------------
-- Succession, extracted so there is exactly one rule
-- ---------------------------------------------------------------------------

-- Lifted verbatim out of handle_profile_deletion (20260728160000). Account
-- deletion and leaving are two callers of one function rather than two copies
-- that agree today: §7's inheritance rule drifting apart between them is
-- precisely the class of thing the deviations table exists to catch.
create or replace function public.succeed_squad_leadership(
  p_squad_id uuid,
  p_leaving  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_successor uuid;
begin
  -- Longest-tenured remaining member inherits, matching the manual transfer
  -- the leader could have performed themselves (§7).
  --
  -- The join to profiles is load-bearing. A bulk purge — `delete from
  -- auth.users` — removes several profiles in one statement, and their
  -- squad_members rows are not all gone by the time the deletion trigger runs
  -- for a given profile. Without the join, succession can name a member whose
  -- profile has already been deleted, and the FK rejects it.
  select sm.user_id into v_successor
  from public.squad_members sm
  join public.profiles p on p.id = sm.user_id
  where sm.squad_id = p_squad_id and sm.user_id <> p_leaving
  order by sm.joined_at asc
  limit 1;

  if v_successor is null then
    -- Last one out. Deleting the squad is correct: an empty squad has no
    -- leaderboard and nobody to inherit it. The squads_handle_deletion trigger
    -- sets kairo.allow_purge, which is what lets the cascade reach the
    -- append-only sabotage_events.
    delete from public.squads where id = p_squad_id;
  else
    update public.squads set leader_id = v_successor where id = p_squad_id;
  end if;
end;
$$;

-- Called only by other definer functions.
revoke execute on function public.succeed_squad_leadership(uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- handle_profile_deletion now delegates. Behaviour is unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.handle_profile_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_squad record;
begin
  -- Permits the sabotage_events cascade below. Transaction-local, so it does
  -- not leak into any other statement.
  perform set_config('kairo.allow_purge', 'on', true);

  for v_squad in
    select id from public.squads where leader_id = old.id
  loop
    -- Runs before the FK cascade, so leadership is reassigned while the
    -- squad's other members still exist. `old.id` is passed as the exclusion
    -- because this row is still present at this point.
    perform public.succeed_squad_leadership(v_squad.id, old.id);
  end loop;

  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- leave_squad
-- ---------------------------------------------------------------------------

create or replace function public.leave_squad(p_squad_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_leader uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Same message and SQLSTATE as squad_leaderboard, so the client's existing
  -- error mapping needs no new case.
  if not exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and user_id = v_user
  ) then
    raise exception 'not a member of this squad' using errcode = '42501';
  end if;

  select leader_id into v_leader from public.squads where id = p_squad_id;

  -- Delete first, then succeed. Succession picks from the remaining members,
  -- and with the leaver's row still present they could inherit their own
  -- squad. Passing v_user as the exclusion makes the order safe either way —
  -- which is the point of sharing one function with the deletion trigger.
  delete from public.squad_members
  where squad_id = p_squad_id and user_id = v_user;

  if v_leader = v_user then
    perform public.succeed_squad_leadership(p_squad_id, v_user);
  end if;
end;
$$;

revoke execute on function public.leave_squad(uuid) from public, anon;
grant execute on function public.leave_squad(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Close the raw-delete path
-- ---------------------------------------------------------------------------

drop policy if exists squad_members_delete_self on public.squad_members;
revoke delete on public.squad_members from anon, authenticated;

-- With `revoke insert, update` already in place (20260727120400_rls.sql:149),
-- the client now holds no write grant on squad_members at all: membership
-- changes exclusively through create_squad, join_squad and leave_squad. That
-- is the same server-authoritative posture the rest of the schema holds.

commit;

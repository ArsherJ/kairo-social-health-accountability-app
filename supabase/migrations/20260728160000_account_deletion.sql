-- Make account and squad deletion possible.
--
-- Two defects, both found by actually deleting a test account rather than by
-- reading the schema:
--
-- 1. The append-only trigger on sabotage_events rejected DELETE unconditionally,
--    including the cascade fired by removing a user. Combined with the FK from
--    sabotage_events to profiles, that made every account undeletable.
--
-- 2. squads.leader_id was ON DELETE RESTRICT, so a squad leader could never be
--    removed at all, cascade or not.
--
-- Together they made right-to-erasure impossible. The spec is explicit about
-- Data Privacy Act exposure (§5), and a beta with real Filipino users needs a
-- working delete path before it ships, not after someone asks for one.
--
-- The audit guarantee is kept: the log still cannot be rewritten, and a casual
-- DELETE still fails. Erasure becomes an explicit act, gated on a transaction-
-- local flag that only the deletion triggers set.

-- ---------------------------------------------------------------------------
-- Append-only, with a deliberate escape hatch for erasure
-- ---------------------------------------------------------------------------

create or replace function public.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- UPDATE is never allowed. Rewriting history is the thing this protects
  -- against, and no legitimate flow needs it.
  if tg_op = 'DELETE'
     and coalesce(current_setting('kairo.allow_purge', true), 'off') = 'on' then
    return old;
  end if;

  raise exception
    'relation %.% is append-only (set kairo.allow_purge to erase a subject''s data)',
    tg_table_schema, tg_table_name
    using errcode = '0A000';
end;
$$;

-- ---------------------------------------------------------------------------
-- Leadership succession
-- ---------------------------------------------------------------------------

alter table public.squads
  drop constraint if exists squads_leader_id_fkey;

alter table public.squads
  add constraint squads_leader_id_fkey
  foreign key (leader_id) references public.profiles (id) on delete cascade;

-- Runs before the FK cascade, so leadership is reassigned while the squad's
-- other members still exist.
create or replace function public.handle_profile_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_squad record;
  v_successor uuid;
begin
  -- Permits the sabotage_events cascade below. Transaction-local, so it does
  -- not leak into any other statement.
  perform set_config('kairo.allow_purge', 'on', true);

  for v_squad in
    select id from public.squads where leader_id = old.id
  loop
    -- Longest-tenured remaining member inherits, matching the manual transfer
    -- the leader could have performed themselves (§7).
    --
    -- The join to profiles is load-bearing. A bulk purge — `delete from
    -- auth.users` — removes several profiles in one statement, and their
    -- squad_members rows are not all gone by the time this trigger runs for a
    -- given profile. Without the join, succession can name a member whose
    -- profile has already been deleted, and the FK rejects it.
    select sm.user_id into v_successor
    from public.squad_members sm
    join public.profiles p on p.id = sm.user_id
    where sm.squad_id = v_squad.id and sm.user_id <> old.id
    order by sm.joined_at asc
    limit 1;

    if v_successor is null then
      -- Last one out. Deleting the squad is correct: an empty squad has no
      -- leaderboard and nobody to inherit it.
      delete from public.squads where id = v_squad.id;
    else
      update public.squads set leader_id = v_successor where id = v_squad.id;
    end if;
  end loop;

  return old;
end;
$$;

drop trigger if exists profiles_handle_deletion on public.profiles;
create trigger profiles_handle_deletion
before delete on public.profiles
for each row execute function public.handle_profile_deletion();

-- Deleting a squad cascades into its sabotage events, which needs the same
-- permission.
create or replace function public.handle_squad_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('kairo.allow_purge', 'on', true);
  return old;
end;
$$;

drop trigger if exists squads_handle_deletion on public.squads;
create trigger squads_handle_deletion
before delete on public.squads
for each row execute function public.handle_squad_deletion();

revoke execute on function public.handle_profile_deletion() from public, anon, authenticated;
revoke execute on function public.handle_squad_deletion() from public, anon, authenticated;

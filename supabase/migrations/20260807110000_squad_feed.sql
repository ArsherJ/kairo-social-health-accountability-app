-- squad_feed() — the read projection behind §8's "visible in squad feed".
--
-- `sabotage_events_select_involved` (20260727120400_rls.sql:177) returns only
-- rows where the caller is the actor or the target, so a squad-wide feed is
-- impossible through PostgREST today. Hits between two OTHER squadmates are
-- the drama that makes sabotage social rather than a private grudge, and they
-- are exactly what that policy hides.
--
-- Modelled on squad_leaderboard: the privacy rule is a projection, not a
-- convention. This returns names and the item, and there is no argument that
-- widens it to scores, per-stat points, the outcome jsonb, the local dates, or
-- anything from health_buckets. The score effect is not projected because the
-- client already knows it — the Banana is a fixed BANANA_SCORE_DELTA in
-- kairo-core.

begin;

create or replace function public.squad_feed(
  p_squad_id uuid,
  p_limit int default 50
)
returns table (
  id uuid,
  actor_id uuid,
  actor_name text,
  target_id uuid,
  target_name text,
  item text,
  created_at timestamptz,
  actor_is_self boolean,
  target_is_self boolean
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

  if not exists (
    select 1 from public.squad_members
    where squad_id = p_squad_id and squad_members.user_id = v_user
  ) then
    raise exception 'not a member of this squad' using errcode = '42501';
  end if;

  return query
  select
    se.id,
    se.actor_id,
    a.character_name,
    se.target_id,
    t.character_name,
    se.item::text,
    se.created_at,
    se.actor_id = v_user,
    se.target_id = v_user
  from public.sabotage_events se
  join public.profiles a on a.id = se.actor_id
  join public.profiles t on t.id = se.target_id
  where se.squad_id = p_squad_id
  order by se.created_at desc
  -- A client-supplied bound on a SECURITY DEFINER function is an input, not a
  -- promise: clamp it here rather than letting a caller ask for the whole log.
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

comment on function public.squad_feed(uuid, int) is
  'Names and item only. There is no argument that exposes scores, stat points, outcome or health data.';

-- Postgres grants EXECUTE to PUBLIC by default, which on a SECURITY DEFINER
-- function would hand this projection to every role.
revoke execute on function public.squad_feed(uuid, int) from public, anon;
grant execute on function public.squad_feed(uuid, int) to authenticated;

commit;

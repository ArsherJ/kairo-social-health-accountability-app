-- The two server-side pieces the notification engine was missing (§14).
--
-- `device_tokens` and `notification_log` already exist, from
-- 20260727120300_progression_and_infra.sql, with the RLS this needs: the client
-- owns its own push registration, and no client role can write a send. So this
-- migration adds no tables. What it adds is the hour selection the dispatcher
-- runs on, and the one registration path RLS cannot express.

begin;

-- ---------------------------------------------------------------------------
-- users_at_local_hour — candidate selection for dispatch-notifications
-- ---------------------------------------------------------------------------

-- NOT finalizable_days(). That function selects days whose local midnight
-- passed more than two hours ago (§12's grace window), which would fire "Day
-- ends" at 02:00 local: two hours late, with §14's own "finalizes in ~2h" copy
-- already false, and deep inside quiet hours. It has no notion of 23:00 local
-- at all. The question here is a different and simpler one — *which users are
-- at local hour H right now* — so there is no duplication to avoid.
--
-- `p_now` defaults to now() so the cron passes only the hour, but exists so the
-- behaviour is testable at a fixed instant rather than at whatever hour the
-- test suite happens to run.
create or replace function public.users_at_local_hour(
  p_hour integer,
  p_now timestamptz default now()
)
returns table (
  user_id uuid,
  local_date date,
  timezone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    -- The date the user is LIVING in. At 16:05 UTC a Manila player has already
    -- rolled over and a New York player has not; keying a notification by the
    -- UTC date would address the wrong day for one of them.
    (p_now at time zone p.timezone)::date,
    p.timezone
  from public.profiles p
  where extract(hour from (p_now at time zone p.timezone))::int = p_hour
  order by p.id;
$$;

comment on function public.users_at_local_hour(integer, timestamptz) is
  'Users whose own local clock currently reads p_hour, with the local date they are living in.';

-- Cron only, like finalizable_days(). A client asking "who is at midnight right
-- now" is enumerating the user base by timezone.
revoke execute on function public.users_at_local_hour(integer, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- register_device_token — the one write RLS cannot express
-- ---------------------------------------------------------------------------

-- A push token is per-device and globally unique, and `device_tokens.token` is
-- the primary key precisely so a device that changes hands re-points rather
-- than accumulating a second row that sends one person's sabotage alerts to
-- another person's phone.
--
-- But the client cannot perform that re-point itself. An `on conflict (token)
-- do update` would need to pass `device_tokens_update_own`, whose USING clause
-- tests the EXISTING row — which still belongs to the previous owner. So the
-- upsert fails for exactly the case the primary key was chosen to handle.
--
-- Hence a definer function. Possession of a token is possession of the device:
-- APNs only ever hands a token to the device it addresses, so a caller
-- presenting one is the party that should receive its notifications.
create or replace function public.register_device_token(
  p_token text,
  p_platform text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_token is null or char_length(p_token) = 0 then
    raise exception 'a device token is required' using errcode = '22023';
  end if;

  -- Mirrored from the table CHECK so the caller gets a readable message rather
  -- than a constraint name.
  if p_platform not in ('ios', 'android') then
    raise exception 'unsupported platform: %', p_platform using errcode = '22023';
  end if;

  insert into public.device_tokens (token, user_id, platform)
  values (p_token, v_user, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = now();
end;
$$;

comment on function public.register_device_token(text, text) is
  'Claims a push token for the calling user, moving it off any previous owner.';

revoke execute on function public.register_device_token(text, text) from public, anon;
grant execute on function public.register_device_token(text, text) to authenticated;

commit;

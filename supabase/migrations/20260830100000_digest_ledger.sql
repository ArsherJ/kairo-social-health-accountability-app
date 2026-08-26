-- One digest per user per local day, capped in the database (deviation #52).
--
-- **A client-side cap is not a cap** — it is a race between devices, and the
-- same account on a phone and a tablet would get two. The rule lives in two
-- places here and both are load-bearing:
--
--   1. A PARTIAL UNIQUE INDEX, so a second insert fails even if the selection
--      query is wrong. This is the guarantee.
--   2. An exclusion inside users_needing_digest(), so the ordinary path never
--      attempts the second send at all. This is the behaviour.
--
-- notification_log already IS the ledger spec §4.2 asks for: it records
-- (user_id, kind, local_date) for every successful send. A second table would
-- be a second thing to keep in step with it.

begin;

create unique index notification_log_one_digest_per_day
  on public.notification_log (user_id, local_date)
  where kind = 'daily_digest';

comment on index public.notification_log_one_digest_per_day is
  'Deviation #52: at most one daily_digest per recipient per local date. Partial, so every other kind stays free to repeat — those are bounded by MAX_NOTIFICATIONS_PER_DAY in kairo-core, and moving that rule here would take it out of the module that owns it and tests it.';

-- ---------------------------------------------------------------------------
-- users_needing_digest
-- ---------------------------------------------------------------------------
--
-- Replaces the three-hour users_at_local_hour() sweep for the scheduled push.
-- The timezone arithmetic stays in SQL, next to the data, and the already-sent
-- exclusion joins it — one query, so there is no window between deciding and
-- checking.
--
-- users_at_local_hour() is NOT dropped: replay-scores and any future scheduled
-- push still want it, and dropping a general helper because one caller stopped
-- using it is how the next feature ends up reimplementing it.

create function public.users_needing_digest(p_hour integer)
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
    -- The date the user is LIVING in. At 00:05 UTC a Manila player has already
    -- rolled over and a New York player has not; keying the ledger by the UTC
    -- date would cap the wrong day for one of them.
    (now() at time zone p.timezone)::date,
    p.timezone
  from public.profiles p
  where extract(hour from (now() at time zone p.timezone))::int = p_hour
    and not exists (
      select 1 from public.notification_log n
      where n.user_id = p.id
        and n.kind = 'daily_digest'
        and n.local_date = (now() at time zone p.timezone)::date
    )
  order by p.id;
$$;

comment on function public.users_needing_digest(integer) is
  'Recipients living at local hour p_hour who have not already had today''s digest. The exclusion is the cap (deviation #52) and notification_log_one_digest_per_day is its backstop. Cron-only: EXECUTE is revoked from anon and authenticated, because it enumerates every user.';

-- Creating a function grants EXECUTE to PUBLIC by default. This enumerates
-- every user in the system, so it must never be reachable from a client
-- session — the same posture kairo_retention() and users_at_local_hour() take.
revoke all on function public.users_needing_digest(integer) from public;
revoke all on function public.users_needing_digest(integer) from anon, authenticated;

commit;

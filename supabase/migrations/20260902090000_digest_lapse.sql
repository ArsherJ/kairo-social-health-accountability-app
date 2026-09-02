-- The digest stops for a lapsed account, and resumes by itself (deviation #60).
--
-- **This is one half of a two-part change and the halves correct each other.**
-- The other half opened the notification ask to solo players: it now fires on
-- the account's own first scored day, not only on a squad or a live Battle
-- (`src/features/notifications/ask-policy.ts`). Until then no solo player held
-- a push token, so the digest — whose solo branch in `notification-copy.ts` was
-- written with care — could not reach anybody it was written for.
--
-- Shipping the ask without this suppression is strictly worse than shipping
-- neither: deviation #52 reduced three pushes a day to one on the argument that
-- volume is not urgency, and one push a day to somebody who has left is thirty
-- a month, which is how a channel gets switched off permanently.
--
-- **Replaced in place, not dropped and recreated.** The signature does not
-- move, so `dispatch-notifications` — which calls this by name — needs no
-- redeploy. Ordering: apply this before the client ships, and nothing changes
-- for anybody until the client follows.

begin;

create or replace function public.users_needing_digest(p_hour integer)
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
    -- The cap (deviation #52). notification_log_one_digest_per_day is its
    -- backstop; this is the behaviour.
    and not exists (
      select 1 from public.notification_log n
      where n.user_id = p.id
        and n.kind = 'daily_digest'
        and n.local_date = (now() at time zone p.timezone)::date
    )
    -- Lapse (deviation #60): no scored day in seven local days ends the digest,
    -- silently, and the next scored day resumes it with nothing to reset.
    --
    -- The window is exactly seven local days ending today, so `> today - 7`
    -- and not `>= `: a day scored six days ago qualifies, seven and eight do
    -- not. The 7 is a commented literal on purpose — SQL cannot import from
    -- `@kairo/core`, and a mirrored TypeScript constant would have no reader,
    -- because no client ever asks whether it is suppressed. That is deliberately
    -- unlike DAILY_STEP_BASELINE, which is derived precisely because two places
    -- read it.
    --
    -- **An account that has never scored is suppressed, and that is correct
    -- rather than a bug that eats somebody's first digest.** The notification
    -- ask now fires on the first scored day, so such an account holds no push
    -- token anyway; the two rules meet at the same boundary from opposite
    -- sides. Do not add a young-account exemption — a redundant second rule is
    -- how two rules later disagree.
    --
    -- `total > 0` is the same reading of "scored" every other surface uses.
    -- `sync-health` writes a `daily_scores` row for every date in the payload
    -- whether or not it scored, so a bare row count would call every synced
    -- account active forever.
    --
    -- A *quiet week* is not a lapse and must never be read as one: a player who
    -- is here and scoring little scores, so they pass this predicate every day.
    -- See CONTEXT.md, where the two terms are defined against each other.
    and exists (
      select 1 from public.daily_scores s
      where s.user_id = p.id
        and s.total > 0
        and s.local_date > (now() at time zone p.timezone)::date - 7
    )
  order by p.id;
$$;

comment on function public.users_needing_digest(integer) is
  'Recipients living at local hour p_hour who have not already had today''s digest and are not lapsed. Two exclusions: the already-sent one is the cap (deviation #52, backed by notification_log_one_digest_per_day), and the seven-local-day activity window is lapse (deviation #60) — an account with no scored day in that window receives nothing, including one that has never scored, because the notification ask fires on the first scored day and such an account holds no token. Suppression is not recorded anywhere: it is derivable from scores, and kairo_retention() is where that question belongs. Cron-only: EXECUTE is revoked from anon and authenticated, because it enumerates every user.';

-- `create or replace` preserves the existing ACL, so these are belt and braces
-- rather than a fix — but a function that enumerates every user in the system
-- should never depend on a previous migration's revoke still being in force.
revoke all on function public.users_needing_digest(integer) from public;
revoke all on function public.users_needing_digest(integer) from anon, authenticated;

commit;

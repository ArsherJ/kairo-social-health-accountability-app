-- Live leaderboard via Realtime Broadcast from a Postgres trigger.
--
-- Broadcast is used rather than postgres_changes because the leaderboard is a
-- squad-scoped fan-out: one score change must reach up to 15 people, and
-- postgres_changes would require every client to hold a subscription whose RLS
-- is re-evaluated per row per subscriber. Broadcasting to a `squad:<id>` topic
-- sends one message per squad and keeps daily_scores rows unexposed.

create or replace function public.broadcast_score_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_squad_id uuid;
begin
  -- A user may belong to up to 3 squads (Legendary), so one score change can
  -- legitimately fan out to several topics.
  for v_squad_id in
    select squad_id from public.squad_members where user_id = new.user_id
  loop
    perform realtime.broadcast_changes(
      'squad:' || v_squad_id::text,  -- topic
      tg_op,                         -- event
      tg_op,                         -- operation
      tg_table_name,                 -- table
      tg_table_schema,               -- schema
      new,                           -- new record
      old                            -- old record
    );
  end loop;

  return null;
end;
$$;

create trigger daily_scores_broadcast
after insert or update on public.daily_scores
for each row execute function public.broadcast_score_change();

-- ---------------------------------------------------------------------------
-- Broadcast authorization
-- ---------------------------------------------------------------------------

-- Private channels are gated by RLS on realtime.messages. Without this policy
-- a client subscribing with `private: true` receives nothing; without the
-- membership check, any authenticated user could subscribe to any squad's
-- topic and watch strangers' scores.
create policy squad_members_receive_squad_broadcasts
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) like 'squad:%'
  and public.is_squad_member(
    replace((select realtime.topic()), 'squad:', '')::uuid
  )
);

-- Clients only listen. Every message on these topics originates from the
-- trigger above, running as the definer, so no client-side send is permitted.

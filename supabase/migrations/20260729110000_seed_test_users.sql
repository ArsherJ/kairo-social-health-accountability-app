-- Allowlist for seed-health, the development-only data generator.
--
-- A table rather than a naming convention because a convention depends on
-- nobody ever registering a matching address, whereas a row is a fact. This is
-- what makes a leaked SEED_SECRET survivable: seed-health refuses to write for
-- any user absent from this table, so it cannot reach a real player's scores.
--
-- Empty in production. seed-health is never deployed there.

begin;

create table public.seed_test_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  created_at timestamptz not null default now()
);

comment on table public.seed_test_users is
  'Development-only allowlist for seed-health. Service role only; no client has any reason to read or write it.';

-- RLS with zero policies denies everything; service_role bypasses RLS. The
-- revoke below is the belt to that pair of braces.
alter table public.seed_test_users enable row level security;

revoke all on public.seed_test_users from anon, authenticated;

commit;

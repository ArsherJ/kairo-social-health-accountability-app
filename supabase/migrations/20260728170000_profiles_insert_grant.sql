-- Column-scope the client's INSERT on profiles.
--
-- profiles_insert_own checks `id = auth.uid()`, but an RLS policy constrains
-- ROWS, not columns. INSERT is granted table-wide — Supabase's default
-- privilege for every new table — so a client could create its own profile
-- carrying level, total_xp and is_legendary set to anything. is_legendary is
-- the paid-subscription flag and nothing recomputes it.
--
-- This is the same hole 20260727120400_rls.sql closed for UPDATE. INSERT was
-- missed because nothing inserted a profile until onboarding shipped.
--
-- The same Postgres caveat applies: a column-level REVOKE against a
-- table-level GRANT is silently a no-op, because the table grant already
-- covers every column and you cannot subtract from it. Revoke the table grant
-- first, then re-grant the allowed columns.

begin;

revoke insert on public.profiles from anon, authenticated;

grant insert (
  id,
  character_name,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  has_wearable,
  exclude_from_recap
) on public.profiles to authenticated;

commit;

-- Which character the player is: profiles.character_body.
--
-- Founder decision 2026-08-11. Onboarding asks it before the name; §6 files
-- character appearance under "Cosmetic / Flavor Only — No Stat Advantage" and
-- this is that, stored.
--
-- **Why not profiles.sex.** `sex` already exists, is already in these grants,
-- and would need no migration at all. It is still the wrong column. Its
-- documented purpose (20260727120000_init_core.sql:58) is improving HealthKit's
-- active-calorie estimate — a reader nothing implements, and unlikely to arrive
-- since Kairo consumes Apple's activeEnergyBurned rather than computing one.
-- But "currently dead" is not "free to repurpose": a physiological field and an
-- avatar choice can have different answers for the same person, and merging
-- them is exactly what 20260810140000 dropped `focus` for. `sex` is left as it
-- is — dead, and not made worse. It also keeps 'other', which this does not.
--
-- **Nullable on purpose.** NULL means *never asked*, which is the true state of
-- every row that predates this column. A `not null default 'male'` would
-- backfill an assertion nobody made. Both render the male anchor, so there is
-- no visible difference — the difference is whether the row claims a choice.
-- New users always have a value: the onboarding screen has no skip.

begin;

alter table public.profiles
  add column character_body text
    check (character_body in ('male', 'female'));

comment on column public.profiles.character_body is
  'Which character art the player chose at onboarding. NULL = never asked. Cosmetic only (§6) — never read by scoring.';

-- ---------------------------------------------------------------------------
-- Rebuild the column-scoped client grants to include it
-- ---------------------------------------------------------------------------
--
-- The usual Postgres caveat, for the sixth time in this repo: a column-level
-- REVOKE against a table-level GRANT is silently a no-op. Revoke the table
-- grant, then re-grant exactly the allowed columns.
--
-- INSERT because onboarding sets it at profile creation. UPDATE because it
-- should be changeable later — no UI ships with this migration, but the
-- alternative is a second migration for a one-word change.
--
-- `has_wearable` stays out of both lists, as 20260807100000 established:
-- capability is observed by `sync-health`, never asserted by a client.

revoke insert on public.profiles from anon, authenticated;

grant insert (
  id,
  character_name,
  character_body,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  exclude_from_recap
) on public.profiles to authenticated;

revoke update on public.profiles from anon, authenticated;

grant update (
  character_name,
  character_body,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  exclude_from_recap
) on public.profiles to authenticated;

commit;

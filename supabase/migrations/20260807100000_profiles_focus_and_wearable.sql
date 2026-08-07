-- Personal focus (roadmap Phase 1 [SP]) and has_wearable becoming
-- server-observed (Phase 3 [SP]).
--
-- Both are edits to the same column-scoped grants on `profiles`, so they land
-- in one migration rather than two revoke/re-grant passes over the same table.
--
-- `focus` is what the user says they are here to do, asked once in onboarding
-- and skippable. It is **presentation only** — nothing in scoring reads it, and
-- it never gates squad membership. The squad's `program` is the game rule.
-- Null is a normal value: skipped, or onboarded before this shipped.
--
-- `has_wearable` moves the other way. It is now written by `sync-health` on the
-- first payload carrying sleep data (sticky — never set back to false
-- automatically), which contradicts leaving it client-writable: a forged client
-- could otherwise claim the wearable icon on the leaderboard and unlock REC's
-- ceiling in the UI without ever having a wearable. Capability is observed from
-- data, never asserted.
--
-- The usual Postgres caveat, for the third time in this repo: a column-level
-- REVOKE against a table-level GRANT is silently a no-op. Revoke the table
-- grant, then re-grant exactly the allowed columns.

begin;

alter table public.profiles
  add column focus text
    check (focus in ('running', 'gym', 'walking', 'general'));

comment on column public.profiles.focus is
  'Self-declared training focus (§5 onboarding). Presentation only — never read by scoring, never gates squad membership. Null means skipped. Mirrored as UserFocus in packages/kairo-core/src/program.ts.';

comment on column public.profiles.has_wearable is
  'Observed by sync-health from the presence of sleep data, not asserted by the client. Sticky: never cleared automatically, because a wearable left on the charger for a week is not a wearable you stopped owning.';

-- ---------------------------------------------------------------------------
-- Rebuild the column-scoped client grants: + focus, - has_wearable
-- ---------------------------------------------------------------------------

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
  focus,
  exclude_from_recap
) on public.profiles to authenticated;

revoke update on public.profiles from anon, authenticated;

grant update (
  character_name,
  class,
  timezone,
  height_cm,
  weight_kg,
  birth_year,
  sex,
  focus,
  exclude_from_recap
) on public.profiles to authenticated;

commit;

-- Schedule dispatch-notifications hourly.
--
-- A second function on its own schedule rather than a branch inside
-- finalize-days, for two reasons that are structural rather than stylistic:
--
--   * finalize-days caps at 500 days inside a 55s cron timeout. Adding a push
--     round trip per user to that budget risks days not closing.
--   * A push failure must never abort a finalization. Two functions make that
--     true by construction instead of by careful try/catch.
--
-- Seven past the hour, to stagger clear of the finalizer at five past. Both
-- read the project URL and the shared secret from Vault at call time — see
-- 20260728150000_schedule_finalize_days.sql for how those are created.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dispatch-notifications-hourly') then
    perform cron.unschedule('dispatch-notifications-hourly');
  end if;
end;
$$;

select cron.schedule(
  'dispatch-notifications-hourly',
  '7 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/dispatch-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);

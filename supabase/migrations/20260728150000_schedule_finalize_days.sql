-- Schedule finalize-days hourly.
--
-- Hourly rather than daily because days close per user, in their own timezone
-- (§12). Every hour of the day is somebody's finalization hour: an OFW in New
-- York and their sibling in Cebu finalize thirteen hours apart.
--
-- Both the project URL and the shared secret are read from Vault at call time,
-- never written here — this file is committed to git, and hardcoding a project
-- ref would silently break the moment the project is recreated (which is
-- exactly what happened moving from ap-south-1 to ap-southeast-1).
--
-- Create both once, out of band:
--
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url', 'Base URL for cron -> Edge Functions');
--   select vault.create_secret('<random>', 'cron_secret', 'pg_cron -> Edge Functions');
--
-- and set the identical secret as a function secret so the handler can compare:
--
--   supabase secrets set CRON_SECRET=<random>

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: unschedule first so re-running this migration cannot leave two
-- schedules firing the finalizer concurrently.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'finalize-days-hourly') then
    perform cron.unschedule('finalize-days-hourly');
  end if;
end;
$$;

-- Five past the hour, to sit clear of any on-the-hour load spike.
select cron.schedule(
  'finalize-days-hourly',
  '5 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/finalize-days',
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

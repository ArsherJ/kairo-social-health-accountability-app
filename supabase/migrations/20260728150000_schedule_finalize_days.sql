-- Schedule finalize-days hourly.
--
-- Hourly rather than daily because days close per user, in their own timezone
-- (§12). Every hour of the day is somebody's finalization hour: an OFW in New
-- York and their sibling in Cebu finalize thirteen hours apart.
--
-- The shared secret is read from Vault at call time, never written here — this
-- file is committed to git. Create it once, out of band:
--
--   select vault.create_secret('<random>', 'cron_secret', 'pg_cron -> Edge Functions');
--
-- and set the identical value as a function secret so the handler can compare:
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
    url := 'https://lplmsagrtxbvpcywvyzm.supabase.co/functions/v1/finalize-days',
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

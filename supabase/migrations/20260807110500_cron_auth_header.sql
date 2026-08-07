-- Both cron jobs must send an Authorization header, or the gateway refuses them.
--
-- **This fixes a live outage, not a hypothetical.** From 2026-08-07 06:05 UTC
-- every `finalize-days` run came back
-- `401 {"code":"UNAUTHORIZED_NO_AUTH_HEADER"}` — the Functions gateway now
-- rejects a request with no Authorization header *before* the handler runs, so
-- the `x-cron-secret` check never happened and no day finalized. Nothing in the
-- database recorded a failure; the evidence was only in `net._http_response`.
-- Any hourly cron posting to a Function has to be re-checked for this.
--
-- The key is the **publishable** one, which already ships inside the app — it
-- authenticates nothing on its own. The real guard is unchanged: `CRON_SECRET`,
-- compared inside each handler. Read from Vault at call time for the same
-- reason the project URL is (see 20260728150000): this file is committed.
--
-- Create it once, out of band:
--
--   select vault.create_secret('<sb_publishable_...>', 'functions_publishable_key',
--                              'Authorization header for cron -> Edge Functions');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_job record;
begin
  for v_job in
    select * from (values
      ('finalize-days-hourly',          'finalize-days',          '5 * * * *'),
      ('dispatch-notifications-hourly', 'dispatch-notifications', '7 * * * *')
    ) as j(jobname, fn, schedule)
  loop
    if exists (select 1 from cron.job where cron.job.jobname = v_job.jobname) then
      perform cron.unschedule(v_job.jobname);
    end if;

    perform cron.schedule(
      v_job.jobname,
      v_job.schedule,
      format(
        $fmt$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
                 || '/functions/v1/%s',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization',
            'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'functions_publishable_key'),
            'x-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 55000
        );
        $fmt$,
        v_job.fn
      )
    );
  end loop;
end;
$$;

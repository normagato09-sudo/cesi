-- Recordatorios: ejecuta la Edge Function send-reminders cada minuto con pg_cron.
--
-- Se ejecuta en Supabase → SQL Editor DESPUÉS de:
--   1. ejecutar supabase/schema.sql (tablas push_subscriptions y reminders_sent);
--   2. desplegar la función send-reminders y guardar sus secretos (ver README, "Recordatorios");
--   3. guardar en Vault la dirección del proyecto y el mismo CRON_SECRET que tiene la función:
--        select vault.create_secret('https://TU-PROYECTO.supabase.co', 'cesi_project_url');
--        select vault.create_secret('EL-MISMO-CRON_SECRET', 'cesi_cron_secret');
--      (para cambiarlos: select vault.update_secret(id, 'nuevo valor') con el id de vault.secrets).
-- Se puede volver a ejecutar: sustituye la tarea si ya existía.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'cesi-recordatorios';

select cron.schedule(
  'cesi-recordatorios',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'cesi_project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cesi_cron_secret')
    ),
    body := '{"action": "cron"}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Comprobar que funciona (tras un par de minutos):
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'cesi-recordatorios')
--   order by start_time desc limit 5;
--   select status_code, content from net._http_response order by created desc limit 5;
-- Pararlo:
--   select cron.unschedule('cesi-recordatorios');

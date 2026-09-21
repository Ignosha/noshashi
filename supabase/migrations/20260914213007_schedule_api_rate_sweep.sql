-- Actually run the rate-limit housekeeping.
--
-- APPLIED to project xiurbiwuwcfowqnpmwki on 2026-09-14 and recorded as
-- version 20260914213007. These are the bytes that ran.
--
-- noshashi.api_rate_sweep() was written in 20260910000000_api_hardening,
-- granted to service_role, and then never called by anything. There is no
-- caller in the repo and pg_cron was not installed, so every rate-limit
-- check inserted a row into noshashi.api_rate_windows that nothing ever
-- deleted. At the Institutional ceiling that is two new rows per second per
-- key, retained forever, on a table whose only purpose is to describe the
-- last sixty seconds.
--
-- The sweep drops windows older than an hour, so anything from every fifteen
-- minutes to hourly is correct. Fifteen keeps the table small enough that
-- the partial index stays hot.
--
-- Verify with:
--   select jobname, schedule, active from cron.job
--   where jobname = 'noshashi-api-rate-sweep';
--   select * from cron.job_run_details order by start_time desc limit 5;

create extension if not exists pg_cron;

-- Unschedule first so this migration is re-runnable: cron.schedule raises
-- on a duplicate jobname rather than replacing it.
select cron.unschedule('noshashi-api-rate-sweep')
where exists (select 1 from cron.job where jobname = 'noshashi-api-rate-sweep');

select cron.schedule(
  'noshashi-api-rate-sweep',
  '*/15 * * * *',
  $$select noshashi.api_rate_sweep()$$
);

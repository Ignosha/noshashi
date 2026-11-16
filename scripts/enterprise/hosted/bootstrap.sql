-- Staging-only guardrails. Apply solely to the explicitly approved empty target.
create schema noshashi_staging;
revoke all on schema noshashi_staging from public, anon, authenticated, service_role;
create table noshashi_staging.environment (
 name text primary key check(name='noshashi-staging'),
 project_ref text not null,
 synthetic_only boolean not null default true check(synthetic_only),
 created_at timestamptz not null default now()
);
alter table noshashi_staging.environment enable row level security;
create table noshashi_staging.applied_sources (
 filename text primary key,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 applied_at timestamptz not null default now()
);
alter table noshashi_staging.applied_sources enable row level security;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create function noshashi_staging.deactivate_jobs() returns void
language plpgsql set search_path='' as $$
declare j record;
begin
 for j in select jobid from cron.job where jobname like 'noshashi-%' loop
  perform cron.alter_job(job_id:=j.jobid,active:=false);
 end loop;
 if exists(select 1 from cron.job where jobname like 'noshashi-%' and active) then
  raise exception 'Staging application schedules are active';
 end if;
end $$;
create function noshashi_staging.synthetic_email_only() returns trigger
language plpgsql set search_path='' as $$
begin
 if (coalesce(new.email,'')<>'' and lower(new.email) not like '%.invalid')
 or (coalesce(new.email_change,'')<>'' and lower(new.email_change) not like '%.invalid') then
  raise exception 'Staging accepts only reserved .invalid email addresses' using errcode='42501';
 end if;
 return new;
end $$;
create trigger noshashi_staging_synthetic_users before insert or update on auth.users
 for each row execute function noshashi_staging.synthetic_email_only();
create function noshashi_staging.reject_network_queue() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'Outbound database requests are disabled on staging' using errcode='42501';
end $$;
revoke all on all tables in schema noshashi_staging from public,anon,authenticated,service_role;
revoke all on all functions in schema noshashi_staging from public,anon,authenticated,service_role;
-- Historical migrations fill this name only when absent. Seed an inert target
-- before installing them, so no production endpoint is ever inherited.
select vault.create_secret('https://staging-disabled.invalid/functions/v1',
 'noshashi_functions_url', 'Staging-only inert endpoint; outbound jobs are disabled');
do $$
declare jid bigint;
begin
 jid:=cron.schedule('noshashi-staging-guard-probe','* * * * *','select 1');
 perform noshashi_staging.deactivate_jobs();
 if (select active from cron.job where jobid=jid) then raise exception 'Job deactivation failed'; end if;
 perform cron.unschedule(jid);
 begin
  insert into auth.users(id,email) values(gen_random_uuid(),'staging-guard-probe@noshashi.app');
  raise exception 'Real email guard did not reject recipient';
 exception when insufficient_privilege then null; end;
end $$;

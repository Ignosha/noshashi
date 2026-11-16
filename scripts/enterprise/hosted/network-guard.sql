-- pg_net grants the application owner TRIGGER privileges on its request queue.
-- Unlike scheduler internals, this supports a staging-only request guard.
create function noshashi_staging.install_network_guard() returns void
language plpgsql set search_path='' as $$
begin
 if to_regclass('net.http_request_queue') is null then
  raise exception 'Staging networking extension is unavailable';
 end if;
 if not exists(select 1 from pg_trigger where tgrelid='net.http_request_queue'::regclass
  and tgname='noshashi_staging_no_outbound' and not tgisinternal) then
  execute 'create trigger noshashi_staging_no_outbound before insert on net.http_request_queue for each row execute function noshashi_staging.reject_network_queue()';
 end if;
end $$;
revoke all on function noshashi_staging.install_network_guard() from public,anon,authenticated,service_role;
select noshashi_staging.install_network_guard();
do $$ begin
 begin
  perform net.http_post(url:='https://staging-disabled.invalid/guard-probe');
  raise exception 'Network guard did not reject an outbound request';
 exception when insufficient_privilege then
  if sqlerrm <> 'Outbound database requests are disabled on staging' then raise; end if;
 end;
end $$;

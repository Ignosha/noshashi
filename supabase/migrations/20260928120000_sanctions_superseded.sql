-- A fetch that a newer one overtook (a manual refresh between the daily
-- fetch and load, say) was left "fetching" forever. The load now closes
-- every older fetch as superseded when it finishes the newest.

alter table noshashi.sanctions_refreshes drop constraint if exists sanctions_refreshes_status_check;
alter table noshashi.sanctions_refreshes add constraint sanctions_refreshes_status_check
  check (status in ('fetching', 'ok', 'failed', 'superseded'));

create or replace function noshashi.sanctions_close_superseded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('ok', 'failed') and old.status = 'fetching' then
    update noshashi.sanctions_refreshes
       set status = 'superseded', finished_at = now(), error = 'A newer fetch was loaded instead.'
     where status = 'fetching' and id < new.id;
  end if;
  return new;
end;
$$;

revoke execute on function noshashi.sanctions_close_superseded() from public, anon, authenticated;

drop trigger if exists sanctions_refreshes_close_superseded on noshashi.sanctions_refreshes;
create trigger sanctions_refreshes_close_superseded after update of status on noshashi.sanctions_refreshes
  for each row execute function noshashi.sanctions_close_superseded();

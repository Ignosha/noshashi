-- The product-update list behind /api/subscribe.
--
-- The site's API is stateless and holds only the publishable key, so the
-- table is private (RLS on, no policies) and the only way in is two narrow
-- functions. Neither one can read the list: subscribe returns an
-- unsubscribe token only when it actually added or re-added the address,
-- so calling it cannot reveal who is already on the list.

create table if not exists noshashi.update_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 200 and email ~ '^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$'),
  source text,
  token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

create unique index if not exists update_subscribers_email_key
  on noshashi.update_subscribers (lower(email));

alter table noshashi.update_subscribers enable row level security;
revoke all on noshashi.update_subscribers from anon, authenticated;

create or replace function public.noshashi_subscribe(p_email text, p_source text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  insert into noshashi.update_subscribers (email, source)
  values (trim(p_email), left(p_source, 80))
  on conflict (lower(email)) do update
    set unsubscribed_at = null,
        token = gen_random_uuid(),
        source = coalesce(left(excluded.source, 80), noshashi.update_subscribers.source)
    where noshashi.update_subscribers.unsubscribed_at is not null
  returning token into v_token;
  return v_token;
end;
$$;

create or replace function public.noshashi_unsubscribe(p_token uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with done as (
    update noshashi.update_subscribers
       set unsubscribed_at = now()
     where token = p_token and unsubscribed_at is null
    returning 1
  )
  select exists (select 1 from done);
$$;

revoke all on function public.noshashi_subscribe(text, text) from public;
revoke all on function public.noshashi_unsubscribe(uuid) from public;
grant execute on function public.noshashi_subscribe(text, text) to anon;
grant execute on function public.noshashi_unsubscribe(uuid) to anon;

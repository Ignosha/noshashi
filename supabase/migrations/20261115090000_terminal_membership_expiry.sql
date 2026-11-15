-- Preserve the existing expiry of temporary organization/regulator memberships.
-- Applies after the terminal account migration; no user or billing grants change.
begin;
create or replace function noshashi.terminal_access(p_account uuid,p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,noshashi as $$
declare plan text:='operator'; source_kind text:='free'; expires timestamptz; member_role text; member_expiry timestamptz; contract_member_expiry timestamptz; c noshashi.terminal_contract_access;
begin
 if not exists(select 1 from noshashi.accounts where id=p_account) then raise exception 'not_authenticated' using errcode='28000'; end if;
 if p_org is not null then
  select role::text,expires_at into member_role,member_expiry from noshashi.organization_members where account_id=p_account and organization_id=p_org and (expires_at is null or expires_at>now());
  if not found then raise exception 'scope_forbidden' using errcode='42501'; end if;
 end if;
 -- Self-service Pro. Account metadata and client-selected tiers are never consulted.
 select 'desk',least(e.valid_until,s.current_period_end) into plan,expires
 from noshashi.entitlements e join noshashi.subscriptions s on s.account_id=e.account_id and s.tier=e.tier
 where e.account_id=p_account and e.tier='desk' and e.valid_until>now()
 and s.status='active' and s.current_period_end>now()
 and not exists(select 1 from noshashi.payment_review_billing_holds h where h.stripe_customer_id=s.stripe_customer_id and h.resolved_at is null)
 order by s.current_period_end desc limit 1;
 if found then source_kind:='subscription';else plan:='operator';expires:=null;end if;
 -- Assigned paid contracts include personal Pro features; shared access requires the exact organization.
 select * into c from noshashi.terminal_contract_access a
 where a.account_id=p_account and (a.organization_id is not distinct from p_org or (p_org is null and a.organization_id is not null and exists(select 1 from noshashi.organization_members m where m.account_id=p_account and m.organization_id=a.organization_id and (m.expires_at is null or m.expires_at>now()))))
 and a.revoked_at is null and a.signed_at is not null and a.signed_at<=now()
 and a.valid_from<=now() and a.valid_until>now() and a.paid_through>now()
 and not exists(select 1 from noshashi.payment_review_billing_holds h where h.stripe_customer_id=a.stripe_customer_id and h.resolved_at is null)
 order by case a.tier when 'strategic' then 4 when 'enterprise' then 3 else 2 end desc limit 1;
 if found then
  if c.organization_id is not null then
   select expires_at into contract_member_expiry from noshashi.organization_members where account_id=p_account and organization_id=c.organization_id;
  end if;
  plan:=c.tier;source_kind:='contract';expires:=least(c.valid_until,c.paid_through,contract_member_expiry);
 end if;
 if expires is not null then expires:=least(expires,member_expiry);end if;
 return jsonb_build_object('account_id',p_account,'tier',plan,'source',source_kind,'valid_until',expires,'organization_id',p_org,'role',member_role);
end;
$$;
revoke all on function noshashi.terminal_access(uuid,uuid) from public,anon,authenticated;
grant execute on function noshashi.terminal_access(uuid,uuid) to service_role;

commit;

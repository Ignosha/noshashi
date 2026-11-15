-- Review-only hardening: a closure must cite a current, scoped approval for
-- the linked receipt. Existing case history is unchanged. Legacy approvals
-- without a recorded expiry require a new reviewed exception before reuse.
-- Apply only after owner review; no activation or billing configuration changes.
begin;
create or replace function noshashi.org_case_event_refusal(
  p_org uuid, p_case text, p_body text, p_hash text, p_expect_seq integer, p_expect_prev text, p_closed boolean
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  b jsonb;
  k text;
  at_ts timestamptz;
begin
  begin
    b := p_body::jsonb;
  exception when others then
    return 'MALFORMED';
  end;
  if jsonb_typeof(b) <> 'object' then return 'MALFORMED'; end if;
  if upper(encode(sha256(convert_to(p_body, 'UTF8')), 'hex')) <> coalesce(p_hash, '') then
    return 'HASH_MISMATCH';
  end if;
  if (b->>'seq') is distinct from p_expect_seq::text or (b->>'prev') is distinct from p_expect_prev then
    return 'CONFLICT';
  end if;
  if (b->>'actor') is distinct from (select auth.uid())::text then
    return 'ACTOR_MISMATCH';
  end if;
  begin
    at_ts := (b->>'at')::timestamptz;
  exception when others then
    return 'MALFORMED';
  end;
  if at_ts is null or abs(extract(epoch from (at_ts - now()))) > 300 then
    return 'CLOCK_SKEW';
  end if;

  k := b->>'kind';
  if k is null or k not in ('opened', 'note', 'status', 'priority', 'linked', 'assigned', 'closed', 'reopened') then
    return 'MALFORMED';
  end if;
  if (k = 'opened') <> (p_expect_seq = 0) then return 'MALFORMED'; end if;
  if p_closed and k <> 'reopened' then return 'CASE_CLOSED'; end if;
  if k = 'reopened' and not p_closed then return 'NOT_CLOSED'; end if;
  if k in ('closed', 'reopened') and length(trim(coalesce(b->>'text', ''))) < 10 then
    return 'RATIONALE_REQUIRED';
  end if;
  if k = 'note' and length(trim(coalesce(b->>'text', ''))) = 0 then return 'MALFORMED'; end if;
  if k = 'closed' then
    if coalesce(b->>'outcome', '') not in ('cleared', 'exception-approved', 'blocked', 'reported', 'no-action') then
      return 'MALFORMED';
    end if;
    if b->>'outcome' = 'exception-approved' and not exists (
      select 1 from noshashi.policy_exceptions x
      where x.id::text = b->>'exceptionId' and x.organization_id = p_org and x.status = 'approved'
        and x.expires_at > now()
        and (x.case_id is null or x.case_id = p_case)
        and x.receipt_digest = (
          select e.body::jsonb->'linked'->>'digest'
          from noshashi.org_case_events e
          where e.case_id = p_case and e.organization_id = p_org
            and e.kind in ('opened', 'linked')
            and jsonb_typeof(e.body::jsonb->'linked') = 'object'
          order by e.seq desc limit 1
        )
    ) then
      return 'EXCEPTION_NOT_APPROVED';
    end if;
  end if;
  return null;
end;
$$;


revoke execute on function noshashi.org_case_event_refusal(uuid,text,text,text,integer,text,boolean) from public,anon,authenticated;
commit;

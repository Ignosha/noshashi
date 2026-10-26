-- Hosted payment verification (noshashi-verify, verb payment/verify).
--
-- Two tables, kept apart because they answer different questions:
--
--   payment_verifications  every report the API served, as served. The
--                          audit trail, and what an Idempotency-Key
--                          replays. Append-only.
--   payment_settlements    which transaction settled which invoice. The
--                          unique constraint is the double-credit guard:
--                          one transaction settles at most one invoice per
--                          tenant (organization when the key belongs to
--                          one, otherwise the account) and network. The
--                          desktop app keeps the same mapping in memory
--                          (src-tauri/src/verify/book.rs); this is the
--                          persistent, shared version.
--
-- Additive only: no existing table or row is changed.

create table if not exists noshashi.payment_verifications (
  id               bigint generated always as identity primary key,
  account_id       uuid not null references noshashi.accounts(id) on delete cascade,
  organization_id  uuid references noshashi.organizations(id) on delete set null,
  api_key_id       uuid references noshashi.api_keys(id) on delete set null,
  request_id       uuid not null,
  idempotency_key  text check (idempotency_key is null or length(idempotency_key) between 1 and 255),
  network          text not null check (network in ('mainnet', 'testnet')),
  transaction_hash text not null check (transaction_hash ~ '^[0-9A-F]{64}$'),
  invoice_id       text,
  status           text not null check (status in ('VERIFIED', 'HOLD', 'REJECTED')),
  reason_code      text not null check (reason_code ~ '^[A-Z_]+$'),
  rule_version     text not null,
  decision_key     text not null check (decision_key ~ '^[0-9A-F]{64}$'),
  evidence_digest  text not null check (evidence_digest ~ '^[0-9A-F]{64}$'),
  -- The full response body: report, signature (or null), source statistics.
  response         jsonb not null,
  signed           boolean not null default false,
  billed           boolean not null,
  latency_ms       integer,
  created_at       timestamptz not null default now()
);

comment on table noshashi.payment_verifications is
  'Every payment-verification report served by the hosted API, as served. Append-only.';

create unique index if not exists payment_verifications_idempotency_idx
  on noshashi.payment_verifications (account_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists payment_verifications_account_idx on noshashi.payment_verifications (account_id, created_at desc);
create index if not exists payment_verifications_org_idx on noshashi.payment_verifications (organization_id);
create index if not exists payment_verifications_api_key_idx on noshashi.payment_verifications (api_key_id);
create index if not exists payment_verifications_hash_idx on noshashi.payment_verifications (transaction_hash);

create table if not exists noshashi.payment_settlements (
  id               bigint generated always as identity primary key,
  account_id       uuid not null references noshashi.accounts(id) on delete cascade,
  organization_id  uuid references noshashi.organizations(id) on delete cascade,
  -- Whose books the settlement is in. An organization's keys share one
  -- book, so two members cannot each settle a different invoice with the
  -- same payment.
  tenant_key       text generated always as (
                     coalesce('org:' || organization_id::text, 'acct:' || account_id::text)
                   ) stored,
  network          text not null check (network in ('mainnet', 'testnet')),
  transaction_hash text not null check (transaction_hash ~ '^[0-9A-F]{64}$'),
  invoice_id       text not null check (length(invoice_id) between 1 and 255),
  decision_key     text not null check (decision_key ~ '^[0-9A-F]{64}$'),
  evidence_digest  text not null check (evidence_digest ~ '^[0-9A-F]{64}$'),
  request_id       uuid not null,
  created_at       timestamptz not null default now(),
  constraint payment_settlements_one_invoice_per_tx unique (tenant_key, network, transaction_hash)
);

comment on table noshashi.payment_settlements is
  'Which transaction settled which invoice. Unique per tenant, network and transaction hash: one payment cannot settle two invoices. Append-only.';

create index if not exists payment_settlements_account_idx on noshashi.payment_settlements (account_id);
create index if not exists payment_settlements_org_idx on noshashi.payment_settlements (organization_id);

-- Append-only. The grant is the control; nothing updates or deletes these
-- rows, including the service role the function runs as.
revoke all on noshashi.payment_verifications from anon, authenticated, service_role;
revoke all on noshashi.payment_settlements from anon, authenticated, service_role;
grant select, insert on noshashi.payment_verifications to service_role;
grant select, insert on noshashi.payment_settlements to service_role;
grant select on noshashi.payment_verifications to authenticated;
grant select on noshashi.payment_settlements to authenticated;

alter table noshashi.payment_verifications enable row level security;
alter table noshashi.payment_settlements enable row level security;

-- Same reach as receipts: your own rows, and your organization's.
drop policy if exists payment_verifications_select_own on noshashi.payment_verifications;
create policy payment_verifications_select_own on noshashi.payment_verifications
  for select to authenticated
  using ((select auth.uid()) = account_id or (organization_id is not null and noshashi.is_org_member(organization_id)));

drop policy if exists payment_settlements_select_own on noshashi.payment_settlements;
create policy payment_settlements_select_own on noshashi.payment_settlements
  for select to authenticated
  using ((select auth.uid()) = account_id or (organization_id is not null and noshashi.is_org_member(organization_id)));

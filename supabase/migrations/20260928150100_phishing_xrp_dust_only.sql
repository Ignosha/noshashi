-- The phishing link feed reads XRP dust only.
--
-- Its first hour of live reads found a decentralized exchange tagging its
-- users' ordinary token payments with its own domain ("Transaction
-- initiated via …"). Counted as sightings, every busy wallet or exchange
-- that labels its payments would in time reach five recipients and be
-- listed beside drainer sites. Wallet drainers spray their links in XRP
-- dust (a drop or a few), which ordinary payments are not, so only XRP
-- payments under 0.01 XRP are read from now on.

create or replace function noshashi.phishing_sightings_from(p_ledger jsonb)
returns table (domain text, tx_hash text, sender text, recipient text, ledger_index bigint, memo text)
language sql
immutable
set search_path = ''
as $$
  with txs as (
    select t from jsonb_array_elements(coalesce(p_ledger->'transactions', '[]'::jsonb)) t
     where t->>'TransactionType' = 'Payment'
       and coalesce(t->'metaData'->>'TransactionResult', t->'meta'->>'TransactionResult') = 'tesSUCCESS'
  ),
  small as (
    select t, coalesce(t->'metaData'->'delivered_amount', t->'meta'->'delivered_amount') d from txs
  ),
  memos as (
    select t, noshashi.memo_text(m->'Memo'->>'MemoData') txt
      from small, jsonb_array_elements(coalesce(t->'Memos', '[]'::jsonb)) m
     where jsonb_typeof(d) = 'string' and d #>> '{}' ~ '^\d{1,4}$'
  )
  select dom, upper(t->>'hash'), t->>'Account', t->>'Destination', (p_ledger->>'ledger_index')::bigint, left(txt, 300)
    from memos, noshashi.memo_domains(txt) dom
   where txt is not null;
$$;

revoke execute on function noshashi.phishing_sightings_from(jsonb) from public, anon, authenticated;

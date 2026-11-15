#!/usr/bin/env bash
# Called only by test-sql.sh with its disposable local database.
set -euo pipefail
url="$1"; db="$2"
case "$url" in *@localhost[:/]*|*@127.0.0.1[:/]*|*host=/*|postgresql:///*) ;; *) exit 2;; esac
[[ "$db" =~ ^noshashi_sqltest_[0-9]+$ ]] || exit 2
umask 077
tmp="$(mktemp -d)"
first=''; second=''
trap 'for pid in "$first" "$second"; do [ -z "$pid" ] || kill "$pid" 2>/dev/null || true; done; rm -rf "$tmp"' EXIT
on() {
  if [ "$#" = 0 ]; then set -- -f -; fi
  psql "$url" -XqAt -v ON_ERROR_STOP=1 -c "\\connect $db" "$@"
}
on <<'SQL' >/dev/null
insert into auth.users(id,email) values
 ('c1000000-0000-4000-8000-000000000001','race-author@example.invalid'),
 ('c1000000-0000-4000-8000-000000000002','race-reviewer@example.invalid'),
 ('c1000000-0000-4000-8000-000000000003','race-compliance@example.invalid');
insert into noshashi.organizations(id,name,slug) values('c2000000-0000-4000-8000-000000000001','Concurrency fixture','concurrency-fixture');
insert into noshashi.organization_members(organization_id,account_id,role) values
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','owner'),
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','reviewer'),
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003','compliance');
insert into noshashi.policy_exceptions(id,organization_id,subject,receipt_digest,verdict,reason,evidence,requested_by)
 values('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001',repeat('r',30),repeat('A',64),'hold','Concurrency fixture reason','{"source":"synthetic"}','c1000000-0000-4000-8000-000000000001');
SQL
on >"$tmp/first" 2>"$tmp/first-error" <<'SQL' &
begin;
set local application_name='noshashi-governance-concurrency-first';
set local role service_role;
select noshashi.decide_policy_exception('c3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002',true,null,30);
-- Keep the actual decision row lock held while the other reviewer arrives.
select pg_sleep(5);
commit;
SQL
first=$!
locked=0
for attempt in $(seq 1 20); do
 count="$(on -c "select count(*) from pg_stat_activity where application_name='noshashi-governance-concurrency-first' and wait_event='PgSleep';" | tail -1)"
 if [ "$count" = 1 ]; then locked=1; break; fi
 sleep 0.05
done
[ "$locked" = 1 ] || { echo 'FAILED: first decision did not acquire its lock'; exit 1; }
# Both calls use real connections. Require observed database lock contention,
# rather than counting two serial calls as a concurrency test.
on >"$tmp/second" 2>"$tmp/second-error" <<'SQL' &
begin;
set local application_name='noshashi-governance-concurrency-second';
set local role service_role;
select noshashi.decide_policy_exception('c3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000003',false,'A different concurrent reviewer decision',30);
commit;
SQL
second=$!
observed=0
for attempt in $(seq 1 20); do
 count="$(on -c "select count(*) from pg_stat_activity where application_name='noshashi-governance-concurrency-second' and wait_event_type='Lock';" | tail -1)"
 if [ "$count" = 1 ]; then observed=1; break; fi
 sleep 0.05
done
wait "$first"; first=''
wait "$second"; second=''
[ "$observed" = 1 ] || { echo 'FAILED: no concurrent lock contention observed'; exit 1; }
[ "$(cat "$tmp/first" "$tmp/second" | grep -c '"ok": true')" = 1 ] || { echo 'FAILED: expected exactly one accepted decision'; exit 1; }
[ "$(cat "$tmp/first" "$tmp/second" | grep -c ALREADY_DECIDED)" = 1 ] || { echo 'FAILED: second decision was not refused'; exit 1; }
count="$(on -c "select count(*) from noshashi.audit_log where entity_id='c3000000-0000-4000-8000-000000000001' and action in ('exception.approved','exception.rejected');" | tail -1)"
[ "$count" = 1 ] || { echo 'FAILED: duplicated decision audit'; exit 1; }
echo 'GOVERNANCE CONCURRENCY TEST PASSED (two connections; row-lock wait observed)'

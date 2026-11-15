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
insert into auth.users(id,email) values('f1000000-0000-4000-8000-000000000001','credit-race@example.invalid');
SQL
on >"$tmp/first" 2>"$tmp/first-error" <<'SQL' &
begin;
set local application_name='noshashi-billing-concurrency-first';
set local role service_role;
select noshashi.billing_apply_credits('evt_racefirst','f1000000-0000-4000-8000-000000000001',
 (noshashi.billing_claim('evt_racefirst','f1000000-0000-4000-8000-000000000001',repeat('a',64))->>'token')::uuid,
 'cs_test_concurrent',10000,100,'usd');
select pg_sleep(5);
commit;
SQL
first=$!
locked=0
for attempt in $(seq 1 20); do
 count="$(on -c "select count(*) from pg_stat_activity where application_name='noshashi-billing-concurrency-first' and wait_event='PgSleep';" | tail -1)"
 if [ "$count" = 1 ]; then locked=1; break; fi
 sleep 0.05
done
[ "$locked" = 1 ] || { echo 'FAILED: first decision did not acquire its lock'; exit 1; }
# Both calls use real connections. Require observed database lock contention,
# rather than counting two serial calls as a concurrency test.
on >"$tmp/second" 2>"$tmp/second-error" <<'SQL' &
begin;
set local application_name='noshashi-billing-concurrency-second';
set local role service_role;
select noshashi.billing_apply_credits('evt_racesecond','f1000000-0000-4000-8000-000000000001',
 (noshashi.billing_claim('evt_racesecond','f1000000-0000-4000-8000-000000000001',repeat('b',64))->>'token')::uuid,
 'cs_test_concurrent',10000,100,'usd');
commit;
SQL
second=$!
observed=0
for attempt in $(seq 1 20); do
 count="$(on -c "select count(*) from pg_stat_activity where application_name='noshashi-billing-concurrency-second' and wait_event_type='Lock';" | tail -1)"
 if [ "$count" = 1 ]; then observed=1; break; fi
 sleep 0.05
done
wait "$first"; first=''
wait "$second"; second=''
[ "$observed" = 1 ] || { echo 'FAILED: no concurrent lock contention observed'; exit 1; }
balance="$(on -c "select verification_quota from noshashi.entitlements where account_id='f1000000-0000-4000-8000-000000000001';" | tail -1)"
[ "$balance" = 10000 ] || { echo 'FAILED: concurrent duplicate credit'; exit 1; }
count="$(on -c "select count(*) from noshashi.billing_credit_purchases where session_id='cs_test_concurrent';" | tail -1)"
[ "$count" = 1 ] || { echo 'FAILED: duplicate purchase receipt'; exit 1; }
echo 'BILLING CONCURRENCY TEST PASSED (two connections; row-lock wait observed)'

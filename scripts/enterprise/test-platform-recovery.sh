#!/usr/bin/env bash
# Destructive only inside the explicitly named isolated synthetic stack.
set -euo pipefail
container="${1:?test container required}"
[ "$container" = supabase_db_noshashi-enterprise-ci ] || exit 2
network=noshashi-enterprise-isolated
[ "${GITHUB_ACTIONS:-}" = true ] || exit 2
[ "$(docker network inspect -f '{{index .Labels "noshashi.test-only"}}' "$network")" = true ] || exit 2
sudo -n iptables -C DOCKER-USER -s 172.30.241.0/24 -j NOSHASHI_TEST
sudo -n iptables -C INPUT -s 172.30.241.0/24 -m conntrack --ctstate NEW -j REJECT || exit 2
[ "$(docker inspect -f '{{range $name, $value := .NetworkSettings.Networks}}{{$name}}{{end}}' "$container")" = "$network" ] || exit 2
umask 077
tmp="$(mktemp -d)"
export GNUPGHOME="$tmp/gnupg"
mkdir -m 700 "$GNUPGHOME"
cleanup() { gpgconf --homedir "$GNUPGHOME" --kill all >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
pg() { docker exec -i "$container" bash -ec 'export PGPASSWORD="${POSTGRES_PASSWORD:?missing_test_database_password}"; exec "$@"' _ "$@"; }
# Stop writers before snapshot comparison; cron is disabled by the parent.
docker stop -t 2 supabase_auth_noshashi-enterprise-ci supabase_rest_noshashi-enterprise-ci >/dev/null
cat > "$tmp/manifest.sql" <<'SQL'
select format('select %L, count(*), coalesce(md5(string_agg(to_jsonb(t)::text, E''\n'' order by to_jsonb(t)::text)),'''') from %I.%I t;',
 table_schema || '.' || table_name,table_schema,table_name)
from information_schema.tables
where table_type='BASE TABLE' and table_schema in ('noshashi','auth') order by table_schema,table_name
\gexec
SQL
manifest() { pg psql -U postgres -d postgres -X -qAt -v ON_ERROR_STOP=1 < "$tmp/manifest.sql"; }
manifest > "$tmp/before.txt"
pg pg_dump -h 127.0.0.1 -U supabase_admin -d postgres --format=custom > "$tmp/plain.dump" 2> "$tmp/dump.err"
python3 - "$tmp/key" <<'PY'
import pathlib,secrets,sys
pathlib.Path(sys.argv[1]).write_text(secrets.token_urlsafe(40))
PY
gpg --batch --yes --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 \
 --symmetric --cipher-algo AES256 --output "$tmp/snapshot.gpg" "$tmp/plain.dump" 3<"$tmp/key" 2>"$tmp/gpg.err"
rm "$tmp/plain.dump"
gpg --batch --yes --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 \
 --output "$tmp/restore.dump" --decrypt "$tmp/snapshot.gpg" 3<"$tmp/key" 2>"$tmp/gpg.err"
# Prove recovery rather than simply counting unchanged source rows.
# A preinitialized Supabase target has realtime message partitions. pg_restore
# --clean cannot drop inherited child constraints individually; clear that
# managed schema first in this disposable target, then restore its full archive.
pg psql -h 127.0.0.1 -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 \
 -c 'drop schema noshashi cascade; drop schema if exists realtime cascade' > "$tmp/remove.out" 2> "$tmp/remove.err"
if ! pg pg_restore -h 127.0.0.1 -U supabase_admin -d postgres --clean --if-exists --exit-on-error \
 < "$tmp/restore.dump" > "$tmp/restore.out" 2> "$tmp/restore.err"; then
 echo 'FAILED: full synthetic Supabase archive restore'
 grep -m1 'error:' "$tmp/restore.err" | cut -c1-350 || true
 exit 1
fi
rm "$tmp/restore.dump"
manifest > "$tmp/after.txt"
if ! cmp -s "$tmp/before.txt" "$tmp/after.txt"; then
 echo 'FAILED: recovered auth/application data differs from snapshot'; exit 1
fi
docker start supabase_auth_noshashi-enterprise-ci supabase_rest_noshashi-enterprise-ci >/dev/null
echo 'FULL SYNTHETIC SUPABASE RESTORE PASSED (auth/application row counts and content digests match)'

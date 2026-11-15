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
# Restore into a fresh database, not over Supabase's preinitialized objects.
# Keep the old source offline for comparison; no owner/global roles change.
pg psql -h 127.0.0.1 -U supabase_admin -d template1 -X -q -v ON_ERROR_STOP=1 \
 > "$tmp/switch.out" 2> "$tmp/switch.err" <<'SQL'
create database noshashi_restore_target with template template0 owner postgres;
alter database postgres allow_connections false;
select pg_terminate_backend(pid) from pg_stat_activity where datname='postgres';
SQL
for _ in $(seq 1 30); do
 active="$(pg psql -h 127.0.0.1 -U supabase_admin -d template1 -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where datname='postgres'")"
 [ "$active" = 0 ] && break
 sleep .2
done
[ "$active" = 0 ] || { echo 'FAILED: source database writers did not stop'; exit 1; }
pg psql -h 127.0.0.1 -U supabase_admin -d template1 -X -q -v ON_ERROR_STOP=1 \
 >> "$tmp/switch.out" 2>> "$tmp/switch.err" <<'SQL'
alter database postgres rename to noshashi_restore_source;
alter database noshashi_restore_target rename to postgres;
SQL
# Public is the one schema supplied even by template0. Match the archive's
# own pre-data instructions rather than assuming whether it recreates it.
pg pg_restore --section=pre-data --file=- < "$tmp/restore.dump" > "$tmp/predata.sql" 2> "$tmp/predata.err"
if grep -Eq '^CREATE SCHEMA public;' "$tmp/predata.sql"; then
 pg psql -h 127.0.0.1 -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 \
  -c 'drop schema public' >> "$tmp/switch.out" 2>> "$tmp/switch.err"
fi
# Supabase generates the public GraphQL wrapper in an extension event hook.
# Restore all object/data definitions first, supply the versioned real wrapper,
# then restore every ACL/comment. No failing ACL is ignored or discarded.
pg pg_restore --list < "$tmp/restore.dump" > "$tmp/archive.list"
python3 - "$tmp" <<'PYTOC'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]); objects=[];metadata=[]
for line in (p/'archive.list').read_text().splitlines(True):
 if re.match(r'^\d+; \d+ \d+ (ACL|DEFAULT ACL|COMMENT|SECURITY LABEL) ',line): metadata.append(line)
 else: objects.append(line)
(p/'objects.list').write_text(''.join(objects))
(p/'metadata.list').write_text(''.join(metadata))
assert metadata, 'archive metadata must not be discarded'
PYTOC
docker cp "$tmp/objects.list" "$container:/tmp/noshashi-restore-objects.list" >/dev/null
docker cp "$tmp/metadata.list" "$container:/tmp/noshashi-restore-metadata.list" >/dev/null
restore_part() {
 if ! pg pg_restore -h 127.0.0.1 -U supabase_admin -d postgres --exit-on-error \
 --use-list="/tmp/noshashi-restore-$1.list" < "$tmp/restore.dump" > "$tmp/restore.out" 2> "$tmp/restore.err"; then
  echo "FAILED: full synthetic Supabase archive restore ($1)"
  grep -m1 'error:' "$tmp/restore.err" | cut -c1-350 || true
  grep -m1 -E '^Command was: (DROP|ALTER|CREATE|GRANT|REVOKE|COMMENT)' "$tmp/restore.err" | cut -c1-500 || true
  exit 1
 fi
}
restore_part objects
pg psql -h 127.0.0.1 -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 \
 < "$(dirname "$0")/supabase-graphql-restore.sql" > "$tmp/compat.out" 2> "$tmp/compat.err"
restore_part metadata
pg rm -f /tmp/noshashi-restore-objects.list /tmp/noshashi-restore-metadata.list
rm "$tmp/restore.dump"
manifest > "$tmp/after.txt"
if ! cmp -s "$tmp/before.txt" "$tmp/after.txt"; then
 echo 'FAILED: recovered auth/application data differs from snapshot'; exit 1
fi
docker start supabase_auth_noshashi-enterprise-ci supabase_rest_noshashi-enterprise-ci >/dev/null
echo 'FULL SYNTHETIC SUPABASE RESTORE PASSED (auth/application row counts and content digests match)'

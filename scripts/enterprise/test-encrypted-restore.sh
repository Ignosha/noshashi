#!/usr/bin/env bash
# Synthetic only. Requires an explicitly disposable labelled container.
set -euo pipefail
container="${1:?pass a disposable postgres container name}"
[[ "$container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || exit 2
[ "$(docker inspect --format '{{index .Config.Labels "noshashi.test-only"}}' "$container")" = true ] || { echo 'BLOCKED: container is not labelled test-only'; exit 2; }
major="${NOSHASHI_TEST_PG_MAJOR:-17}"
version="$(docker exec "$container" pg_restore --version)"
case "$version" in *" $major."*) ;; *) echo 'BLOCKED: unexpected PostgreSQL client version'; exit 2;; esac
umask 077
tmp="$(mktemp -d)"; source_db="noshashi_restore_fixture_source_$$"; target_db="noshashi_restore_fixture_target_$$"
export GNUPGHOME="$tmp/gnupg"
mkdir -m 700 "$GNUPGHOME"
start="$(date +%s)"
pg() { docker exec -i -u postgres "$container" "$@"; }
cleanup() {
 pg psql -d postgres -qAtc "drop database if exists $source_db with (force);" > /dev/null 2>&1 || true
 pg psql -d postgres -qAtc "drop database if exists $target_db with (force);" > /dev/null 2>&1 || true
 pg psql -d postgres -qAtc "drop database if exists noshashi_restore_check with (force);" > /dev/null 2>&1 || true
 gpgconf --homedir "$GNUPGHOME" --kill all >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
# Use separate statements: CREATE/DROP DATABASE cannot run inside a transaction.
pg psql -d postgres -qAtc "create database $source_db" >/dev/null
pg psql -d postgres -qAtc "create database $target_db" >/dev/null
pg psql -d "$source_db" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $$ begin create role noshashi_restore_fixture_reader nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users(id integer primary key);
create schema noshashi;
create table noshashi.synthetic(id integer primary key);
create schema fixture;
create table fixture.evidence(id integer primary key,tenant text not null,payload text not null,digest text not null,recorded_at timestamptz not null default now());
insert into fixture.evidence values
 (1,'tenant-a','synthetic evidence one',encode(sha256(convert_to('synthetic evidence one','UTF8')),'hex'),now()),
 (2,'tenant-a','synthetic evidence two',encode(sha256(convert_to('synthetic evidence two','UTF8')),'hex'),now()),
 (3,'tenant-b','synthetic evidence three',encode(sha256(convert_to('synthetic evidence three','UTF8')),'hex'),now());
alter table fixture.evidence enable row level security;
alter table fixture.evidence force row level security;
create policy tenant_read on fixture.evidence for select to noshashi_restore_fixture_reader using(tenant=current_setting('fixture.tenant',true));
grant usage on schema fixture to noshashi_restore_fixture_reader;
grant select on fixture.evidence to noshashi_restore_fixture_reader;
create function fixture.visible_count() returns bigint language sql stable security invoker set search_path='' as $$ select count(*) from fixture.evidence $$;
grant execute on function fixture.visible_count() to noshashi_restore_fixture_reader;
SQL
python3 - "$tmp/passphrase" <<'PY'
import pathlib,secrets,sys
pathlib.Path(sys.argv[1]).write_text(secrets.token_urlsafe(40))
PY
pg pg_dump --format=custom --dbname="$source_db" > "$tmp/plain.dump"
gpg --batch --yes --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 --output "$tmp/backup.gpg" "$tmp/plain.dump" 3<"$tmp/passphrase" 2>"$tmp/gpg.err"
rm "$tmp/plain.dump"
printf '%s' 'deliberately-wrong-fixture-passphrase' > "$tmp/wrong"
if gpg --batch --yes --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 --output "$tmp/wrong.dump" --decrypt "$tmp/backup.gpg" 3<"$tmp/wrong" 2>"$tmp/wrong.err"; then echo 'FAILED: wrong passphrase accepted'; exit 1; fi
# Do not treat an authenticated-decryption failure as a usable archive.
python3 - "$tmp/backup.gpg" "$tmp/corrupt.gpg" <<'PY'
import pathlib,sys
b=bytearray(pathlib.Path(sys.argv[1]).read_bytes());b[len(b)//2]^=1;pathlib.Path(sys.argv[2]).write_bytes(b)
PY
if gpg --batch --yes --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 --output "$tmp/corrupt.dump" --decrypt "$tmp/corrupt.gpg" 3<"$tmp/passphrase" 2>"$tmp/corrupt.err"; then echo 'FAILED: corrupt ciphertext accepted'; exit 1; fi
gpg --batch --yes --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 --output "$tmp/restored.dump" --decrypt "$tmp/backup.gpg" 3<"$tmp/passphrase" 2>"$tmp/gpg.err"
# Retain ACLs/RLS; stripping privileges would not test access recovery.
pg pg_restore --exit-on-error --no-owner --dbname="$target_db" < "$tmp/restored.dump" 2>"$tmp/restore.err"
rm "$tmp/restored.dump"
pg psql -d "$target_db" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $$ begin
 if (select count(*) from fixture.evidence)<>3 then raise exception 'fixture_row_count'; end if;
 if exists(select 1 from fixture.evidence where digest<>encode(sha256(convert_to(payload,'UTF8')),'hex')) then raise exception 'fixture_digest_mismatch'; end if;
 if has_table_privilege('noshashi_restore_fixture_reader','fixture.evidence','update') then raise exception 'fixture_write_privilege'; end if;
 if not exists(select 1 from pg_policies where schemaname='fixture' and tablename='evidence' and policyname='tenant_read') then raise exception 'fixture_rls_missing'; end if;
 begin insert into fixture.evidence values(1,'tenant-a','duplicate','invalid',now());raise exception 'fixture_duplicate_allowed';exception when unique_violation then null;end;
end $$;
set role noshashi_restore_fixture_reader;
set fixture.tenant='tenant-a';
do $$ begin
 if fixture.visible_count()<>2 or exists(select 1 from fixture.evidence where tenant='tenant-b') then raise exception 'fixture_tenant_isolation'; end if;
 begin update fixture.evidence set payload='unauthorized';raise exception 'fixture_update_allowed';exception when insufficient_privilege then null;end;
end $$;
SQL
printf '%s\n' 'not a PostgreSQL archive' | pg pg_restore --list > "$tmp/bad-archive.out" 2>"$tmp/bad-archive.err" && { echo 'FAILED: invalid archive accepted'; exit 1; }
mkdir "$tmp/artifacts"
cp "$tmp/backup.gpg" "$tmp/artifacts/synthetic.dump.gpg"
# Exercise the exact workflow entry point with synthetic contents only.
PASSPHRASE="$(cat "$tmp/passphrase")" bash "$(dirname "$0")/restore-backup-scratch.sh" "$container" "$tmp/artifacts"
echo "SYNTHETIC ENCRYPTED RESTORE PASSED (PostgreSQL $major; $(( $(date +%s) - start )) seconds; digest, ACL, RLS, constraints, functions and failure checks)"

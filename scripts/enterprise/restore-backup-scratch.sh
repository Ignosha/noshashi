#!/usr/bin/env bash
# Production backup contents are private even when this workflow is public.
set -euo pipefail
container="${1:?scratch container required}"
backup_dir="${2:?encrypted artifact directory required}"
[[ "$container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || exit 2
[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container")" = none ] || { echo 'BLOCKED: recovery target must be isolated'; exit 2; }
[ "$(docker inspect --format '{{index .Config.Labels "noshashi.test-only"}}' "$container")" = true ] || { echo 'BLOCKED: target must be labelled test-only'; exit 2; }
[ -n "${PASSPHRASE:-}" ] || { echo '::error::BACKUP_PASSPHRASE is not set'; exit 1; }
umask 077
tmp="$(mktemp -d)"
export GNUPGHOME="$tmp/gnupg"
mkdir -m 700 "$GNUPGHOME"
cleanup() {
 gpgconf --homedir "$GNUPGHOME" --kill all >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
mapfile -d '' backups < <(find "$backup_dir" -type f -name '*.dump.gpg' -print0)
[ "${#backups[@]}" -eq 1 ] || { echo '::error::Expected exactly one encrypted backup'; exit 1; }
if ! gpg --batch --yes --quiet --no-symkey-cache --pinentry-mode loopback --passphrase-fd 3 \
 --output "$tmp/restore.dump" --decrypt "${backups[0]}" 3<<<"$PASSPHRASE" 2>"$tmp/decrypt.err"; then
 echo '::error::Backup decryption failed; no restore attempted'; exit 1
fi
unset PASSPHRASE
pg() { docker exec -i -u postgres "$container" "$@"; }
if ! pg createdb noshashi_restore_check >"$tmp/create.out" 2>"$tmp/create.err"; then
 echo '::error::Fresh recovery database could not be created'; exit 1
fi
# These are role stubs, not a recreation of Supabase platform services.
if ! pg psql -d postgres -q -v ON_ERROR_STOP=1 >"$tmp/setup.out" 2>"$tmp/setup.err" <<'SQL'
do $$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin','dashboard_user'] loop
  if not exists(select 1 from pg_roles where rolname=r) then execute format('create role %I nologin',r); end if;
 end loop;
end $$;
SQL
then echo '::error::Recovery target setup failed'; exit 1; fi
# Preserve grants and RLS. Stop on the first failure instead of masking errors.
if ! pg pg_restore --exit-on-error --no-owner --dbname=noshashi_restore_check < "$tmp/restore.dump" >"$tmp/restore.out" 2>"$tmp/restore.err"; then
 echo '::error::Restore failed. Validate platform extensions/roles and backup compatibility in a private environment; raw errors withheld.'; exit 1
fi
rm "$tmp/restore.dump"
if ! pg psql -d noshashi_restore_check -q -v ON_ERROR_STOP=1 >"$tmp/check.out" 2>"$tmp/check.err" <<'SQL'
do $$ begin
 if to_regclass('auth.users') is null then raise exception 'required_auth_table_missing'; end if;
 if not exists(select 1 from information_schema.tables where table_schema='noshashi' and table_type='BASE TABLE') then raise exception 'required_application_tables_missing'; end if;
end $$;
SQL
then echo '::error::Restored snapshot is missing required application objects'; exit 1; fi
echo 'STRICT SNAPSHOT RESTORE PASSED; platform services and operational recovery remain separate checks'

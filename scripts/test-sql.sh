#!/usr/bin/env bash
# Database tests on a throwaway Postgres: tests/sql/*.test.sql.
#
#   scripts/test-sql.sh postgresql://postgres:pw@localhost:5432/postgres
#
# Creates a fresh database next to the one in the URL, gives it the parts of
# Supabase the schema needs (tests/sql/supabase-stubs.sql), applies the
# schema baseline and every later migration, then runs each test. Never
# point this at the production database: it refuses any non-local host.
#
# Migrations that need Supabase-only extensions (pg_cron, pg_net, vault)
# fail on plain Postgres and are counted, not fatal. The migrations a test
# names on its first line ("-- needs: <file>") must apply cleanly.
set -euo pipefail

url="${1:-${DATABASE_URL:-}}"
[ -n "$url" ] || { echo "usage: $0 <postgres url>" >&2; exit 2; }
refuse_target() {
  echo "Supply a PostgreSQL URL for loopback TCP or a local Unix socket. Tests create and drop a scratch database." >&2
  exit 2
}

# Validate the URL authority separately from credentials, paths and options.
# libpq query options and environment variables can otherwise override it.
authority_url="${url%%\?*}"
tcp_url='^postgres(ql)?://([^/@?#[:space:]]+@)?(localhost|127[.]0[.]0[.]1|\[::1\])(:[0-9]+)?/[^/?#[:space:]]+$'
socket_url='^postgres(ql)?:///[^/?#[:space:]]+$'
if [[ "$url" =~ [[:space:]#] ]] ||
   [[ ! "$authority_url" =~ $tcp_url && ! "$authority_url" =~ $socket_url ]]; then
  refuse_target
fi
if [[ "$url" == *\?* ]]; then
  IFS='&' read -r -a query_options <<< "${url#*\?}"
  for option in "${query_options[@]}"; do
    case "$option" in
      application_name=*|connect_timeout=*|sslmode=*) ;;
      host=/*)
        # Keep this a single literal socket path. A comma is a libpq host list.
        if [[ ! "$authority_url" =~ $socket_url || "${option#host=}" =~ [,%?#[:space:]] ]]; then
          refuse_target
        fi ;;
      *) refuse_target ;;
    esac
  done
fi

# Use an explicit local host from the URL or libpq's default local socket.
unset PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE

root="$(cd "$(dirname "$0")/.." && pwd)"
db="noshashi_sqltest_$$"
psql "$url" -qAtc "create database $db" >/dev/null
trap 'psql "$url" -qAtc "drop database if exists $db with (force)" >/dev/null' EXIT

# Same server and credentials as the URL, switched to the scratch database.
on() { psql "$url" -q -v ON_ERROR_STOP=1 -c "\\connect $db" "$@"; }
run() { on -f "$1" >/dev/null 2>"$root/.sqltest.err"; }

run "$root/tests/sql/supabase-stubs.sql"
run "$root/supabase/history/20260914_noshashi_schema_baseline.sql" || { echo "baseline failed:"; cat "$root/.sqltest.err"; exit 1; }

skipped=0
declare -A failed=()
for file in "$root"/supabase/migrations/*.sql; do
  name="$(basename "$file")"
  [[ "$name" > "20260914" ]] || continue
  if ! run "$file"; then skipped=$((skipped + 1)); failed[$name]=1; fi
done
echo "Migration check complete. $skipped did not apply fully on local PostgreSQL: ${!failed[*]}"

status=0
for test in "$root"/tests/sql/*.test.sql; do
  needs="$(sed -n 's/^-- needs: //p' "$test" | head -1)"
  for need in $needs; do
    if [ -n "${failed[$need]:-}" ]; then echo "FAIL $(basename "$test"): migration $need did not apply"; status=1; continue 2; fi
  done
  if on -f "$test" >"$root/.sqltest.err" 2>&1; then
    grep -o "NOSHREPAIR SQL TEST PASSED\|[A-Z ]*TEST PASSED" "$root/.sqltest.err" | head -1 || echo "PASS $(basename "$test")"
  else
    echo "FAIL $(basename "$test")"; grep -E "FAILED|ERROR|got:|expected:" "$root/.sqltest.err" || true
    status=1
  fi
done
rm -f "$root/.sqltest.err"
exit $status

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
case "$url" in
  *@localhost[:/]*|*@127.0.0.1[:/]*|*host=/*|postgresql:///*) ;;
  *) echo "Refusing a non-local database: tests create and drop databases." >&2; exit 2 ;;
esac

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
echo "migrations applied; $skipped need Supabase-only extensions and were skipped: ${!failed[*]}"

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

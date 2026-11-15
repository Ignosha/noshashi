#!/usr/bin/env bash
# Full local Supabase services, synthetic data, no production credentials.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
command -v supabase >/dev/null
umask 077
tmp="$(mktemp -d)"
project=noshashi-enterprise-ci
network=noshashi-enterprise-isolated
container=supabase_db_$project
cleanup() {
 (cd "$tmp" && supabase stop --no-backup) > /dev/null 2>&1 || true
 docker network rm "$network" > /dev/null 2>&1 || true
 rm -rf "$tmp"
}
# Refuse collisions before installing a cleanup trap that could remove them.
if docker network inspect "$network" >/dev/null 2>&1 || docker inspect "$container" >/dev/null 2>&1; then
 echo 'BLOCKED: disposable platform namespace is already in use'; exit 2
fi
trap cleanup EXIT
cd "$tmp"
supabase init > "$tmp/init.log" 2>&1
python3 - "$tmp/supabase/config.toml" "$project" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]);s=p.read_text()
s=re.sub(r'^project_id = .*$', 'project_id = "'+sys.argv[2]+'"',s,flags=re.M)
s=s.replace('schemas = ["public", "graphql_public"]','schemas = ["public", "graphql_public", "noshashi"]')
p.write_text(s)
PY
docker network create --internal "$network" >/dev/null
# CLI downloads official pinned images on the host. Runtime containers have no
# outbound route. Do not use --ignore-health-check or copy owner env files.
if ! supabase start --network-id "$network" -x studio,pgadmin,postgres-meta,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,inbucket > "$tmp/start.log" 2>&1; then
 echo 'FAILED: isolated Supabase startup; review CLI/runtime compatibility'
 # Only service startup errors, never status output containing local keys.
 grep -E 'Error response|Error:|failed to|unhealthy|Invalid' "$tmp/start.log" | head -8 || true
 exit 1
fi
[ "$(docker network inspect -f '{{.Internal}}' "$network")" = true ]
pg() { docker exec -i "$container" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
# Avoid scheduled network jobs even though runtime egress is already blocked.
pg -c "alter system set cron.launch_active_jobs=off" > "$tmp/cron.log" 2>&1
pg -c 'select pg_reload_conf()' >> "$tmp/cron.log" 2>&1
apply() {
 local file="$1"
 if ! pg < "$file" > "$tmp/sql.out" 2> "$tmp/sql.err"; then
  echo "FAILED: $(basename "$file")"
  # Only synthetic schema migrations run here, never customer dumps.
  grep -m1 'ERROR:' "$tmp/sql.err" | cut -c1-350 || true
  exit 1
 fi
}
apply "$root/supabase/history/20260914_noshashi_schema_baseline.sql"
count=0
for file in "$root"/supabase/migrations/*.sql; do
 name="$(basename "$file")"
 [[ "$name" > 20260914 ]] || continue
 apply "$file"
 count=$((count+1))
done
echo "STRICT PLATFORM MIGRATIONS PASSED ($count; no skipped migrations)"
for test in "$root"/tests/sql/*.test.sql; do apply "$test"; echo "PASS $(basename "$test")"; done
# Exercise actual Auth and PostgREST, not mocks. Never print generated keys.
supabase status -o json > "$tmp/status.json" 2> "$tmp/status.err"
python3 "$root/scripts/enterprise/platform-http.py" "$tmp/status.json" "$root/artifacts/platform-validation"
bash "$root/scripts/enterprise/test-platform-recovery.sh" "$container"
# Service startup readiness is checked by the HTTP verifier before new sign-ins.
python3 "$root/scripts/enterprise/platform-http.py" "$tmp/status.json" "$root/artifacts/platform-validation/restored"
echo 'PLATFORM VALIDATION PASSED (synthetic; no production recovery or capacity claim)'

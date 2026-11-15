#!/usr/bin/env bash
# Full local Supabase services, synthetic data, no production credentials.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
command -v supabase >/dev/null
umask 077
tmp="$(mktemp -d)"
project=noshashi-enterprise-ci
network=noshashi-enterprise-isolated
subnet=172.30.241.0/24
chain=NOSHASHI_TEST
# Scoped firewall rules are permitted only on a disposable CI runner.
[ "${GITHUB_ACTIONS:-}" = true ] || { echo 'BLOCKED: requires a disposable GitHub runner'; exit 2; }
sudo -n true
container=supabase_db_$project
cleanup() {
 (cd "$tmp" && supabase stop --no-backup) > /dev/null 2>&1 || true
 docker network rm "$network" > /dev/null 2>&1 || true
 sudo -n iptables -D DOCKER-USER -s "$subnet" -j "$chain" >/dev/null 2>&1 || true
 sudo -n iptables -D INPUT -s "$subnet" -m conntrack --ctstate NEW -j REJECT >/dev/null 2>&1 || true
 sudo -n iptables -F "$chain" >/dev/null 2>&1 || true
 sudo -n iptables -X "$chain" >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
# Refuse collisions before installing a cleanup trap that could remove them.
if docker network inspect "$network" >/dev/null 2>&1 || docker inspect "$container" >/dev/null 2>&1 || sudo -n iptables -S "$chain" >/dev/null 2>&1; then
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
# Docker --internal also blocks CLI loopback health ports. Use a dedicated
# bridge with scoped NEW-egress denial; established host health probes still work.
# PostgREST requires every exposed schema to exist before its health check.
# Only the empty API schema is bootstrapped here; application migrations run
# later after scheduled work and runtime egress have been disabled.
mkdir -p "$tmp/supabase/migrations"
printf '%s\n' 'create schema if not exists noshashi;' > "$tmp/supabase/migrations/20260913000000_api_schema.sql"
docker network create --subnet "$subnet" --label noshashi.test-only=true "$network" >/dev/null
sudo -n iptables -N "$chain"
sudo -n iptables -A "$chain" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
sudo -n iptables -A "$chain" -d "$subnet" -j RETURN
sudo -n iptables -A "$chain" -j REJECT
sudo -n iptables -I DOCKER-USER 1 -s "$subnet" -j "$chain"
sudo -n iptables -I INPUT 1 -s "$subnet" -m conntrack --ctstate NEW -j REJECT
# CLI downloads official pinned images on the host. Runtime containers cannot initiate
# connections outside their test subnet. Do not use --ignore-health-check or copy owner env files.
if ! supabase start --network-id "$network" -x studio,pgadmin,postgres-meta,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,inbucket > "$tmp/start.log" 2>&1; then
 echo 'FAILED: isolated Supabase startup; review CLI/runtime compatibility'
 # Only service startup errors, never status output containing local keys.
 python3 - "$tmp/start.log" <<'PYLOG'
import pathlib,re,sys
for line in pathlib.Path(sys.argv[1]).read_text(errors='replace').splitlines()[-35:]:
 if re.search(r'secret|token|password|key|database.url|api.url',line,re.I): continue
 line=re.sub(r'eyJ[A-Za-z0-9_.-]+','[redacted]',line)
 line=re.sub(r'(postgres(?:ql)?://)[^@\s]+@',r'\1[redacted]@',line)
 print(line[:500])
PYLOG
 exit 1
fi
sudo -n iptables -C DOCKER-USER -s "$subnet" -j "$chain"
sudo -n iptables -C INPUT -s "$subnet" -m conntrack --ctstate NEW -j REJECT
# Verify actual TCP egress refusal, not only firewall text.
docker exec "$container" bash -ec 'command -v timeout >/dev/null; if timeout 3 bash -c "exec 3<>/dev/tcp/1.1.1.1/443" 2>/dev/null; then exit 1; fi'
echo 'Runtime egress denial verified'
pg() { docker exec -i "$container" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
# Avoid scheduled network jobs even though runtime egress is already blocked.
# Supabase's application postgres role is intentionally not the platform
# superuser. Use the local platform role only for disposable server settings.
admin() { docker exec -i "$container" psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
if ! admin -c 'create extension if not exists pg_cron' > "$tmp/cron.log" 2>&1 || ! admin -c "alter system set cron.launch_active_jobs=off" >> "$tmp/cron.log" 2>&1; then
 echo 'FAILED: could not disable scheduled test jobs'; grep -m1 'ERROR:' "$tmp/cron.log" | cut -c1-350 || true; exit 1
fi
admin -c 'select pg_reload_conf()' >> "$tmp/cron.log" 2>&1
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
pg -c "notify pgrst, 'reload schema'" > "$tmp/reload.log" 2>&1
# Exercise actual Auth and PostgREST, not mocks. Never print generated keys.
supabase status -o json > "$tmp/status.json" 2> "$tmp/status.err"
python3 "$root/scripts/enterprise/platform-http.py" "$tmp/status.json" "$root/artifacts/platform-validation"
bash "$root/scripts/enterprise/test-platform-recovery.sh" "$container"
# Service startup readiness is checked by the HTTP verifier before new sign-ins.
python3 "$root/scripts/enterprise/platform-http.py" "$tmp/status.json" "$root/artifacts/platform-validation/restored"
for test in "$root"/tests/sql/*.test.sql; do apply "$test"; echo "RESTORED PASS $(basename "$test")"; done
# Store only aggregate resource evidence; never container environment or keys.
docker stats --no-stream --format '{{json .}}' "$container" | python3 -c '
import json,pathlib,sys
x=json.load(sys.stdin)
p=pathlib.Path(sys.argv[1]);p.parent.mkdir(parents=True,exist_ok=True)
p.write_text(json.dumps({"scope":"single synthetic database observation; not peak usage","cpu_percent":x["CPUPerc"],"memory":x["MemUsage"]},indent=2)+"\n")
' "$root/artifacts/platform-validation/resources.json"
echo 'PLATFORM VALIDATION PASSED (synthetic; no production recovery or capacity claim)'

#!/usr/bin/env python3
"""Bounded local Auth/PostgREST checks. Never output credentials or bodies."""
import concurrent.futures
import json
import math
import pathlib
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


def run(status_path, output_dir):
    status = json.loads(pathlib.Path(status_path).read_text())
    base = status['API_URL'].rstrip('/')
    parsed = urllib.parse.urlparse(base)
    if parsed.hostname not in ('127.0.0.1', 'localhost') or parsed.scheme != 'http':
        raise RuntimeError('local_api_required')
    anon, service = status['ANON_KEY'], status['SERVICE_ROLE_KEY']
    # Ignore system proxy configuration: requests stay on this test host.
    client = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(method, path, key, token=None, data=None, expected=(200,)):
        headers = {'apikey': key, 'Authorization': 'Bearer ' + (token or key),
                   'Content-Type': 'application/json'}
        if path.startswith('/rest/'):
            headers.update({'Accept-Profile': 'noshashi', 'Content-Profile': 'noshashi'})
        req = urllib.request.Request(base + path, method=method, headers=headers,
                                     data=None if data is None else json.dumps(data).encode())
        try:
            with client.open(req, timeout=10) as response:
                code, body = response.status, response.read(1_000_001)
        except urllib.error.HTTPError as error:
            code, body = error.code, error.read(1_000_001)
        if code not in expected or len(body) > 1_000_000:
            # Bodies can contain JWTs. Never include them in diagnostics.
            raise RuntimeError('unexpected_http_status_' + str(code))
        return code, json.loads(body) if body else None

    # A restarted local service must become healthy within a bounded window.
    ready = False
    for _ in range(30):
        try:
            request('GET', '/auth/v1/health', anon)
            ready = True
            break
        except (RuntimeError, urllib.error.URLError, TimeoutError):
            time.sleep(1)
    if not ready:
        raise RuntimeError('auth_readiness_timeout')

    # Service creation confirms test emails without dispatching email.
    users = []
    for _ in range(2):
        email = 'platform-' + uuid.uuid4().hex + '@example.invalid'
        password = secrets.token_urlsafe(32) + 'aA1!'
        _, account = request('POST', '/auth/v1/admin/users', service,
                             data={'email': email, 'password': password, 'email_confirm': True})
        _, session = request('POST', '/auth/v1/token?grant_type=password', anon,
                             data={'email': email, 'password': password})
        assert account['id'] == session['user']['id'], 'auth_identity_mismatch'
        users.append((account['id'], session))
    orgs = [str(uuid.uuid4()), str(uuid.uuid4())]
    request('POST', '/rest/v1/organizations', service, data=[
        {'id': org, 'name': 'Synthetic validation tenant', 'slug': 'fixture-' + uuid.uuid4().hex}
        for org in orgs], expected=(201,))
    request('POST', '/rest/v1/organization_members', service, data=[
        {'organization_id': org, 'account_id': user[0], 'role': 'owner'}
        for org, user in zip(orgs, users)], expected=(201,))
    for index, (_, session) in enumerate(users):
        _, records = request('GET', '/rest/v1/organizations?select=id', anon, session['access_token'])
        assert [row['id'] for row in records] == [orgs[index]], 'tenant_isolation_failed'
        _, records = request('PATCH', '/rest/v1/organizations?id=eq.' + orgs[1-index], anon,
                             session['access_token'], {'name': 'unauthorized'}, expected=(200, 204))
        # RLS may return no representation, so verify the protected row via owner read.
        _, rows = request('GET', '/rest/v1/organizations?select=id,name&id=eq.' + orgs[1-index],
                          anon, users[1-index][1]['access_token'])
        assert len(rows) == 1 and rows[0]['name'] != 'unauthorized', 'cross_tenant_write'
    request('GET', '/rest/v1/organizations?select=id', anon, expected=(401, 403))
    request('GET', '/rest/v1/organizations?select=id', anon, 'invalid-token', expected=(401,))
    # An authenticated user cannot invoke the service-only terminal permission RPC.
    request('POST', '/rest/v1/rpc/terminal_access', anon, users[0][1]['access_token'],
            {'p_account': users[1][0]}, expected=(401, 403, 404))

    # Small, bounded workload validates responses as well as timing them. It is
    # an isolated baseline, not a production load test or enterprise SLA.
    samples, concurrency = 240, 8
    def sample(index):
        owner = index % len(users)
        start = time.perf_counter()
        _, rows = request('GET', '/rest/v1/organizations?select=id', anon,
                          users[owner][1]['access_token'])
        assert [row['id'] for row in rows] == [orgs[owner]], 'workload_tenant_leak'
        return (time.perf_counter() - start) * 1000
    start = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        latencies = sorted(pool.map(sample, range(samples)))
    elapsed = time.perf_counter() - start
    def percentile(p):
        return round(latencies[max(0, math.ceil(len(latencies)*p)-1)], 3)
    # Revoked refresh credentials must stop refreshing; access JWT expiration is
    # separate and this check makes no claim of instantaneous access revocation.
    session = users[0][1]
    request('POST', '/auth/v1/logout', anon, session['access_token'], expected=(204,))
    request('POST', '/auth/v1/token?grant_type=refresh_token', anon,
            data={'refresh_token': session['refresh_token']}, expected=(400, 401, 403))
    output = pathlib.Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    metrics = {'schema': 'noshashi.synthetic-platform-benchmark.v1',
               'scope': 'local Auth/PostgREST, two tenants; not production capacity',
               'requests': samples, 'concurrency': concurrency,
               'duration_seconds': round(elapsed, 3),
               'p50_ms': percentile(.50), 'p95_ms': percentile(.95), 'p99_ms': percentile(.99),
               'requests_per_second': round(samples/elapsed, 3), 'errors': 0,
               'checks': ['real_auth_signin', 'tenant_read_isolation', 'tenant_write_isolation',
                          'anonymous_denial', 'invalid_jwt_denial', 'privileged_rpc_denial',
                          'refresh_revocation']}
    (output / 'http-benchmark.json').write_text(json.dumps(metrics, indent=2) + '\n')
    print(json.dumps(metrics))


if __name__ == '__main__':
    try:
        run(*sys.argv[1:])
    except Exception as error:
        # Do not serialize request bodies, sessions, credentials or provider text.
        print('FAILED: local platform HTTP validation (' + type(error).__name__ + ': ' +
              (str(error) if isinstance(error, (RuntimeError, AssertionError)) else 'details withheld') + ')')
        sys.exit(1)

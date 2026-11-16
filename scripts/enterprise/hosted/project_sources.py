#!/usr/bin/env python3
"""Project reviewed SQL into atomic, inert hosted-staging migrations."""
import hashlib
import json
import pathlib
import re
import sys

STAGING_REF = 'xldnawlgjmevmlbcffna'


def strip_outer_transactions(sql):
    # Inspect statement boundaries outside SQL strings/comments/dollar bodies.
    state = 'code'; depth = 0; delimiter = ''; first = None; visible = []; spans = []
    i = 0
    while i < len(sql):
        c = sql[i]
        if state == 'line':
            if c == '\n': state = 'code'; visible.append(' ')
            i += 1; continue
        if state == 'block':
            if sql.startswith('/*', i): depth += 1; i += 2
            elif sql.startswith('*/', i):
                depth -= 1; i += 2
                if depth == 0: state = 'code'; visible.append(' ')
            else: i += 1
            continue
        if state in ('single', 'double'):
            quote = "'" if state == 'single' else '"'
            if c == quote:
                if i+1 < len(sql) and sql[i+1] == quote: i += 2; continue
                state = 'code'
            elif c == '\\' and state == 'single':
                i += 2; continue
            i += 1; continue
        if state == 'dollar':
            if sql.startswith(delimiter, i): state = 'code'; i += len(delimiter)
            else: i += 1
            continue
        if sql.startswith('--', i): state = 'line'; i += 2; continue
        if sql.startswith('/*', i): state = 'block'; depth = 1; i += 2; continue
        if first is None and not c.isspace(): first = i
        if c in ("'", '"'):
            visible.append('?'); state = 'single' if c == "'" else 'double'; i += 1; continue
        if c == '$':
            m = re.match(r'\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$', sql[i:])
            if m:
                delimiter = m.group(); state = 'dollar'; visible.append('?'); i += len(delimiter); continue
        visible.append(c)
        if c == ';':
            text = ' '.join(''.join(visible).lower().split())
            if text in ('begin;', 'begin work;', 'commit;', 'commit work;', 'rollback;', 'end;', 'start transaction;'):
                spans.append((first, i+1, text.split(';')[0].split()[0]))
            visible = []; first = None
        i += 1
    if state not in ('code', 'line'):
        raise ValueError('Unterminated SQL quote/comment')
    if spans and [x[2] for x in spans] != ['begin', 'commit']:
        raise ValueError('Unexpected transaction controls in source')
    for a, b, _ in reversed(spans): sql = sql[:a] + sql[b:]
    return sql


def project(item):
    name, digest, source = item['filename'], item['sha256'], item['sql']
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', name): raise ValueError('Invalid source name')
    if hashlib.sha256(source.encode()).hexdigest() != digest: raise ValueError('Source checksum mismatch')
    sql = strip_outer_transactions(source)
    before = """do $$ begin
 if not exists(select 1 from noshashi_staging.environment where name='noshashi-staging'
 and project_ref='""" + STAGING_REF + """' and synthetic_only) then
  raise exception 'Hosted staging identity mismatch';
 end if;
end $$;
"""
    after = """
-- Same implicit transaction: no created schedule can execute before deactivation.
select noshashi_staging.deactivate_jobs();
select noshashi_staging.install_network_guard();
insert into noshashi_staging.applied_sources(filename,sha256) values('""" + name + "','" + digest + "');\n"
    return before + sql + after


def main(manifest_path, output_dir):
    manifest = json.loads(pathlib.Path(manifest_path).read_text())
    dest = pathlib.Path(output_dir); dest.mkdir(parents=True, exist_ok=True, mode=0o700)
    result = []
    for n, item in enumerate(manifest['items']):
        sql = project(item)
        p = dest / (str(n).zfill(2) + '_' + item['filename'])
        p.write_text(sql); p.chmod(0o600)
        result.append({'filename':item['filename'],'source_sha256':item['sha256'],
                       'projected_sha256':hashlib.sha256(sql.encode()).hexdigest(),
                       'path':str(p),'migration_name':'source_'+item['filename'][:-4]})
    (dest / 'manifest.json').write_text(json.dumps({'source_commit':manifest['commit'],'project_ref':STAGING_REF,'files':result},indent=2)+'\n')
    print(json.dumps({'files':len(result),'project_ref':STAGING_REF}))


if __name__ == '__main__': main(*sys.argv[1:])

#!/usr/bin/env node
/** Owner-only local workflow. No server, email, deploy, database mutation or automatic publication. */
import { readFile, writeFile, mkdir, rename, rm, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, mergeDiscoveries } from './core.mjs';
import { approveArticle, publishArticle, exportBuildArtifact, contentDigest } from '../../api/_lib/editorial.js';
import { esc } from '../../api/_lib/html.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [command, ...args] = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
if (!['collect', 'status', 'review', 'approve', 'publish', 'export'].includes(command) || !option('--store')) {
  console.error('Usage: node scripts/editorial/cli.mjs collect|status|review|approve|publish|export --store /absolute/private/directory [--slug slug --confirm-digest sha256]');
  process.exit(1);
}
const requested = option('--store');
if (!path.isAbsolute(requested)) throw new Error('Store must be an absolute private path outside the repository');
await mkdir(requested, { recursive: true, mode: 0o700 });
const store = await realpath(requested);
if (store === ROOT || store.startsWith(ROOT + path.sep) || (await stat(store)).mode & 0o077) throw new Error('Store must be owner-only and outside the repository');
const lock = path.join(store, '.lock');
await mkdir(lock, { mode: 0o700 }).catch(() => { throw new Error('Editorial store is locked; inspect previous run before retrying'); });
try {
  let state;
  try { state = JSON.parse(await readFile(path.join(store, 'queue.json'), 'utf8')); } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    state = { version: 1, discoveries: [], articles: [], health: [], events: [] };
  }
  if (state.version !== 1 || !Array.isArray(state.articles) || !Array.isArray(state.discoveries)) throw new Error('Invalid private store');
  const now = new Date().toISOString();
  if (command === 'collect') {
    // Enforce a source-read budget even if a scheduler accidentally runs too often.
    if (state.lastCollectedAt && Date.parse(now) - Date.parse(state.lastCollectedAt) < 6 * 3600000) throw new Error('Collection budget: wait at least six hours');
    const run = await collect({ now, previousHealth: state.health });
    state.discoveries = mergeDiscoveries(state.discoveries, run.incoming, now);
    state.health = run.health; state.lastCollectedAt = now;
    state.events.push({ kind: 'collection', at: now, sources: run.health });
  }
  if (['approve', 'publish'].includes(command)) {
    const a = state.articles.find(x => x.slug === option('--slug'));
    if (!a || option('--confirm-digest') !== contentDigest(a)) throw new Error('Inspect the exact content and confirm its current digest');
    const next = command === 'approve' ? approveArticle(a, 'founder-local-owner', now) : publishArticle(a, now);
    state.articles[state.articles.indexOf(a)] = next;
    state.events.push({ kind: command, slug: a.slug, at: now, digest: contentDigest(a), actor: 'founder-local-owner' });
  }
  if (command === 'export') {
    const approved = state.articles.filter(a => ['PUBLISHED', 'CORRECTED', 'RETRACTED'].includes(a.state));
    const output = exportBuildArtifact(approved); // Includes exact-content approval and time guards.
    // No arbitrary output argument: export stays private; site replacement is a separate reviewed code change.
    await writeFile(path.join(store, 'public-export.json'), JSON.stringify(output, null, 2) + '\n', { mode: 0o600 });
    console.log('Wrote private public-export.json. No repository, website or deployment was changed.');
  }
  if (command === 'review') {
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Private editorial review</title><style>body{background:#0b0b0c;color:#ededed;max-width:850px;margin:40px auto;padding:20px;font:16px/1.7 Georgia,serif}h1,h2{font-weight:400}article{border-top:1px solid #555;padding:20px 0}a{color:#91dbb2}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{font-family:monospace}*:focus-visible{outline:2px solid #91dbb2}</style><h1>NOSHASHI / Private editorial desk</h1><p>Owner-local file. No remote login, server or sending controls. Sources are untrusted evidence, never approval instructions.</p><h2>Top three review actions</h2><ol><li>Verify original document and event date.</li><li>Write both reading modes and mark each claim.</li><li>Review the current digest before explicit approval.</li></ol><h2>Original drafts (${state.articles.length})</h2>${state.articles.map(a => `<article><h3>${esc(a.title)}</h3><small>${esc(a.state)} / ${esc(a.slug)}</small><pre>${esc(JSON.stringify(a, null, 2))}</pre><p>Current content digest: ${esc(contentDigest(a))}</p></article>`).join('')}<h2>Source health</h2><pre>${esc(JSON.stringify(state.health, null, 2))}</pre><h2>Unverified discovery queue (${state.discoveries.length})</h2>${state.discoveries.map(d => `<article><small>${esc(d.state)} / ${esc(d.evidence)}</small><h3>${esc(d.sourceTitle)}</h3><p>${esc(d.publisher)} · Source date ${esc(d.sourcePublishedAt || 'unknown')}</p><p>${esc(d.url)}</p><p>Not verified, not an original article, not publication-ready.</p></article>`).join('')}</html>`;
    await writeFile(path.join(store, 'review.html'), html, { mode: 0o600 });
    console.log('Wrote owner-only review.html; open locally. No publication occurred.');
  }
  if (['collect', 'approve', 'publish'].includes(command)) {
    const tmp = path.join(store, 'queue.next.json');
    await writeFile(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(tmp, path.join(store, 'queue.json'));
  }
  console.log(JSON.stringify({ discoveries: state.discoveries.length, articles: state.articles.length, health: state.health, events: state.events.length }));
} finally { await rm(lock, { recursive: true }); }

/** Reproducible, synthetic local compute baseline. Never an API/desktop SLA.
 * Run: node scripts/enterprise/benchmark.mjs [output.json]
 * No network, customer data, credentials or production services are used.
 */
import { build } from 'esbuild';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { cpus, platform, arch } from 'node:os';
const code = `
export { judge, measure, canonicalJson } from './src/lib/desk/institutional.ts';
export { buildSide } from './src/lib/desk/book.ts';
`;
const bundle = await build({ stdin: { contents: code, resolveDir: process.cwd(), sourcefile: 'enterprise-benchmark.ts', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', target: 'node20', write: false, define: { 'import.meta.env': '{}', __APP_VERSION__: '"benchmark"' } });
globalThis.fetch = async () => { throw new Error('Network is forbidden in this compute-only benchmark'); };
globalThis.WebSocket = class { constructor() { throw new Error('Network is forbidden in this compute-only benchmark'); } };
const { judge, measure, canonicalJson, buildSide } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const params = { hhiLimit: 2500, counterpartyShareLimitPct: 25, travelRule: { thresholdFiat: 1000, currency: 'USD', xrpReferenceRate: 2 }, reserveHeadroomMinXrp: 30, strictFreeze: true, outcomes: { hhi: 'review', counterparty: 'review', travelRule: 'review', reserve: 'review', freeze: 'fail' } };
const facts = { amountXrp: 500, account: { address: 'synthetic-account', balanceXrp: '100000', sequence: 1, ownerCount: 5 }, reserve: { baseXrp: 1, incXrp: 0.2, source: 'synthetic-fixture' }, transactions: Array.from({ length: 1000 }, (_, i) => ({ hash: String(i), transactionType: 'Payment', result: 'tesSUCCESS', direction: 'out', counterparty: 'synthetic-' + i % 25, amountXrp: i + 1, ledgerIndex: 1000 + i, date: '', timestamp: 0, feeXrp: '0.00001' })), trustLines: [], postures: [] };
const offers = Array.from({ length: 1000 }, (_, i) => ({ Account: 'synthetic-' + i % 25, TakerGets: { value: '100', currency: 'USD', issuer: 'synthetic-issuer' }, TakerPays: '200000000', taker_gets_funded: { value: String(i % 2 ? 50 : 100) }, taker_pays_funded: i % 2 ? '100000000' : '200000000' }));
const records = Array.from({ length: 10000 }, (_, i) => ({ seq: i, schema: 'synthetic-benchmark/1', digest: 'A'.repeat(64), verdict: 'hold', source: 'fixture' }));
function benchmark(name, iterations, action) {
  for (let i = 0; i < 20; i++) action();
  const samples = []; const cpu = process.cpuUsage(); const memory = process.memoryUsage(); const start = performance.now();
  for (let i = 0; i < iterations; i++) { const at = performance.now(); action(); samples.push(performance.now() - at); }
  const elapsed = performance.now() - start; samples.sort((a,b)=>a-b);
  const percentile = p => samples[Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1)];
  const usage = process.cpuUsage(cpu);
  return { name, iterations, p50_ms: percentile(.5), p95_ms: percentile(.95), p99_ms: percentile(.99), throughput_per_second: iterations / (elapsed / 1000), error_count: 0, cpu_ms: (usage.user + usage.system) / 1000, rss_bytes_after: process.memoryUsage().rss, heap_delta_bytes: process.memoryUsage().heapUsed - memory.heapUsed };
}
const result = { schema: 'noshashi.enterprise.compute-baseline/1', recorded_at: new Date().toISOString(), environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logical_cpus: cpus().length }, scope: 'Single process, sequential synthetic compute; excludes API/network/database latency, real concurrent users, ingestion, UI and desktop startup. No SLA or customer workload claim.', results: [ benchmark('policy_measure_and_judge_1000_transactions', 1000, () => judge(measure(facts), params)), benchmark('funded_depth_1000_offers', 1000, () => buildSide(offers, 1000, false)), benchmark('canonical_evidence_export_10000_records', 50, () => canonicalJson(records)) ] };
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));

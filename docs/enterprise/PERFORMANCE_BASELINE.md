# Local compute baseline

Single process, sequential synthetic compute; excludes API/network/database latency, real concurrent users, ingestion, UI and desktop startup. No SLA or customer workload claim.

Reproduce: `node scripts/enterprise/benchmark.mjs output.json`. Inputs are explicitly synthetic and the benchmark forbids network access. Recorded 2026-11-15 on Linux x64, Node v24.19.0. See [raw aggregate measurements](evidence/compute-baseline.json).

| Workload | p50 ms | p95 ms | p99 ms | operations/s | Errors |
|---|---:|---:|---:|---:|---:|
| policy_measure_and_judge_1000_transactions | 0.736 | 1.367 | 2.616 | 1123.0 | 0 |
| funded_depth_1000_offers | 0.103 | 0.285 | 0.571 | 7230.8 | 0 |
| canonical_evidence_export_10000_records | 34.395 | 97.387 | 169.094 | 24.2 | 0 |

RSS after each workload was approximately 59 MB, 59 MB and 195 MB respectively; this includes the Node process/runtime and allocation history, not an isolated feature peak. CPU and heap deltas are in the JSON. These single-process sequential results do not establish concurrent-user capacity, API or database latency, sustained ingestion, desktop startup/memory, customer workload fit or an enterprise SLA.

No production performance budget is invented. The next measurement needs an owner-approved staging workload, expected tenant sizes/concurrency, export sizes, required response times and failure/error budgets. Compare regressions only on a matched environment/workload; define acceptance thresholds from those measurements and actual buyer requirements.

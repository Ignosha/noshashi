# Settlement workflow evaluation kit

Local review branch; no deployment, customer contact, upload or paid service provisioning is included.

The browser evaluation at `/settlement-desk/evaluate/` contains five labeled cases: baseline, short delivery, wrong destination tag, unavailable evidence and reused payment reference. Three are enough for an initial 15-minute conversation. Use more only if useful to the reviewer.

The underlying payment is real, archived public XRPL evidence. Invoice expectations are synthetic; the unavailable example deliberately modifies a copy of source metadata. Nothing here asserts a real customer discrepancy. These examples use an issued asset, not native XRP. Real ledger re-fetching happens only when the reviewer explicitly opens the live desk and submits a check.

Feedback stays in page memory and downloads as JSON. Nothing is automatically sent, stored in a public customer database or treated as buying interest. The reviewer chooses whether to share it using the existing contact route. This prevents collecting confidential case data before an evaluation is agreed.

## Fifteen-minute session

1. Ask which payment-review decision the evaluator handles and what their current tools show.
2. Show short-delivery, tag-mismatch and unresolved-source cases. Ask for their decision before suggesting a business action.
3. Ask what evidence helped, what was redundant, what was missing, and whether the normal process already covers it.
4. Compare reviewer effort with their own baseline if they choose to provide one. A user-entered time is not an instrumented benchmark.
5. Ask whether another workflow review or a scoped pilot would be useful. Do not imply agreement, quote unapproved pricing or book a meeting.

## Local reproduction

- Reuse the repository dependencies and build with `npm run site:build`.
- Start preview: `PORT=4347 node scripts/dev-site.mjs`.
- In this managed Cloud workspace, Node must use the supplied network proxy: use Node 24+ with `NODE_USE_ENV_PROXY=1 PORT=4347 node scripts/dev-site.mjs`. Do not copy a hardcoded proxy address into production or disable certificate checking. This flag resolved the earlier local-only RPC failure.
- Live check: `node scripts/verify-settlement-live.mjs http://localhost:4347`. It compares a real public archived payment with a matching synthetic expectation and verifies the returned SHA-256 receipt.
- Browser check: `node scripts/settlement-evaluation-smoke.mjs http://localhost:4347`.

## Walkthrough production

The walkthrough uses actual product screenshots captured at 3840×2160, not a generated product mockup. Source labels and captions distinguish teaching expectations, archived data, synthetic source failure and the explicit real-node read. Local Kokoro `am_michael` narration is synthetic, not a human impersonation, and reuses the voice from previous NOSHASHI tutorials. No paid voice service or generation credits are used.

1. `WALKTHROUGH_DIR=/tmp/noshashi-film node scripts/capture-settlement-walkthrough.mjs http://localhost:4347`
2. In a local Python environment with `kokoro-onnx`, `numpy`, and `onnxruntime`: `python evaluation/narrate.py /tmp/noshashi-film /path/to/model-files`.
3. Model filenames: `kokoro-v1.0.int8.onnx`, `voices-v1.0.bin`, from the existing tutorial workflow's [Kokoro ONNX source](https://github.com/thewh1teagle/kokoro-onnx).
4. `python evaluation/encode-walkthrough.py /tmp/noshashi-film` uses FFmpeg for a 4K master, 1080p preview and WebVTT transcript.

Models, binaries and working media remain outside the public repository. The script/source is reproducible; model availability and local CPU speed affect rendering time. Final publication and outreach need founder approval. No YouTube upload or automatic content schedule is included.

## Commercial and operational boundaries

This is an evaluation of reviewer usefulness, not a promise of payment prevention, fund recovery, accounting correctness, regulatory compliance, legal finality, authenticated multi-user approval or a production SLA. Public node evidence is trusted, not independently verified consensus. Enterprise shared approvals and monitoring remain separately scoped.

No added recurring API subscription, LLM calls or database migration. Static case content adds about 30 KB before compression; feedback export uses no server request. Real ledger checks retain the existing API execution and public-node costs and limits. No measured dollar estimate or production load claim is made.

## Verification for this change

- Targeted Vitest: 67 passed across seven files.
- Full public site build: passed. Unrelated feed/timestamp regenerations excluded from the reviewable change.
- Chromium: new case navigation, retained assessments, feedback export without network submission, 390 px mobile layout and explicit real-node request passed. Existing desk regression also covers review notes, duplicate guarding, filters and JSON evidence export.
- Live API: archived public transaction matched; raw report SHA-256 digest verified. This verifies the local environment only, not production service availability.
- Generated evaluation PDF: four A4 pages, readable text, no PDF JavaScript.
- No production deployment, outreach, YouTube upload, database schema change or pricing change.

Private business-route observations and correspondence remain outside this repository. They are not included in the evaluation JSON, screenshots or video.

/**
 * Check one XRPL transaction from the command line, against live validated
 * ledgers: the same decision POST /v1/check returns.
 *
 *   node --experimental-strip-types tools/presign-guard/check.ts <policy.json> <tx.json | tx-blob-hex>
 *
 * tx.json holds the unsigned transaction as JSON. Prints the answer as JSON
 * and exits 0 for APPROVE, 1 for REJECT, 2 for RETRY, 3 for a usage error.
 */
import { existsSync, readFileSync } from "node:fs";
import { loadPolicy, sha256 } from "./guard.ts";
import { gather } from "./ledger.ts";
import { checkAnswer, checkRequest } from "./server.ts";

const [policyPath, input] = process.argv.slice(2);
if (!policyPath || !input) {
  console.error("Usage: node --experimental-strip-types tools/presign-guard/check.ts <policy.json> <tx.json | tx-blob-hex>");
  process.exit(3);
}
const policyText = readFileSync(policyPath, "utf8");
const body = existsSync(input) ? { tx_json: JSON.parse(readFileSync(input, "utf8")) } : { tx_blob: input };
const decision = await checkRequest(body, {
  policy: loadPolicy(JSON.parse(policyText)),
  policyHash: sha256(policyText),
  cosignerKey: null,
  handlerKey: null,
  gather: (tx) => gather(tx, { deadlineMs: 20_000 }),
  log: () => {},
  now: () => new Date(),
});
console.log(JSON.stringify(checkAnswer(decision), null, 2));
process.exit(decision.action === "APPROVE" ? 0 : decision.action === "REJECT" ? 1 : 2);

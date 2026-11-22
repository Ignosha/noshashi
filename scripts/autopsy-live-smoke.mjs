/**
 * On-demand verification against two independent XRPL RPC services.
 * Strict by design: a provider outage or response disagreement fails this smoke test.
 * Do not run during ordinary unit tests; live servers are outside NOSHASHI's control.
 */
import assert from "node:assert/strict";
import { corroborateAutopsy } from "./autopsy-gateway.mjs";

// Validated historical example from https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/tx
const hash = "C53ECF838647FA5A4C780377025FEC7999AB4182590510CA461444B207AB74A9";
const expectedLedgerHash = "793E56131D8D4ABFB27FA383BFC44F2978B046E023FF46C588D7E0C874C2472A";
const report = await corroborateAutopsy(hash);
console.log(JSON.stringify({ status:report.status, disposition:report.disposition,
  ledgerIndex:report.ledgerIndex, sources:report.evidenceSources, reasonCodes:report.reasonCodes },null,2));
assert.equal(report.status,"VERIFIED_FACT","Two independent XRPL sources must corroborate a validated outcome");
assert.equal(report.disposition,"SUCCESS");
assert.equal(report.resultCode,"tesSUCCESS");
assert.equal(report.ledgerIndex,56865245);
assert.equal(report.ledgerHash,expectedLedgerHash);
assert.equal(report.simulated,false);

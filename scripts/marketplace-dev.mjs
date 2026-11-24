// Local-only marketplace and Autopsy API development server.
// Synthetic fixture data ONLY. Never deploy this as a public API.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const SAMPLE_HASH = "A".repeat(64);
const pagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../site/marketplace/index.html");
const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../site/marketplace/marketplace.js");
const maxBytes = 4096;
export function fixtureAutopsy(body) {
  if (!body || body.network !== "xrpl-mainnet" || typeof body.hash !== "string" || !/^[a-fA-F0-9]{64}$/.test(body.hash) || Object.keys(body).some(k => !["network","hash"].includes(k))) {
    return { code: 400, value: { error: "INVALID_REQUEST", message: "Expected network xrpl-mainnet and a 64-character hexadecimal hash." } };
  }
  const known = body.hash.toUpperCase() === SAMPLE_HASH;
  return { code: 200, value: {
    schema: "noshashi.autopsy.v1", network: "xrpl-mainnet", hash: body.hash.toUpperCase(),
    status: known ? "VERIFIED_FACT" : "UNKNOWN", validated: known,
    ledgerIndex: known ? 90000000 : null, resultCode: known ? "tecNO_DST" : null,
    disposition: known ? "FAILED" : "UNKNOWN",
    reasonCodes: known ? ["tecNO_DST"] : ["TRANSACTION_EVIDENCE_MISSING"],
    evidenceSource: "synthetic-fixture", simulated: true,
  } };
}
export function createDevServer() {
  return http.createServer(async (req,res) => {
    res.setHeader("Cache-Control","no-store");
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Content-Security-Policy","default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'");
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200,{"Content-Type":"application/json"}); res.end(JSON.stringify({ status:"ok", mode:"synthetic-fixtures" })); return;
    }
    if (req.url === "/v1/xrpl/transactions/autopsy" && req.method === "POST") {
      if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        res.writeHead(415,{"Content-Type":"application/json"}); res.end(JSON.stringify({error:"UNSUPPORTED_MEDIA_TYPE"})); return;
      }
      let data = "";
      try {
        for await (const chunk of req) {
          data += chunk;
          if (Buffer.byteLength(data) > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
        }
        const output = fixtureAutopsy(JSON.parse(data));
        res.writeHead(output.code,{"Content-Type":"application/json"}); res.end(JSON.stringify(output.value));
      } catch (error) {
        const large = error instanceof Error && error.message === "PAYLOAD_TOO_LARGE";
        res.writeHead(large ? 413 : 400,{"Content-Type":"application/json"});
        res.end(JSON.stringify({error:large ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON"}));
      }
      return;
    }
    if (req.url === "/marketplace/marketplace.js" && req.method === "GET") {
      const js = await readFile(scriptPath,"utf8");
      res.writeHead(200,{"Content-Type":"text/javascript; charset=utf-8"}); res.end(js); return;
    }
    if ((req.url === "/" || req.url === "/marketplace/" || req.url === "/marketplace/index.html") && req.method === "GET") {
      const html = await readFile(pagePath,"utf8");
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"}); res.end(html); return;
    }
    res.writeHead(404,{"Content-Type":"application/json"}); res.end(JSON.stringify({error:"NOT_FOUND"}));
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.NOSHASHI_MARKETPLACE_DEV_PORT || 1441);
  createDevServer().listen(port,"127.0.0.1",()=>console.log(`Synthetic marketplace development server: http://127.0.0.1:${port}/marketplace/`));
}

#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const DEFAULT_API =
  "https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1/noshashi-payment-review";
const utf8=(a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b));
const canonical = (v) =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v)
          .sort(utf8)
          .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
          .join(",")}}`
      : JSON.stringify(v);
const digest = (v) =>
  createHash("sha256").update(canonical(v)).digest("hex").toUpperCase();
export function verifyReceipt(run) {
  const r = run?.result;
  if (
    !r ||
    r.schema !== "noshashi.payment-review/1" ||
    !Array.isArray(r.reports) ||
    !r.reports.length
  )
    throw new Error("Not a complete Payment Review receipt.");
  if (
    digest({ schema: r.schema, network: r.network, reports: r.reports }) !==
    r.digest
  )
    throw new Error("Batch receipt digest mismatch.");
  for (const report of r.reports)
    if (!report.evidence || digest(report.evidence) !== report.evidence_digest)
      throw new Error("Row evidence digest mismatch.");
  return {
    valid: true,
    rows: r.reports.length,
    notice:
      "Hashes match these exact saved payloads. This does not authenticate the author or independently verify ledger consensus.",
  };
}

export function parseCsv(text) {
  const records = [];
  let quoted = false,
    row = [],
    cell = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && [",", "\r", "\n"].includes(ch)) {
      row.push(cell);
      cell = "";
      if (ch !== ",") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        if (row.some(Boolean)) records.push(row);
        row = [];
      }
    } else cell += ch;
  }
  if (quoted) throw new Error("CSV has an unclosed quote.");
  row.push(cell);
  if (row.some(Boolean)) records.push(row);
  const header = records.shift()?.map((x) => x.replace(/^\uFEFF/, "").trim());
  if (
    !header ||
    new Set(header).size !== header.length ||
    ["hash", "invoice_id", "destination", "expected_amount", "currency"].some(
      (k) => !header.includes(k),
    )
  )
    throw new Error(
      "CSV needs unique hash, invoice_id, destination, expected_amount and currency columns.",
    );
  return {
    rows: records.map((values, i) => {
      if (values.length !== header.length)
        throw new Error(`Wrong column count on CSV row ${i + 2}.`);
      const p = Object.fromEntries(header.map((k, n) => [k, values[n].trim()]));
      if (p.destination_tag && !/^\d+$/.test(p.destination_tag))
        throw new Error("Invalid destination tag.");
      return {
        hash: p.hash,
        invoice: {
          invoice_id: p.invoice_id,
          destination: p.destination,
          expected_amount: p.expected_amount,
          destination_tag: p.destination_tag ? Number(p.destination_tag) : null,
          asset:
            p.currency === "XRP"
              ? { kind: "xrp" }
              : {
                  kind: "issued",
                  currency: p.currency,
                  issuer: p.issuer ?? "",
                },
        },
      };
    }),
  };
}
export async function main(args, env = process.env, fetcher = fetch) {
  const [command, ...rest] = args;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (
      !["--input", "--output", "--request-id", "--run-id"].includes(rest[i]) ||
      !rest[i + 1] ||
      rest[i + 1].startsWith("--")
    )
      throw new Error("Unknown option or missing value. Use --help.");
    if (options[rest[i]]) throw new Error("Duplicate option.");
    options[rest[i]] = rest[i + 1];
  }
  if (!command || command === "--help" || command === "help") {
    return {
      help: "noshashi-review review --input payments.json|csv --request-id UNIQUE_ID [--output review.json]\nnoshashi-review usage\nnoshashi-review runs\nnoshashi-review run --run-id UUID\nnoshashi-review verify-receipt --input review.json\nSet NOSHASHI_REVIEW_KEY in your environment. Never pass keys in command arguments.\nOptional NOSHASHI_REVIEW_API overrides the endpoint. No payment or transaction execution.",
    };
  }
  if (command === "verify-receipt") {
    if (!options["--input"]) throw new Error("Supply --input review.json.");
    return verifyReceipt(
      JSON.parse(await readFile(options["--input"], "utf8")),
    );
  }
  if (!["review", "usage", "runs", "run"].includes(command))
    throw new Error("Unknown command. Use --help.");
  const base = new URL(env.NOSHASHI_REVIEW_API || DEFAULT_API);
  if (
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
    )
  )
    throw new Error("API must use HTTPS, except localhost development.");
  if (base.username || base.password || base.search || base.hash)
    throw new Error(
      "API URL must not contain credentials, a query or a fragment.",
    );
  const key = env.NOSHASHI_REVIEW_KEY;
  if (!key?.startsWith("nsh_review_"))
    throw new Error("Set NOSHASHI_REVIEW_KEY to a scoped Payment Review key.");
  let body,
    path = command === "usage" ? "usage" : "runs";
  if (command === "run") {
    if (!/^[a-f0-9-]{36}$/.test(options["--run-id"] ?? ""))
      throw new Error("Supply --run-id UUID.");
    path += `/${options["--run-id"]}`;
  }
  if (command === "review") {
    if (
      !options["--input"] ||
      !/^[A-Za-z0-9._:-]{8,128}$/.test(options["--request-id"] ?? "")
    )
      throw new Error(
        "Supply --input and a request ID of 8–128 letters, digits, dots, colons, dashes or underscores.",
      );
    const text = await readFile(options["--input"], "utf8");
    if (Buffer.byteLength(text) > 65536)
      throw new Error("Input must be smaller than 64 KB.");
    body = options["--input"].toLowerCase().endsWith(".csv")
      ? parseCsv(text)
      : JSON.parse(text);
    if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 25)
      throw new Error("Supply 1–25 payment rows.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70000);
  let result;
  try {
    const response = await fetcher(`${base.href.replace(/\/$/, "")}/${path}`, {
      method: body ? "POST" : "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body
          ? {
              "Content-Type": "application/json",
              "Idempotency-Key": options["--request-id"],
            }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    result = await response.json();
    if (!response.ok)
      throw new Error(
        `Request failed (${response.status}): ${String(result.error ?? "Service unavailable").slice(0, 300)}`,
      );
    if (result.status === "processing")
      throw new Error(
        `Run ${result.id} is still processing. Retry the identical request ID or retrieve this run; do not start a duplicate.`,
      );
    if (result.result?.reports) verifyReceipt(result);
  } catch (e) {
    if (controller.signal.aborted)
      throw new Error(
        "Timed out. Retry the identical input and request ID; the server may have saved the result.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (options["--output"]) {
    await writeFile(
      options["--output"],
      JSON.stringify(result, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    return { saved: options["--output"], id: result.id };
  }
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2))
    .then((result) =>
      process.stdout.write(JSON.stringify(result, null, 2) + "\n"),
    )
    .catch((error) => {
      process.stderr.write(
        String(error.message).replaceAll(
          process.env.NOSHASHI_REVIEW_KEY || "__no_key__",
          "[REDACTED]",
        ) + "\n",
      );
      process.exitCode = 1;
    });
}

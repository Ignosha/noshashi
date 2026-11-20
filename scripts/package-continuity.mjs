// Packages Continuity's operator copy (tools/continuity/) as a download:
// site/downloads/noshashi-continuity.zip, plus its SHA-256 in
// site/downloads/noshashi-continuity.zip.sha256.
//
//   node scripts/package-continuity.mjs
//
// The zip is byte-for-byte reproducible: entries are in a fixed order with a
// fixed timestamp, so the same sources always give the same checksum and
// anyone can rebuild it from the repository and compare. scripts/build-site.mjs
// runs it (through build-products.mjs) so the page and the file never drift.
//
// No dependency: a minimal ZIP writer (deflate via node:zlib).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "tools", "continuity");
export const CONTINUITY_ZIP = "downloads/noshashi-continuity.zip";
const DIR = "noshashi-continuity/";

const README = `NOSHASHI Continuity
===================

Checks that one issued-token deposit on the XRP Ledger was credited to your
customer exactly once: right destination, issuer, currency and amount, and
exactly one posted credit in your own books.

It runs on your own computer, next to your accounting database:
  - the payment is read from two public XRP Ledger Mainnet servers
    (s1.ripple.com and s2.ripple.com) and both answers must agree;
  - your credits are read from your database, read-only, by a small server
    that listens on 127.0.0.1 only and is never reachable from the network;
  - nothing is sent to NOSHASHI. No account, no key, no signing.

Requirements
------------
Python 3.8 or newer (standard library only; nothing to install) and a modern
browser. Works on macOS, Linux and Windows.

1. Give it your credits
-----------------------
Your database must be SQLite and contain a table or view named
continuity_credits with these text columns, one row per posted credit:

  tx_hash   the deposit's 64-character transaction hash
  amount    the credited amount as a decimal string, e.g. "25" or "1250.5"
  issuer    the token issuer's r-address
  currency  the currency code as you store it, e.g. "RLUSD" or "USD"

example-view.sql shows how to create that view from your own tables. Keep
duplicates: a deposit credited twice must appear twice, that is what
Continuity is there to catch. Use your authoritative, up-to-date database;
replica lag is outside what this tool can see.

2. Start it
-----------
macOS / Linux:   ./start.sh /path/to/accounting.sqlite
Windows:         start.bat C:\\path\\to\\accounting.sqlite

Then open http://127.0.0.1:8765 in your browser.

3. Check a deposit
------------------
Paste the deposit's transaction hash, tick "Read fresh credits from the local
accounting adapter", and press "Verify with two servers". The report lists
every check as PASS, FAIL or UNKNOWN with the ledger index and hash, and
"Export evidence" saves it as a JSON file for your records or your auditor.

Issued tokens only (RLUSD, EUR, any IOU). XRP payments are refused with a
reason, never passed.

Verify this download
--------------------
The SHA-256 of noshashi-continuity.zip is published at
https://www.noshashi.app/continuity/ and the zip can be rebuilt from the
public source with: node scripts/package-continuity.mjs
Source: https://github.com/Ignosha/noshashi/tree/main/tools/continuity

Read-only. Not legal, compliance, audit or accounting advice. MIT licence
(see LICENSE). Questions: institutions@noshashi.app
`;

const EXAMPLE_SQL = `-- Continuity reads one table or view: continuity_credits(tx_hash, amount, issuer, currency).
-- Create it over your own ledger of posted credits. Adjust the table and column
-- names on the right-hand side to match your schema; keep the names on the left.
-- Amounts must be decimal text (not floats), one row per posted credit, and
-- duplicates must be kept.

CREATE VIEW IF NOT EXISTS continuity_credits AS
SELECT
  CAST(deposit_tx_hash AS TEXT) AS tx_hash,
  CAST(credited_amount AS TEXT) AS amount,
  CAST(token_issuer    AS TEXT) AS issuer,
  CAST(token_currency  AS TEXT) AS currency
FROM customer_credits
WHERE status = 'posted';

-- Check it: this should list each posted credit for one deposit.
-- SELECT * FROM continuity_credits WHERE tx_hash = '<64-character hash>';
`;

const START_SH = `#!/bin/sh
# NOSHASHI Continuity: serve the checker on http://127.0.0.1:8765 next to your
# accounting database (read-only). Usage: ./start.sh /path/to/accounting.sqlite
set -e
if [ -z "$1" ] || [ ! -f "$1" ]; then
  echo "Usage: ./start.sh /path/to/accounting.sqlite (an existing SQLite file)" >&2
  exit 2
fi
# Resolve the database path before moving to this folder.
DB="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
cd "$(dirname "$0")"
PY=python3
command -v "$PY" >/dev/null 2>&1 || PY=python
command -v "$PY" >/dev/null 2>&1 || { echo "Python 3 is required: https://www.python.org/downloads/" >&2; exit 1; }
exec "$PY" credit_source.py "$DB"
`;

const START_BAT = `@echo off\r
rem NOSHASHI Continuity: serve the checker on http://127.0.0.1:8765 next to your\r
rem accounting database (read-only). Usage: start.bat C:\\path\\to\\accounting.sqlite\r
if "%~1"=="" (\r
  echo Usage: start.bat C:\\path\\to\\accounting.sqlite\r
  exit /b 2\r
)\r
rem Resolve the database path before moving to this folder.\r
set "DB=%~f1"\r
cd /d "%~dp0"\r
where py >nul 2>nul && (py -3 credit_source.py "%DB%" & exit /b)\r
where python >nul 2>nul && (python credit_source.py "%DB%" & exit /b)\r
echo Python 3 is required: https://www.python.org/downloads/\r
exit /b 1\r
`;

/** The files in the zip, in order, with their Unix modes. */
async function entries() {
  const read = (f) => readFile(path.join(SRC, f));
  return [
    { name: "README.txt", data: Buffer.from(README), mode: 0o644 },
    { name: "continuity.html", data: await read("continuity.html"), mode: 0o644 },
    { name: "continuity.js", data: await read("continuity.js"), mode: 0o644 },
    { name: "credit_source.py", data: await read("credit_source.py"), mode: 0o644 },
    { name: "start.sh", data: Buffer.from(START_SH), mode: 0o755 },
    { name: "start.bat", data: Buffer.from(START_BAT), mode: 0o644 },
    { name: "example-view.sql", data: Buffer.from(EXAMPLE_SQL), mode: 0o644 },
    { name: "LICENSE", data: await readFile(path.join(ROOT, "LICENSE")), mode: 0o644 },
  ];
}

// 2026-01-01 00:00, in MS-DOS date/time form; fixed so the zip is reproducible.
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** A ZIP archive of the given entries, all under DIR, deflated. */
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(DIR + f.name);
    const body = zlib.deflateRawSync(f.data, { level: 9 });
    const crc = zlib.crc32(f.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE((3 << 8) | 20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(f.data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((0o100000 | f.mode) << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** Builds the zip; returns { bytes, sha256, size, files }. */
export async function buildContinuityPackage() {
  const files = await entries();
  const bytes = zip(files);
  return { bytes, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), size: bytes.length, files: files.map((f) => DIR + f.name) };
}

/** Writes the zip and its checksum under site/. */
export async function writeContinuityPackage(siteDir = path.join(ROOT, "site")) {
  const pkg = await buildContinuityPackage();
  const file = path.join(siteDir, CONTINUITY_ZIP);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, pkg.bytes);
  await writeFile(file + ".sha256", `${pkg.sha256}  noshashi-continuity.zip\n`);
  return pkg;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = await writeContinuityPackage();
  console.log(`site/${CONTINUITY_ZIP}  ${pkg.size} bytes  sha256 ${pkg.sha256}`);
}

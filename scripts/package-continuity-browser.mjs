import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zip } from "./package-continuity.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const build = path.join(root, "dist-continuity-browser");
const site = path.join(root, "site");
const rehearsal = path.join(site, "continuity-rehearsal");
const archiveName = "noshashi-continuity-browser.zip";

const readme = `NOSHASHI Continuity — browser demonstration\n\n` +
  `To start, open a terminal in the extracted noshashi-continuity-browser folder.\n` +
  `Run: python3 -m http.server 1430 --bind 127.0.0.1\n` +
  `Then open http://127.0.0.1:1430/ in a modern browser. Windows: use py -3 if python3 is unavailable.\n\n` +
  `Use Recorded payment to review archived XRPL evidence and verify the exported receipt.\n` +
  `Use RLUSD intelligence to inspect a historical issuer snapshot. Wallet handoff uses a simulated provider.\n` +
  `The rehearsal works without an internet connection. The optional general workspace can read public XRPL nodes.\n` +
  `Read-only. No signing, custody or transaction submission. This ZIP contains a browser build.\n` +
  `Sources and licence: https://github.com/Ignosha/noshashi\n`;

const landing = `<!doctype html>
<html lang="en" data-theme="dark">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>NOSHASHI Continuity browser demo</title>
<style>
@font-face{font-family:Instrument Serif;src:url('./fonts/instrument-serif-400-latin.woff2') format('woff2');font-display:swap}
*{box-sizing:border-box}body{margin:0;background:#111110;color:#efede7;font:16px/1.55 system-ui,sans-serif}
main{max-width:46rem;margin:auto;padding:clamp(32px,8vw,100px) 20px}header{padding:0 0 16px;border-bottom:1px solid #494840}
h1{font:400 clamp(48px,9vw,84px)/.95 'Instrument Serif',Georgia,serif;margin:20px 0}p{color:#c3c0b6}
a{color:inherit}a:focus-visible{outline:2px solid #e5c283;outline-offset:4px}.actions{display:flex;flex-wrap:wrap;gap:12px;margin:26px 0}
.actions a{min-height:44px;display:inline-flex;align-items:center;border:1px solid #605d52;padding:8px 16px;text-decoration:none}
.actions a:first-child{background:#efede7;color:#111110}
</style></head>
<body><main><header>NOSHASHI LABS / LEDGER DESK</header>
<h1>Continuity browser demo</h1>
<p>Review a recorded XRP Ledger payment, verify its evidence receipt and rehearse a simulated change in payment conditions.</p>
<nav aria-label="Continuity demo options" class="actions"><a href="./continuity/demo/index.html">Start the guided demo</a><a href="./continuity/index.html">Open the review workspace</a></nav>
<p>The guided demo works offline. Opening the review workspace lets you make read-only requests to public XRPL nodes.</p>
</main></body></html>\n`;

async function collectFiles(dir, prefix = "") {
  const files = [];
  const items = await readdir(dir, { withFileTypes: true });
  items.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  for (const entry of items) {
    const name = prefix + entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(full, name + "/"));
    else if (entry.isFile()) files.push({ name, data: await readFile(full), mode: 0o644 });
  }
  return files;
}

const files = await collectFiles(build);
for (const name of ["continuity/index.html", "continuity/demo/index.html"]) {
  const entry = files.find(file => file.name === name);
  if (!entry || !entry.data.toString().includes("../assets/") || /(?:src|href)="\/(?:assets|fonts)\//.test(entry.data.toString())) {
    throw new Error(`Build the portable Continuity entry ${name} with a relative Vite base.`);
  }
}
files.push(
  { name: "index.html", data: Buffer.from(landing), mode: 0o644 },
  { name: "README.txt", data: Buffer.from(readme), mode: 0o644 },
  { name: "LICENSE", data: await readFile(path.join(root, "LICENSE")), mode: 0o644 },
);
const archive = zip(files, "noshashi-continuity-browser/");
const checksum = createHash("sha256").update(archive).digest("hex");

await rm(rehearsal, { recursive: true, force: true });
for (const file of files) {
  const destination = path.join(rehearsal, file.name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, file.data);
}
const download = path.join(site, "downloads", archiveName);
await mkdir(path.dirname(download), { recursive: true });
await writeFile(download, archive);
await writeFile(download + ".sha256", `${checksum}  ${archiveName}\n`);
console.log(`${archiveName} · ${archive.length} bytes · SHA-256 ${checksum}`);

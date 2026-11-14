import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = "site/academy/app";
async function files(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? files(path + "/" + e.name) : [path + "/" + e.name],
      ),
    )
  ).flat();
}
const selected = (await files(root))
  .filter(
    (path) =>
      path.endsWith("/index.html") ||
      (/\/(assets)\//.test(path) && /\.(js|css|woff2)$/.test(path)) ||
      /\/(manifest.webmanifest|app-icon.svg)$/.test(path),
  )
  .sort();
const template = await readFile("academy/sw.js", "utf8");
const hash = createHash("sha256").update(template);
let precacheBytes = 0;
for (const path of selected) {
  hash.update(path.slice(root.length));
  const content = await readFile(path);
  hash.update(content);
  precacheBytes += content.byteLength;
}
const version = hash.digest("hex").slice(0, 20);
const precache = selected.map(
  (path) => "/academy/app" + path.slice(root.length),
);
await writeFile(
  root + "/sw.js",
  template
    .replace("__ACADEMY_BUILD__", version)
    .replace("__ACADEMY_PRECACHE__", JSON.stringify(precache)),
);
await writeFile(
  root + "/build-version.json",
  JSON.stringify({
    schema: "academy.build.v1",
    version,
    precacheFiles: precache.length,
    precacheBytes,
  }) + "\n",
);
console.log(
  `Academy atomic cache ${version}: ${precache.length} core/workstation assets; no progress storage changes.`,
);

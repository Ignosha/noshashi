import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const root = "continuity/src-tauri/";
const config = JSON.parse(readFileSync(root + "tauri.conf.json", "utf8"));
const cap = JSON.parse(readFileSync(root + "capabilities/default.json", "utf8"));
const cargo = readFileSync(root + "Cargo.toml", "utf8");
const rust = readFileSync(root + "src/main.rs", "utf8");
assert.equal(config.identifier, "app.noshashi.continuity");
assert.equal(config.build.frontendDist, "../../dist-continuity");
assert.equal(config.build.beforeBuildCommand, "npm --prefix .. run continuity:build");
assert.equal(config.app.windows.length, 1);
assert.equal(config.app.windows[0].url, "continuity/index.html");
assert.equal(config.app.withGlobalTauri, false);
assert.deepEqual(cap.windows, ["main"]);
assert.deepEqual(cap.permissions, ["core:default"]);
assert.match(cargo, /name = "noshashi-continuity"/);
assert.doesNotMatch(rust, /invoke_handler|plugin\(|sign|submit|shell/i);
assert.match(config.app.security.csp, /wss:\/\/s1\.ripple\.com/);
assert.doesNotMatch(config.app.security.csp, /unsafe-eval|https:\/\/\*/);
for (const icon of config.bundle.icon) {
  assert.ok(existsSync(root + icon), "missing desktop icon: " + icon);
}
console.log("Continuity isolated desktop configuration: static checks passed.");

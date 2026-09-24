import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import boundary from "../boundary.json";
import { containsLedgerSeed, isLedgerSeed, SecretInMessageError } from "@/lib/agent/secrets";
import { chatStream } from "@/lib/agent/client";

/**
 * The trust boundary is published (the app's TRUST & SECURITY scene and
 * the website's /trust/ page). These tests are what make it true rather
 * than aspirational: each checkable claim is checked against the code
 * the page says it covers.
 */

/** The code the published scope names. Anything else is out of scope. */
const COVERED = ["src", "src-tauri/src", "api", "supabase/functions", "site/assets"];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name === "__live__" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|rs)$/.test(name)) out.push(full);
  }
  return out;
}

const files = COVERED.flatMap((root) => walk(root)).map((file) => ({ file, text: readFileSync(file, "utf8") }));

/** Every XRPL command the covered code sends, with where. */
function commandsUsed(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  const add = (cmd: string, file: string) => used.set(cmd, [...(used.get(cmd) ?? []), file]);
  for (const { file, text } of files) {
    // rpc("x", …) and rippleRpc("x", …) — not Supabase's `.rpc(`.
    for (const m of text.matchAll(/(?<![.\w])(?:rpc|rippleRpc)\(\s*"([a-z_]+)"/g)) add(m[1], file);
    // WebSocket frames and JSON-RPC bodies.
    for (const m of text.matchAll(/\b(?:command|method)\s*:\s*"([a-z_]+)"/g)) add(m[1], file);
    // The NFT offers reader passes its command through a helper.
    for (const m of text.matchAll(/\bask\(\s*"([a-z_]+)"\s*\)/g)) add(m[1], file);
  }
  return used;
}

describe("the published scope is the scope tested", () => {
  it("names every covered root", () => {
    for (const root of ["src/", "src-tauri/", "site/", "api/", "supabase/functions/"]) expect(boundary.scope).toContain(root);
  });

  it("covers real code (a scan of nothing would prove nothing)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.file.startsWith("supabase/functions/noshashi-verify"))).toBe(true);
    expect(files.some((f) => f.file.startsWith("src-tauri/src"))).toBe(true);
  });
});

describe("NO SIGNING · NO BROADCAST", () => {
  it("no covered file sends a signing or submit command", () => {
    const hits: string[] = [];
    for (const { file, text } of files) {
      for (const cmd of boundary.forbiddenCommands) {
        const re = new RegExp(`(?:(?<![.\\w])(?:rpc|rippleRpc)\\(\\s*|\\b(?:command|method)\\s*:\\s*|\\bask\\(\\s*)["']${cmd}["']`);
        if (re.test(text)) hits.push(`${file}: ${cmd}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("every XRPL command the code sends is on the published read-only list", () => {
    const used = commandsUsed();
    expect(used.size).toBeGreaterThan(8);
    const unlisted = [...used.keys()].filter((cmd) => !boundary.readCommands.includes(cmd));
    expect(unlisted, JSON.stringify(Object.fromEntries([...used].filter(([c]) => unlisted.includes(c))))).toEqual([]);
  });

  it("the published list names no command the code does not use", () => {
    const used = commandsUsed();
    expect(boundary.readCommands.filter((cmd) => !used.has(cmd))).toEqual([]);
  });
});

describe("NO PRIVATE KEYS", () => {
  it("no covered file imports a wallet or key-pair library", () => {
    const hits: string[] = [];
    for (const { file, text } of files) {
      for (const pkg of boundary.forbiddenPackages) {
        const q = pkg.replace(/[.*+?^${}()|[\]\\/@]/g, "\\$&");
        if (new RegExp(`(?:from\\s+|import\\(\\s*|require\\(\\s*)["'](?:npm:)?${q}(?:@[^"'/]*)?(?:/[^"']*)?["']`).test(text)) hits.push(`${file}: ${pkg}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("VALIDATED STATE", () => {
  it("every ledger-state read asks for the validated ledger or a validated range", () => {
    // tx is judged by its own `validated` flag (see settlement.ts);
    // server_info, fee and subscribe describe the server, not the ledger.
    const exempt = new Set(["tx", "server_info", "fee", "subscribe"]);
    const unpinned: string[] = [];
    for (const { file, text } of files) {
      for (const m of text.matchAll(/(?<![.\w])(?:rpc|rippleRpc)\(\s*"([a-z_]+)"\s*,\s*\{/g)) {
        if (exempt.has(m[1])) continue;
        let depth = 0;
        let end = m.index! + m[0].length - 1;
        for (; end < text.length; end += 1) {
          if (text[end] === "{") depth += 1;
          else if (text[end] === "}" && --depth === 0) break;
        }
        const body = text.slice(m.index!, end + 1);
        if (!/ledger_index:\s*"validated"|ledger_index_min:\s*-1/.test(body)) unpinned.push(`${file}: ${m[1]}`);
      }
    }
    expect(unpinned).toEqual([]);
  });

  it("the helper-driven NFT reads are pinned too", () => {
    const nft = readFileSync("src/lib/desk/nft.ts", "utf8");
    expect(nft).toMatch(/rpc\(command, \{ nft_id: rights\.tokenId, ledger_index: "validated" \}\)/);
  });
});

describe("the model itself", () => {
  it("every stage points at files that exist and a scene the app has", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    for (const stage of boundary.stages) {
      for (const where of stage.where) expect(existsSync(where), where).toBe(true);
      expect(app, stage.scene).toContain(`| "${stage.scene}"`);
    }
    expect(boundary.stages.map((s) => s.label)).toEqual([
      "XRPL MAINNET",
      "VALIDATED STATE",
      "NORMALIZATION",
      "ANALYSIS",
      "POLICY ENGINE",
      "DECISION",
      "EVIDENCE",
      "CRYPTOGRAPHIC RECEIPT",
    ]);
  });

  it("the mainnet stage names every server the app connects to", () => {
    const link = readFileSync("src/lib/xrpl/link.ts", "utf8");
    const hosts = [...link.matchAll(/"wss:\/\/([a-z0-9.]+)"/g)].map((m) => m[1]);
    expect(hosts.length).toBeGreaterThan(1);
    for (const host of hosts) expect(boundary.stages[0].detail).toContain(host);
  });

  it("claims no certification or compliance anywhere but the sentence that disclaims them", () => {
    const { limits, ...claims } = boundary;
    const text = JSON.stringify(claims);
    expect(text).not.toMatch(/certif|SOC ?2|ISO ?27001|compliant|guarantee|unhackable|bank-grade|military-grade/i);
    expect(limits.join(" ")).toMatch(/no security certification/);
  });
});

describe("secrets never reach a model", () => {
  // Published XRPL documentation vectors: the genesis account's seed
  // (from "masterpassphrase") and the Ed25519 seed in xrpl.org's
  // wallet_propose example. Both are public and hold nothing.
  const FAMILY = "snoPBrXtMeMyMHUVTgbuqAfg1SUTb";
  const ED25519 = "sEdTM1uX8pu2do5XvTnutH6HsouMaM2";

  it("recognises both seed kinds by checksum, and nothing that merely looks like one", async () => {
    expect(await isLedgerSeed(FAMILY)).toBe(true);
    expect(await isLedgerSeed(ED25519)).toBe(true);
    expect(await isLedgerSeed("snoPBrXtMeMyMHUVTgbuqAfg1SUTc")).toBe(false); // one character off
    expect(await isLedgerSeed("rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh")).toBe(false); // an address
    expect(await containsLedgerSeed(`my seed is ${FAMILY}, is this account safe?`)).toBe(true);
    expect(await containsLedgerSeed("Check rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh and tx 017808F0426766661E431C513918AC8FA75B744ED33DBD83E0987DC60A9C24CE")).toBe(false);
    expect(await containsLedgerSeed("settlement status is stable and supported")).toBe(false);
  });

  describe("chatStream", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("refuses before any request is made", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      await expect(
        chatStream({
          config: { providerId: "ollama", baseUrl: "http://localhost:11434", model: "m" } as never,
          messages: [{ role: "user", content: `use ${ED25519}` }],
          onToken: () => {},
        })
      ).rejects.toBeInstanceOf(SecretInMessageError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

describe("the website's /trust/ page is the same model", () => {
  const page = readFileSync("site/trust/index.html", "utf8");
  const text = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  it("renders every stage, boundary, data flow and limit from boundary.json", () => {
    for (const s of boundary.stages) {
      expect(page).toContain(text(s.label));
      expect(page).toContain(text(s.detail));
    }
    for (const b of boundary.boundaries) expect(page).toContain(text(b.claim));
    for (const f of boundary.dataFlows) expect(page).toContain(text(f.party));
    for (const l of boundary.limits) expect(page).toContain(text(l));
    expect(page).toContain(boundary.readCommands.join(" · "));
  });

  it("is in the sitemap and linked from every page's footer", () => {
    expect(readFileSync("site/sitemap.xml", "utf8")).toContain("/trust/</loc>");
    expect(readFileSync("api/_lib/shell.js", "utf8")).toContain('{ href: "/trust/", label: "Trust & security" }');
  });
});

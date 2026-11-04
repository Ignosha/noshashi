import { describe, expect, it, vi } from "vitest";
import { encode } from "ripple-binary-codec";
import { softwareInventory, scanDependencies } from "../dependencyExposure";
import { treasuryModel, treasuryDrill } from "../treasuryScenario";
import {
  READINESS_CHECKS,
  assessReadiness,
  encryptReadiness,
  decryptReadiness,
  type ReadinessPlan,
} from "../readiness";
import {
  readLedgerIntegrity,
  compareIntegrity,
  INTEGRITY_NODES,
} from "../ledgerIntegrity";
import {
  evidenceRecord,
  parseWorkflowJson,
  publicSource,
} from "../workflowEvidence";
const address = "rLdhU5DKrpztzVPnQmtzAbHfiHR8LPYtaX";
const inventory = [
  {
    id: "signer",
    name: "xrpl",
    version: "4.0.0",
    workflow: "Private treasury label",
  },
];
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200 });
const plan = (): ReadinessPlan => ({
  schema: "noshashi-readiness-v1",
  ownerRole: "Operations lead",
  backupRole: "Risk lead",
  contactUrl: "https://example.com/contact",
  contactCheckedAt: "2026-11-04T00:00:00Z",
  contactCheckAcknowledged: true,
  checks: Object.fromEntries(
    READINESS_CHECKS.map((k) => [k, true]),
  ) as ReadinessPlan["checks"],
});
describe("owner-supplied dependency exposure", () => {
  it("requires consent before any request and rejects ranges/duplicates", async () => {
    const request = vi.fn();
    await expect(scanDependencies(inventory, false, request)).rejects.toThrow(
      "Approve",
    );
    expect(request).not.toHaveBeenCalled();
    expect(() =>
      softwareInventory([{ ...inventory[0], version: "^4.0.0" }]),
    ).toThrow("exact");
    expect(() => softwareInventory([...inventory, ...inventory])).toThrow(
      "unique",
    );
  });
  it("sends only package names/versions and preserves advisory provenance", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        json({ results: [{ vulns: [{ id: "GHSA-example" }] }] }),
      )
      .mockResolvedValueOnce(
        json({
          id: "GHSA-example",
          modified: "2026-11-01T00:00:00Z",
          summary: "Check upstream",
          withdrawn: "2026-11-02T00:00:00Z",
          references: [
            { url: "https://example.com/advisory" },
            { url: "http://localhost/" },
          ],
        }),
      );
    const r = await scanDependencies(inventory, true, request);
    expect(r.complete).toBe(true);
    expect(r.advisories[0].withdrawn).toBeTruthy();
    expect(r.advisories[0].references).toEqual([
      "https://example.com/advisory",
    ]);
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      queries: [
        { package: { name: "xrpl", ecosystem: "npm" }, version: "4.0.0" },
      ],
    });
    expect(request.mock.calls[0][1].credentials).toBe("omit");
  });
  it("keeps no-result snapshots distinct from security clearance", async () => {
    const r = await scanDependencies(inventory, true, async () =>
      json({ results: [{}] }),
    );
    expect(r.assets[0].advisoryIds).toEqual([]);
    expect(r).not.toHaveProperty("safe");
  });
  it("marks pagination and failed details incomplete", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          results: [
            { vulns: [{ id: "GHSA-example" }], next_page_token: "more" },
          ],
        }),
      )
      .mockRejectedValueOnce(Error("offline"));
    const r = await scanDependencies(inventory, true, request);
    expect(r.complete).toBe(false);
    expect(r.detailsUnavailable).toEqual(["GHSA-example"]);
    expect(r.assets[0].incomplete).toBe(true);
  });
  it("rejects missing, invalid and oversized responses", async () => {
    for (const value of [{}, { results: [] }, { results: [{ vulns: "bad" }] }])
      await expect(
        scanDependencies(inventory, true, async () => json(value)),
      ).rejects.toThrow();
    await expect(
      scanDependencies(
        inventory,
        true,
        async () => new Response("x".repeat(1048577)),
      ),
    ).rejects.toThrow("1 MiB");
  });
  it("bounds unavailable service calls", async () => {
    vi.useFakeTimers();
    try {
      const run = scanDependencies(
        inventory,
        true,
        async (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () =>
              reject(Error("aborted")),
            ),
          ),
      );
      const assertion = expect(run).rejects.toThrow("20-second");
      await vi.advanceTimersByTimeAsync(20001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
describe("local treasury dependency model", () => {
  const model = () =>
    treasuryModel({
      quorum: 2,
      actors: [
        {
          id: "a",
          kind: "signer",
          weight: 1,
          groups: ["same-custodian"],
          verified: false,
        },
        {
          id: "b",
          kind: "signer",
          weight: 1,
          groups: ["same-custodian"],
          verified: false,
        },
        {
          id: "c",
          kind: "signer",
          weight: 1,
          groups: ["other"],
          verified: true,
        },
      ],
    });
  it("separates compromise from outage and exposes a shared dependency", () => {
    const r = treasuryDrill(model(), ["same-custodian"], ["same-custodian"]);
    expect(r).toMatchObject({
      scenarioCanAuthorize: true,
      scenarioCanOperate: false,
      assumptionsVerified: false,
      compromisedWeight: 2,
      survivingWeight: 1,
      sharedGroups: ["same-custodian"],
    });
  });
  it("models direct keys as quorum bypasses and impossible quorum as null", () => {
    const m = treasuryModel({
      quorum: 3,
      actors: [
        {
          id: "regular",
          kind: "regular",
          weight: 1,
          groups: ["device"],
          verified: true,
        },
      ],
    });
    expect(treasuryDrill(m, ["device"], [])).toMatchObject({
      directCompromise: true,
      scenarioCanAuthorize: true,
      minimumConfiguredSigners: null,
    });
  });
  it("rejects duplicate ids, unknown groups and invalid weights", () => {
    const m = model();
    expect(() => treasuryDrill(m, ["invented"], [])).toThrow();
    expect(() =>
      treasuryModel({ ...m, actors: [m.actors[0], m.actors[0]] }),
    ).toThrow();
    expect(() => treasuryModel({ ...m, quorum: 0 })).toThrow();
  });
});
describe("encrypted response procedures", () => {
  it("labels owner assertions and stale/future contacts as gaps", () => {
    expect(
      assessReadiness(plan(), Date.parse("2026-11-04T12:00:00Z")).status,
    ).toBe("checklist_complete");
    expect(
      assessReadiness(
        { ...plan(), contactCheckedAt: "2026-12-01" },
        Date.parse("2026-11-04"),
      ).status,
    ).toBe("review_gaps");
    expect(
      assessReadiness(
        { ...plan(), backupRole: plan().ownerRole },
        Date.parse("2026-11-04"),
      ).gaps,
    ).not.toEqual([]);
  });
  it("roundtrips only with the right passphrase, uses fresh salt/IV and detects tampering", async () => {
    const phrase = "A separate long notebook passphrase";
    const a = await encryptReadiness(plan(), phrase);
    const b = await encryptReadiness(plan(), phrase);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(JSON.stringify(a)).not.toContain(plan().ownerRole);
    expect(await decryptReadiness(a, phrase)).toEqual(plan());
    await expect(
      decryptReadiness(a, "Incorrect long passphrase here"),
    ).rejects.toThrow("integrity");
    await expect(
      decryptReadiness(
        { ...a, ciphertext: a.ciphertext.slice(0, -4) + "AAAA" },
        phrase,
      ),
    ).rejects.toThrow();
    await expect(
      decryptReadiness({ ...a, iterations: 1 }, phrase),
    ).rejects.toThrow("KDF");
  }, 15000);
  it("rejects unsafe contacts and short passphrases", async () => {
    await expect(
      encryptReadiness(
        { ...plan(), contactUrl: "https://user:password@example.com" },
        "Long enough passphrase",
      ),
    ).rejects.toThrow("HTTPS");
    await expect(encryptReadiness(plan(), "short")).rejects.toThrow("14");
  });
});
describe("same-scope ledger endpoint evidence", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const hash = "A".repeat(64);
  const binary = encode({
    LedgerEntryType: "AccountRoot",
    Account: address,
    Flags: 0,
    Sequence: 1,
    Balance: "1000000",
    OwnerCount: 0,
    PreviousTxnID: "B".repeat(64),
    PreviousTxnLgrSeq: 9,
  });
  const request = async (_node: string, command: string) =>
    command === "ledger"
      ? {
          validated: true,
          ledger_hash: hash,
          ledger_index: 10,
          ledger: { close_time: now / 1000 - 946684800 },
        }
      : {
          validated: true,
          ledger_hash: hash,
          ledger_index: 10,
          node_binary: binary,
        };
  it("hashes identical account bytes at the same ledger identically", async () => {
    const r = await readLedgerIntegrity(address, request, now);
    expect(r.status).toBe("agreed");
    expect(new Set(r.nodes.map((n) => n.sha256)).size).toBe(1);
    expect(r.nodes.every((n) => n.nodeBinary === binary)).toBe(true);
  });
  it("marks missing endpoints partial and different payloads disagreement", async () => {
    expect(
      (
        await readLedgerIntegrity(
          address,
          async (n, c) => {
            if (n === INTEGRITY_NODES[0]) throw Error("offline");
            return request(n, c);
          },
          now,
        )
      ).status,
    ).toBe("partial");
    const other = encode({
      LedgerEntryType: "AccountRoot",
      Account: address,
      Flags: 0,
      Sequence: 2,
      Balance: "1000000",
    });
    expect(
      (
        await readLedgerIntegrity(
          address,
          async (n, c) => ({
            ...(await request(n, c)),
            ...(c === "ledger_entry" && n === INTEGRITY_NODES[0]
              ? { node_binary: other }
              : {}),
          }),
          now,
        )
      ).status,
    ).toBe("disagreement");
  });
  it("never compares a different hash/index/account or malformed binary as a pass", async () => {
    for (const bad of [
      { ledger_hash: "C".repeat(64) },
      { ledger_index: 11 },
      { node_binary: "00" },
      {
        node_binary: encode({
          LedgerEntryType: "AccountRoot",
          Account: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
        }),
      },
    ]) {
      const r = await readLedgerIntegrity(
        address,
        async (n, c) => ({
          ...(await request(n, c)),
          ...(c === "ledger_entry" ? bad : {}),
        }),
        now,
      );
      expect(r.status).toBe("insufficient");
    }
  });
  it("rejects stale anchors and duplicate endpoints", async () => {
    await expect(
      readLedgerIntegrity(
        address,
        async (n, c) => ({
          ...(await request(n, c)),
          ledger: { close_time: 1 },
        }),
        now,
      ),
    ).rejects.toThrow("fresh");
    expect(
      compareIntegrity({ hash, index: 10, closeTime: 1 }, [
        { node: "a", status: "unavailable" },
        { node: "a", status: "unavailable" },
      ]),
    ).toBe("insufficient");
  });
});
describe("evidence boundaries", () => {
  it("binds hashes to scope and canonical payload", async () => {
    expect((await evidenceRecord("a", { x: 1, y: 2 })).sha256).toBe(
      (await evidenceRecord("a", { y: 2, x: 1 })).sha256,
    );
    expect((await evidenceRecord("b", { x: 1, y: 2 })).sha256).not.toBe(
      (await evidenceRecord("a", { x: 1, y: 2 })).sha256,
    );
  });
  it("never executes input and rejects secrets, oversize and private routes", async () => {
    await expect(parseWorkflowJson('{"private_key":"secret"}')).rejects.toThrow(
      "secrets",
    );
    await expect(parseWorkflowJson("x".repeat(131073))).rejects.toThrow("128");
    await expect(parseWorkflowJson("process.exit()")).rejects.toThrow("JSON");
    for (const url of [
      "http://example.com",
      "https://127.0.0.1",
      "https://localhost",
      "https://example.internal",
    ])
      expect(() => publicSource(url)).toThrow();
  });
});

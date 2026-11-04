import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSetting } from "@/lib/store";
import { saveTextFile } from "@/lib/export";
import { isValidAddress, shortAddress } from "@/lib/xrpl/client";
import {
  readSecurityPosture,
  type SecurityPosture,
} from "@/lib/security/hardening";
import {
  controlSnapshot,
  compareControls,
  isControlSnapshot,
  signingResilience,
  type ControlSnapshot,
} from "@/lib/security/controls";
import { canonical } from "@/lib/compliance/registry";
import { planFor, type PlanId } from "@/lib/billing/catalog";
import tools from "@/lib/security/tools.json";
import { cn } from "@/lib/utils";

export function SecurityDesk({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <section
      className="security-desk space-y-6"
      aria-label="Security workflow directory"
    >
      <div className="security-masthead grid gap-6 border-y border-border py-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="mono-font text-xs tracking-widest text-muted-foreground">
            01 / PREVENT · 02 / INVESTIGATE · 03 / OPERATE
          </p>
          <h2 className="display mt-3 text-4xl font-normal">
            Find the control.
            <br />
            <em>Keep the evidence.</em>
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Public-ledger checks for wallet owners, treasury operators and
            incident reviewers. Start with signing authority, inspect a proposed
            payment, then preserve evidence if something changed.
          </p>
          <Button className="mt-4" onClick={() => onOpen("control")}>
            MAP SIGNING CONTROLS →
          </Button>
        </div>
        <svg
          viewBox="0 0 420 180"
          role="img"
          aria-label="Security workflow: public ledger facts lead to control review, human approval and preserved evidence"
          className="w-full self-center text-foreground"
        >
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <path
              d="M25 90H390M90 55V135M210 35V155M330 55V135"
              opacity=".35"
            />
            <circle cx="90" cy="90" r="35" />
            <circle cx="210" cy="90" r="54" />
            <circle cx="330" cy="90" r="35" />
            <path d="m198 89 9 10 18-20" strokeWidth="2" />
          </g>
          <g
            fill="currentColor"
            fontSize="11"
            fontFamily="monospace"
            textAnchor="middle"
          >
            <text x="90" y="95">
              READ
            </text>
            <text x="330" y="95">
              RECORD
            </text>
            <text x="210" y="17">
              HUMAN REVIEW
            </text>
            <text x="210" y="176">
              NO KEYS · NO CUSTODY
            </text>
          </g>
        </svg>
      </div>
      <p className="max-w-4xl border-l-2 border-border pl-4 text-sm leading-relaxed text-muted-foreground">
        NOSHASHI cannot reverse validated XRP payments, seize funds, secure a
        compromised device or enforce your wallet’s signing policy. It supplies
        checks, evidence and owner-reviewed options. Recovery may depend on a
        verified custodian, token issuer or legal process; outcomes are not
        guaranteed.
      </p>
      <section
        aria-labelledby="security-introduction"
        className="border-y border-border py-6"
      >
        <p className="mono-font text-xs tracking-widest text-muted-foreground">
          NEW / INSTITUTIONAL SECURITY WORKFLOWS · BETA
        </p>
        <h3 id="security-introduction" className="display mt-3 text-3xl">
          Prepare. Compare. Respond.
        </h3>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Trace shared signing dependencies, compare ledger evidence, check
          software advisories and prepare an encrypted response notebook.
          Reviewed sharing adds source-backed indicators after organization
          verification and backend setup.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tools
            .filter((t) =>
              [
                "contingency",
                "integrity",
                "dependencies",
                "readiness",
                "sharing",
              ].includes(t.id),
            )
            .map((t) => (
              <button
                key={t.id}
                onClick={() => onOpen(t.id)}
                className="border border-border p-4 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
              >
                <span className="mono-font text-xs text-muted-foreground">
                  {planFor(t.plan as PlanId).name} ·{" "}
                  {t.id === "sharing" ? "SETUP REQUIRED" : "BETA"}
                </span>
                <span className="mt-2 block text-base">{t.title} →</span>
                <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                  {t.detail}
                </span>
              </button>
            ))}
        </div>
      </section>
      {(["protect", "investigate", "operate"] as const).map((group, i) => (
        <section key={group} aria-label={group}>
          <div className="mb-3 flex items-baseline gap-3 border-b border-border pb-2">
            <span className="mono-font text-xs text-muted-foreground">
              0{i + 1}
            </span>
            <h3 className="display text-2xl capitalize">{group}</h3>
            <span className="ml-auto text-xs text-muted-foreground">
              P0 safety → P3 scale
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tools
              .filter(
                (t) =>
                  t.group === group &&
                  ![
                    "contingency",
                    "integrity",
                    "dependencies",
                    "readiness",
                    "sharing",
                  ].includes(t.id),
              )
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpen(t.id)}
                  className="security-tool group border border-border bg-card p-4 text-left transition-colors hover:border-foreground/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
                >
                  <span className="mono-font flex justify-between gap-3 text-[11px] tracking-wider text-muted-foreground">
                    <span>
                      {t.priority} / {group.toUpperCase()}
                    </span>
                    <span>{planFor(t.plan as PlanId).name}</span>
                  </span>
                  <h4 className="mt-4 text-base font-medium text-foreground">
                    {t.title}{" "}
                    <svg
                      aria-hidden="true"
                      className="float-right"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path d="M3 3h10v10M3 13 13 3" />
                    </svg>
                  </h4>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                    {t.detail}
                  </p>
                </button>
              ))}
          </div>
        </section>
      ))}
    </section>
  );
}

export function SigningMap({ posture: p }: { posture: SecurityPosture }) {
  const paths = [
    {
      name: "Master key",
      value: p.masterEnabled ? "Can sign alone" : "Disabled",
      enabled: p.masterEnabled,
    },
    {
      name: "Regular key",
      value: p.regularKey ? shortAddress(p.regularKey) : "Not configured",
      enabled: Boolean(p.regularKey),
    },
    {
      name: "Signer quorum",
      value: p.signerList
        ? `${p.signerList.quorum} weight / ${p.signerList.signers.length} addresses`
        : "Not configured",
      enabled: Boolean(p.signerList),
    },
  ];
  return (
    <figure className="border border-border bg-card p-4">
      <svg
        viewBox="0 0 620 225"
        className="w-full"
        role="img"
        aria-label={`Signing control paths for ${p.address}: ${paths.map((x) => `${x.name}: ${x.value}`).join("; ")}`}
      >
        {paths.map((x, i) => (
          <g key={x.name} opacity={x.enabled ? 1 : 0.5}>
            <path
              d={`M270 ${40 + i * 73}H355V113H418`}
              fill="none"
              stroke="currentColor"
              strokeDasharray={x.enabled ? undefined : "4 5"}
            />
            <rect
              x="12"
              y={12 + i * 73}
              width="258"
              height="56"
              fill="none"
              stroke="currentColor"
            />
            <text x="26" y={33 + i * 73} fill="currentColor" fontSize="13">
              {x.name}
            </text>
            <text
              x="26"
              y={53 + i * 73}
              fill="currentColor"
              fontSize="11"
              fontFamily="monospace"
            >
              {x.value}
            </text>
          </g>
        ))}
        <circle cx="502" cy="113" r="77" fill="none" stroke="currentColor" />
        <circle
          cx="502"
          cy="113"
          r="69"
          fill="none"
          stroke="currentColor"
          opacity=".3"
        />
        <text
          x="502"
          y="108"
          textAnchor="middle"
          fill="currentColor"
          fontSize="13"
        >
          ACCOUNT CONTROL
        </text>
        <text
          x="502"
          y="130"
          textAnchor="middle"
          fill="currentColor"
          fontSize="11"
          fontFamily="monospace"
        >
          {shortAddress(p.address)}
        </text>
      </svg>
      <figcaption className="text-xs leading-relaxed text-muted-foreground">
        Solid paths are configured; dashed paths are absent or disabled. Master
        and regular keys can bypass the signer list when enabled. A ledger
        setting does not prove who holds a key, whether an HSM protects it, or
        whether signer custodians are independent.
      </figcaption>
    </figure>
  );
}

export function ControlLab({
  initial,
  drift = false,
}: {
  initial?: string;
  drift?: boolean;
}) {
  const [address, setAddress] = useState(initial ?? "");
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="security-control-lab max-w-5xl space-y-4">
      <div>
        <p className="mono-font text-xs tracking-widest text-muted-foreground">
          {drift
            ? "CONTROL-CHANGE COMPARISON / PRO"
            : "SIGNING CONTROLS / FREE"}
        </p>
        <h2 className="display mt-2 text-3xl">
          {drift
            ? "What changed since your reference?"
            : "Which signing paths remain active?"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {drift
            ? "Save a local public-control reference and compare it with a newer validated-ledger read. A change is a review trigger, not proof of an attacker."
            : "Map current authority, then remove signer addresses from a local scenario to see whether quorum survives. No transaction is constructed, signed or submitted."}
        </p>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !isValidAddress(address.trim())) return;
          setBusy(true);
          setError(null);
          setPosture(null);
          try {
            const p = await readSecurityPosture(address.trim());
            if (!p.exists)
              throw Error("No funded account was found at this address.");
            setPosture(p);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Read unavailable.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="min-w-0 flex-1 text-xs text-muted-foreground">
          Public XRPL address
          <Input
            aria-label="Security account address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mono-font mt-1"
            placeholder="r…"
            spellCheck={false}
          />
        </label>
        <Button
          className="self-end"
          disabled={busy || !isValidAddress(address.trim())}
        >
          {busy ? "READING…" : "READ CONTROLS"}
        </Button>
      </form>
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          Reading current controls and bounded recent history…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-no-go">
          {error} Use Read controls to retry.
        </p>
      )}
      {posture && (
        <div className="space-y-4">
          <p className="mono-font text-xs text-muted-foreground">
            Validated ledger {posture.ledgerIndex.toLocaleString()} · recent
            history{" "}
            {posture.historyAvailable === false
              ? "unavailable"
              : posture.historyComplete
                ? "complete within returned range"
                : "limited"}
          </p>
          <SigningMap posture={posture} />
          {drift ? (
            <DriftComparison key={posture.address} posture={posture} />
          ) : (
            <QuorumDrill
              key={`${posture.address}:${posture.ledgerIndex}`}
              posture={posture}
            />
          )}
        </div>
      )}
    </section>
  );
}

function QuorumDrill({ posture: p }: { posture: SecurityPosture }) {
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const r = signingResilience(p, unavailable);
  return (
    <section
      className="border border-border p-4"
      aria-label="Signer unavailability drill"
    >
      <h3 className="text-lg">Signer unavailability drill</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Select addresses assumed unavailable. This models the signer list only;
        it does not test possession of keys or nested signer-account controls.
      </p>
      {p.signerList ? (
        <fieldset className="mt-4 space-y-3">
          <legend className="mb-2 text-xs text-muted-foreground">
            Unavailable signer addresses
          </legend>
          {p.signerList.signers.map((s) => (
            <label key={s.account} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={unavailable.includes(s.account)}
                onChange={(e) =>
                  setUnavailable((v) =>
                    e.target.checked
                      ? [...v, s.account]
                      : v.filter((a) => a !== s.account),
                  )
                }
              />
              <span className="mono-font break-all text-xs">{s.account}</span>
              <span className="ml-auto whitespace-nowrap">
                weight {s.weight}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="mt-3 text-sm">No signer list is configured.</p>
      )}
      <div
        role="status"
        aria-live="polite"
        className="mt-4 border-t border-border pt-4"
      >
        <p
          className={cn(
            "text-lg",
            r.quorumReachable ? "text-foreground" : "text-hold",
          )}
        >
          {r.quorum === null
            ? "No quorum to test"
            : `${r.weight} remaining weight / ${r.quorum} required · ${r.quorumReachable ? "QUORUM REACHABLE" : "QUORUM UNREACHABLE"}`}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {r.directPaths
            ? `${r.directPaths} direct key path(s) remain configured independently of this scenario. The signer list is not the only authority path.`
            : "No direct master or regular-key path was reported. Test signing independently before changing any key configuration."}
        </p>
      </div>
    </section>
  );
}

function DriftComparison({ posture: p }: { posture: SecurityPosture }) {
  const [saved, setSaved, hydrated] = useSetting<ControlSnapshot | null>(
    `security-control-reference-v1:${p.address}`,
    null,
  );
  const [note, setNote] = useState("");
  const current = controlSnapshot(p);
  let changes: ReturnType<typeof compareControls> | null = null;
  let warning = "";
  if (saved)
    try {
      changes = compareControls(saved, current);
    } catch (e) {
      warning = e instanceof Error ? e.message : "Reference unreadable.";
    }
  return (
    <section className="border border-border p-4">
      <h3 className="text-lg">Local control reference</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        A device-local reference is editable and is not an independent audit
        trail. Persistence depends on this device’s storage. Exported SHA-256
        hashes identify exact evidence bytes; they are not signatures.
      </p>
      {!hydrated ? (
        <p role="status">Loading reference…</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setSaved(current);
                setNote(
                  "Current controls selected as the local reference. Compare after reading a newer ledger.",
                );
              }}
            >
              USE CURRENT AS REFERENCE
            </Button>
            {saved && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSaved(null);
                  setNote("Local reference cleared.");
                }}
              >
                CLEAR REFERENCE
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const payload = {
                    scope: "noshashi-control-comparison-v1",
                    reference: isControlSnapshot(saved) ? saved : null,
                    current,
                    changes,
                    comparisonStatus: changes ? "compared" : "not_compared",
                    comparisonNote:
                      warning ||
                      (saved
                        ? "Compared control fields only; not a compromise clearance."
                        : "No local reference was selected."),
                    limitations: [
                      "Local reference is editable",
                      "Public-node reads do not independently verify consensus",
                      "Changes do not prove compromise",
                    ],
                  };
                  const bytes = canonical(payload);
                  const hash = await crypto.subtle.digest(
                    "SHA-256",
                    new TextEncoder().encode(bytes),
                  );
                  const digest = Array.from(new Uint8Array(hash), (b) =>
                    b.toString(16).padStart(2, "0"),
                  ).join("");
                  setNote(
                    await saveTextFile(
                      `noshashi-controls-${p.address}.json`,
                      JSON.stringify(
                        {
                          payload,
                          digest,
                          canonicalization: "recursive sorted-key JSON / UTF-8",
                        },
                        null,
                        2,
                      ),
                      "application/json",
                    ),
                  );
                } catch (e) {
                  setNote(
                    e instanceof Error ? e.message : "Export unavailable.",
                  );
                }
              }}
            >
              EXPORT COMPLETE EVIDENCE
            </Button>
          </div>
          {warning && (
            <p role="alert" className="mt-3 text-sm text-hold">
              {warning}
            </p>
          )}
          {changes && (
            <div className="mt-4">
              <p role="status" className="text-sm">
                {changes.length
                  ? `${changes.length} changed control field(s). Review whether each was authorized.`
                  : "No compared control fields changed. This is not a compromise clearance."}
              </p>
              <ul className="mt-3 space-y-3">
                {changes.map((c) => (
                  <li
                    key={c.field}
                    className="border-t border-border pt-2 text-sm"
                  >
                    <strong>{c.field}</strong>
                    <pre className="mono-font mt-1 whitespace-pre-wrap break-all text-xs text-muted-foreground">
                      {JSON.stringify(c.before)} → {JSON.stringify(c.after)}
                    </pre>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {note && (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </section>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBilling } from "@/lib/billing/useEntitlements";
import { isValidAddress } from "@/lib/xrpl/client";
import { saveTextFile } from "@/lib/export";
import {
  evidenceRecord,
  parseWorkflowJson,
} from "@/lib/security/workflowEvidence";
import {
  DEFAULT_TREASURY_POLICY,
  treasuryPolicy,
  formatDrops,
  reviewTreasuryProposal,
  type TreasuryPolicy,
} from "@/lib/security/treasury";
import {
  useTreasuryGuard,
  saveTreasuryWatch,
  pauseTreasuryWatch,
  pollTreasury,
  reviewTreasuryAlert,
  testTreasuryNotification,
  reloadTreasuryState,
} from "@/lib/security/treasuryStore";
export function TreasuryGuardTab({
  onOpen,
}: {
  onOpen: (view: string, address?: string) => void;
}) {
  const state = useTreasuryGuard();
  const { has } = useBilling();
  const limit = has("asset_recovery") ? 50 : 3;
  const [address, setAddress] = useState("");
  const [policy, setPolicy] = useState<TreasuryPolicy>({
    ...DEFAULT_TREASURY_POLICY,
  });
  const [allowlist, setAllowlist] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState("");
  const [review, setReview] = useState<ReturnType<
    typeof reviewTreasuryProposal
  > | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action unavailable.");
    } finally {
      setBusy(false);
    }
  };
  const update = (patch: Partial<TreasuryPolicy>) => {
    setPolicy((p) => ({ ...p, ...patch }));
    setReview(null);
  };
  const active = state.watches.filter((w) => w.enabled).length;
  return (
    <section className="security-desk max-w-6xl space-y-6" aria-label="Treasury Guard">
      <header>
        <p className="mono-font text-xs tracking-widest text-muted-foreground">
          TREASURY GUARD / LOCAL MONITORING BETA
        </p>
        <h2 className="display mt-3 text-4xl">
          Flag the movement.
          <br />
          <em>Ask the operator.</em>
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Bank-style review alerts for large XRP outflows, unlisted
          destinations, a large share of the account balance and transfers split
          across wallets. A flag asks for investigation; it does not prove theft
          or reveal who owns an address.
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          [
            "01 / BEFORE SIGNING",
            "Check an unsigned direct-XRP proposal against your saved limits. This is advisory; the signer must enforce its own holds and approvals.",
          ],
          [
            "02 / AFTER VALIDATION",
            "Read public history approximately once a minute while the app is open. New watches start at the next successful validated-ledger baseline.",
          ],
          [
            "03 / HUMAN RESPONSE",
            "Mark a flag expected or not recognized. Preserve evidence and open incident/hardening tools. A local review never authorizes a payment or reverses XRP.",
          ],
        ].map(([title, detail]) => (
          <article key={title} className="border border-border p-4">
            <h3 className="mono-font text-xs">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {detail}
            </p>
          </article>
        ))}
      </div>
      <div role="status" className="border-y border-border py-3 text-sm">
        {state.busy
          ? "WORKING — read or local save in progress"
          : `${active} enabled local watch(es)`}{" "}
        · {limit} addresses on your plan · Notifications:{" "}
        {state.notification ?? "not tested"}
        <p className="mt-2 text-xs text-muted-foreground">
          Notifications go to this device/user, subject to OS permission and
          focus settings. “Submitted” does not confirm delivery or reading. No
          automatic owner email, SMS, background service or live-price USD
          estimate is configured here.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={
            busy || state.busy || !state.loaded || !active || !!state.error
          }
          onClick={() =>
            void run(async () => {
              await pollTreasury(limit);
              setNotice(
                "Read attempt finished. Inspect each watch’s coverage and errors below; a successful connection is not a clearance.",
              );
            })
          }
        >
          READ WATCHES NOW
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await testTreasuryNotification();
              setNotice(
                `Notification test: ${result}. Check your OS/device; this is not a real payment alert.`,
              );
            })
          }
        >
          ENABLE / TEST DEVICE NOTIFICATIONS
        </Button>
      </div>
      <section
        className="border border-border p-5"
        aria-labelledby="treasury-policy-title"
      >
        <h3 id="treasury-policy-title" className="display text-2xl">
          Your account. Your review limits.
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Free: three local watches. Pro and above: fifty. Limits are in XRP,
          not dollars. No seeds, wallet connections or signing permissions.
        </p>
        <fieldset
          className="mt-4 space-y-4"
          disabled={busy || state.busy || !state.loaded}
        >
          <label className="block text-sm">
            Account you operate or are authorized to monitor
            <Input
              aria-label="Treasury source account"
              className="mono-font mt-2"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setAuthorized(false);
                setReview(null);
              }}
            />
          </label>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm">
              Single outflow limit (XRP)
              <Input
                className="mt-2"
                value={policy.singleXrp}
                onChange={(e) => update({ singleXrp: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Rolling outflow limit (XRP)
              <Input
                className="mt-2"
                value={policy.windowXrp}
                onChange={(e) => update({ windowXrp: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Window (minutes, 1–1,440)
              <Input
                className="mt-2"
                type="number"
                min={1}
                max={1440}
                value={policy.windowMinutes}
                onChange={(e) =>
                  update({ windowMinutes: Number(e.target.value) })
                }
              />
            </label>
            <label className="text-sm">
              Split-transfer destination count
              <Input
                className="mt-2"
                type="number"
                min={2}
                max={50}
                value={policy.distinctDestinations}
                onChange={(e) =>
                  update({ distinctDestinations: Number(e.target.value) })
                }
              />
            </label>
            <label className="text-sm">
              Share of pre-transfer balance (%)
              <Input
                className="mt-2"
                type="number"
                min={1}
                max={100}
                value={policy.balancePercent}
                onChange={(e) =>
                  update({ balancePercent: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="block text-sm">
            Allowlisted destinations (one public address per line)
            <textarea
              aria-label="Treasury allowlisted destinations"
              className="mono-font mt-2 min-h-24 w-full border border-border bg-background p-3 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
              maxLength={7500}
              value={allowlist}
              onChange={(e) => {
                setAllowlist(e.target.value);
                setReview(null);
              }}
            />
          </label>
          <label className="flex gap-3 text-sm">
            <input
              type="checkbox"
              checked={policy.flagUnlisted}
              onChange={(e) => update({ flagUnlisted: e.target.checked })}
            />
            Flag destinations outside this list, including small payments.
          </label>
          <label className="flex gap-3 text-sm">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            I operate this account or have permission to monitor it. This
            acknowledgment is not independent ownership verification.
          </label>
          <Button
            disabled={
              !authorized || !isValidAddress(address.trim()) || !!state.error
            }
            onClick={() =>
              void run(async () => {
                const p = treasuryPolicy({
                  ...policy,
                  allowlist: allowlist.split(/\s+/).filter(Boolean),
                });
                await saveTreasuryWatch(
                  {
                    address: address.trim(),
                    policy: p,
                    enabled: true,
                    authorized: true,
                  },
                  limit,
                );
                setNotice(
                  "Watch and rules saved locally. The first successful read establishes the starting ledger; earlier history is not automatically scanned.",
                );
              })
            }
          >
            SAVE LOCAL WATCH AND RULES
          </Button>
        </fieldset>
      </section>
      {state.watches.length > limit && (
        <p role="alert" className="text-sm text-hold">
          Only the first {limit} configured watches are eligible on your current
          plan. Remaining accounts are not monitored.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {state.watches.map((w, index) => {
          const m = state.monitors[w.address];
          return (
            <article
              key={w.address}
              className="min-w-0 border border-border p-4"
            >
              <h3 className="mono-font break-all text-xs">{w.address}</h3>
              <p className="mt-3 text-sm">
                {index >= limit
                  ? "PLAN CAPACITY — NOT MONITORED"
                  : !w.enabled
                    ? "PAUSED"
                    : m?.error
                      ? "READ UNAVAILABLE"
                      : !m?.cursor
                        ? "AWAITING BASELINE"
                        : m.lastReadAt &&
                            Date.now() - Date.parse(m.lastReadAt) > 180000
                          ? "STALE READING — CHECK COVERAGE"
                          : !m.complete
                            ? "CATCHING UP — PARTIAL COVERAGE"
                            : m.gaps.length
                              ? "READ RETURNED — EVIDENCE GAPS REMAIN"
                              : "READ RETURNED — NO CLEARANCE IMPLIED"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Last successful read: {m?.lastReadAt ?? "none"} · ledger{" "}
                {m?.ledger ?? "unknown"}. Monitoring starts{" "}
                {m?.startedAt
                  ? new Date(m.startedAt).toISOString()
                  : "after a successful baseline"}
                . Only direct XRP Payments with complete debit evidence are
                quantified. Deletions and unsupported payment forms require
                review.
              </p>
              {m?.startedAt &&
                Date.now() - m.startedAt < w.policy.windowMinutes * 60000 && (
                  <p className="mt-2 text-xs text-hold">
                    Window warming up: earlier transfers are outside this
                    watch’s coverage.
                  </p>
                )}
              {m?.error && (
                <p role="alert" className="mt-2 text-sm text-no-go">
                  {m.error}
                </p>
              )}
              {m?.gaps.map((g) => (
                <p key={g} className="mt-2 text-xs text-hold">
                  Evidence gap: {g}
                </p>
              ))}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || state.busy}
                  onClick={() => {
                    setAddress(w.address);
                    setPolicy(w.policy);
                    setAllowlist(w.policy.allowlist.join("\n"));
                    setAuthorized(false);
                    setReview(null);
                  }}
                >
                  LOAD RULES
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || state.busy}
                  onClick={() => void run(() => pauseTreasuryWatch(w.address))}
                >
                  {w.enabled ? "PAUSE" : "RESUME"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpen("control", w.address)}
                >
                  SIGNING CONTROLS
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      <section className="border-t border-border pt-5">
        <h3 className="display text-2xl">Before signing: review a proposal.</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Select a saved watch using LOAD RULES, then paste an unsigned direct
          XRP Payment. Static limits do not check current balance, cumulative
          activity, threat lists or independent approvals. Use the existing
          Pre-sign and Enterprise Withdrawal tools for broader screening.
        </p>
        <label className="mt-3 block text-sm">
          Unsigned Payment JSON
          <textarea
            aria-label="Treasury unsigned proposal"
            className="mono-font mt-2 min-h-32 w-full border border-border bg-background p-3 text-xs"
            maxLength={131072}
            value={proposal}
            onChange={(e) => {
              setProposal(e.target.value);
              setReview(null);
            }}
          />
        </label>
        <Button
          className="mt-3"
          disabled={
            busy ||
            !proposal ||
            !state.watches.some((w) => w.address === address.trim())
          }
          onClick={() =>
            void run(async () => {
              const saved = state.watches.find(
                (w) => w.address === address.trim(),
              );
              if (!saved) throw Error("Save/select the source watch first.");
              setReview(
                reviewTreasuryProposal(
                  saved.address,
                  saved.policy,
                  (await parseWorkflowJson(proposal)) as Record<
                    string,
                    unknown
                  >,
                ),
              );
            })
          }
        >
          REVIEW AGAINST SAVED RULES
        </Button>
        {review && (
          <div role="status" className="mt-4 border border-border p-4">
            <p>
              {review.status === "review_required"
                ? "REVIEW REQUIRED — no enforced hold"
                : "NO STATIC RULE TRIGGERED — not an authorization"}
            </p>
            <ul className="mt-3 text-sm text-muted-foreground">
              {review.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
              {review.unchecked.map((r) => (
                <li key={r}>Not checked: {r}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs">{review.limitation}</p>
          </div>
        )}
        <div className="mt-3 flex gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpen("presign", address.trim())}
          >
            PRE-SIGN INSPECTION
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpen("withdrawal", address.trim())}
          >
            ENTERPRISE WITHDRAWAL SCREENING
          </Button>
        </div>
      </section>
      <section className="border-t border-border pt-5">
        <h3 className="display text-2xl">Payment review queue</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Latest 200 local findings. Review decisions are device-local notes,
          not authenticated owner approvals or immutable audit records. “Not
          recognized” is an allegation requiring investigation, not a theft
          finding.
        </p>
        {!state.alerts.length && (
          <p className="mt-4 text-sm">
            No local findings recorded. This does not establish complete
            coverage or safety.
          </p>
        )}
        {state.alerts.map((a) => (
          <article key={a.id} className="mt-3 border border-border p-4">
            <p className="mono-font text-xs text-hold">
              {a.review.toUpperCase().replace(/_/g, " ")} · VALIDATED PAYMENT
              EVIDENCE
            </p>
            <h4 className="mt-2 text-xl">{a.finding.title}</h4>
            <p className="mono-font mt-3 break-all text-xs">
              Source {a.address} · {formatDrops(a.finding.drops)} XRP · ledger{" "}
              {a.finding.ledger}
            </p>
            <p className="mt-2 text-sm">
              {a.finding.hashes.length} payment(s) ·{" "}
              {a.finding.destinations.length} destination(s) · observed{" "}
              {a.observedAt}
            </p>
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer">
                Inspect transaction hashes and named destinations
              </summary>
              <pre className="mono-font mt-2 overflow-auto whitespace-pre-wrap break-all">
                {JSON.stringify(
                  {
                    hashes: a.finding.hashes,
                    destinations: a.finding.destinations,
                    policy: a.policy,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || state.busy}
                onClick={() =>
                  void run(() => reviewTreasuryAlert(a.id, "expected"))
                }
              >
                EXPECTED — LOCAL NOTE
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || state.busy}
                onClick={() =>
                  void run(() => reviewTreasuryAlert(a.id, "not_recognized"))
                }
              >
                NOT RECOGNIZED — REVIEW
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpen("incident", a.address)}
              >
                OPEN INCIDENT EVIDENCE
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpen("emergency", a.address)}
              >
                CONTAINMENT CHECKLIST
              </Button>
            </div>
          </article>
        ))}
      </section>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const record = await evidenceRecord("treasury-review-export-v1", {
                watches: state.watches,
                monitors: state.monitors,
                alerts: state.alerts,
                exportedAt: new Date().toISOString(),
              });
              setNotice(
                await saveTextFile(
                  "noshashi-treasury-evidence.json",
                  JSON.stringify(record, null, 2),
                  "application/json",
                ),
              );
            })
          }
        >
          EXPORT COMPLETE LOCAL EVIDENCE
        </Button>
        <Button variant="outline" onClick={() => onOpen("guardian")}>
          KEY-CHANGE / HOSTED MONITORING OPTIONS
        </Button>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Validated XRP cannot be reversed or clawed back. Never share a seed. If
        a transfer is not recognized, independently verify signing authority and
        official recipient/custodian contacts before acting. Independent
        approvals, enforced holds, hosted notification recipients and
        incident-response commitments require a separately configured
        institutional integration; this local tool does not provide them.
      </p>
      {state.error && (
        <Button
          variant="outline"
          disabled={busy || state.busy}
          onClick={() => void run(reloadTreasuryState)}
        >
          RELOAD SAVED STATE — EXPORT UNSAVED EVIDENCE FIRST
        </Button>
      )}
      {(error || state.error) && (
        <p role="alert" className="text-sm text-no-go">
          {error || state.error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}
